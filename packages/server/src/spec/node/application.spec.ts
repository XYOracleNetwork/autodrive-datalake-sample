import type { SamplePayload } from '@xyo-network/autodrive-sample-protocol'
import { normalizeSampleData, normalizeSamplePayload } from '@xyo-network/autodrive-sample-protocol'
import type { AccountInstance } from '@xyo-network/sdk'
import { Account } from '@xyo-network/sdk'
import type { ChainId } from '@xyo-network/xl1-sdk'
import {
  asChainId, asXL1BlockNumber, buildUnsignedTransaction, createSignedXl1TransactionEvidence, signTransaction,
} from '@xyo-network/xl1-sdk'
import {
  afterEach, describe, expect, it, vi,
} from 'vitest'

import { startSampleApplication } from '../../application.js'
import type { SampleConfiguration } from '../../configuration.js'
import { SampleError } from '../../errors.js'
import type { StoreIntent } from '../../ledger.js'

const CHAIN_ID = asChainId('0123456789abcdef0123456789abcdef01234567', true)
const OTHER_CHAIN_ID = asChainId('fedcba9876543210fedcba9876543210fedcba98', true)
const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map(close => close()))
})

function configuration(account: AccountInstance, origin = 'http://127.0.0.1:0'): SampleConfiguration {
  return {
    allowedSigners: [account.address],
    audience: 'offline-sample-admission',
    chainId: CHAIN_ID,
    limits: {
      accountDailyBytes: 16_384,
      accountDailyWrites: 4,
      globalDailyBytes: 16_384,
      globalDailyWrites: 4,
    },
    networkId: 'offline-local',
    origin,
    transactionValidityBlocks: 100,
    writeEnabled: true,
  }
}

function storageBoundary() {
  const stored = new Map<string, SamplePayload>()
  const writes: SamplePayload[] = []
  let readsAvailable = true
  let readinessChecks = 0
  let reads = 0
  return {
    writes,
    setReadsAvailable(value: boolean) { readsAvailable = value },
    get readinessChecks() { return readinessChecks },
    get reads() { return reads },
    storage: {
      identity: 'offline-admission-storage',
      async checkReady() { readinessChecks++ },
      async get(hash: string) {
        reads++
        if (!readsAvailable) throw new Error('Fixture storage read is unavailable')
        return stored.get(hash)
      },
      async insert(payload: SamplePayload) {
        const normalized = await normalizeSamplePayload(payload)
        writes.push(normalized.payload)
        stored.set(normalized.hash, normalized.payload)
      },
    },
  }
}

async function createFixture() {
  const account = await Account.random()
  const boundary = storageBoundary()
  let chainId: ChainId = CHAIN_ID
  let blockNumber = 20
  const chain = {
    chainId: async () => chainId,
    currentBlockNumber: async () => asXL1BlockNumber(blockNumber, true),
  }
  const app = await startSampleApplication({
    config: configuration(account), chain, storage: boundary.storage,
  })
  closers.push(() => app.close())
  const normalized = await normalizeSampleData('{"message":"offline admission"}')
  return {
    account,
    app,
    boundary,
    normalized,
    setBlockNumber(value: number) { blockNumber = value },
    setChainId(value: ChainId) { chainId = value },
  }
}

type Fixture = Awaited<ReturnType<typeof createFixture>>

async function post(fixture: Fixture, pathname: string, body: unknown, token?: string, origin = fixture.app.origin) {
  const headers = new Headers({ 'content-type': 'application/json', origin })
  if (token !== undefined) headers.set('authorization', `Bearer ${token}`)
  return await fetch(`${fixture.app.origin}${pathname}`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })
}

async function createIntent(fixture: Fixture) {
  const response = await post(fixture, '/api/store-intents', { payload: fixture.normalized.payload })
  expect(response.status).toBe(201)
  return await response.json() as StoreIntent
}

async function signedEvidence(fixture: Fixture, options: { badSignature?: boolean; chainId?: ChainId; exp?: number; extraPayload?: boolean } = {}) {
  const extra = await normalizeSampleData('{"message":"extra payload"}')
  const payloads = options.extraPayload === true ? [fixture.normalized.payload, extra.payload] : [fixture.normalized.payload]
  const unsigned = await buildUnsignedTransaction(
    options.chainId ?? CHAIN_ID,
    [],
    payloads,
    asXL1BlockNumber(10, true),
    asXL1BlockNumber(options.exp ?? 100, true),
    fixture.account.address,
  )
  const witness = await signTransaction(unsigned[0], fixture.account)
  if (options.badSignature === true) {
    const otherAccount = await Account.random()
    const otherWitness = await signTransaction({ ...unsigned[0], from: otherAccount.address }, otherAccount)
    // Keep a structurally valid signature from another signer so the server must verify cryptography.
    Object.assign(witness, { $signatures: otherWitness.$signatures })
  }
  return await createSignedXl1TransactionEvidence([witness, unsigned[1]])
}

async function authorization(fixture: Fixture, intent: StoreIntent, overrides: { audience?: string; nonce?: string; origin?: string } = {}) {
  const signed = await fixture.account.signJwt({
    audience: overrides.audience ?? fixture.app.config.audience,
    schema: 'network.xyo.auth.signin',
    ttl: 300,
    claims: {
      origin: overrides.origin ?? fixture.app.origin,
      purpose: 'autodrive-store',
      scope: 'payload:append',
      nonce: overrides.nonce ?? intent.nonce,
      intentId: intent.id,
      chainId: CHAIN_ID,
      payloadHash: fixture.normalized.hash,
    },
  })
  return signed.token
}

async function confirm(fixture: Fixture, intent: StoreIntent, token: string, evidence: unknown) {
  return await post(fixture, `/api/store-intents/${intent.id}/confirm`, { evidence }, token)
}

async function reconcile(fixture: Fixture, intent: StoreIntent, token: string, evidence: unknown) {
  return await post(fixture, `/api/store-intents/${intent.id}/reconcile`, { evidence }, token)
}

describe('offline HTTP admission with authentic SDK signatures', () => {
  it('rejects missing or malformed salt before creating an intent or accessing storage', async () => {
    const fixture = await createFixture()
    for (const salt of [undefined, '', 'invalid', 42]) {
      const response = await post(fixture, '/api/store-intents', { payload: { ...fixture.normalized.payload, salt } })
      expect(response.status).toBe(400)
    }
    expect(fixture.boundary.writes).toHaveLength(0)
    expect(fixture.boundary.reads).toBe(0)
  })

  it.each(['audience', 'origin', 'nonce', 'signature'] as const)('rejects invalid authorization %s before any upload', async (kind) => {
    const fixture = await createFixture()
    const intent = await createIntent(fixture)
    const evidence = await signedEvidence(fixture)
    const overrides = kind === 'audience'
      ? { audience: 'another-service' }
      : kind === 'origin' ? { origin: 'http://127.0.0.1:1' } : kind === 'nonce' ? { nonce: 'another-nonce' } : {}
    let token = await authorization(fixture, intent, overrides)
    if (kind === 'signature') {
      const parts = token.split('.')
      const differentlySigned = await authorization(fixture, intent, { nonce: 'different-signature-input' })
      parts[2] = differentlySigned.split('.', 3)[2] ?? ''
      token = parts.join('.')
    }

    const response = await confirm(fixture, intent, token, evidence)

    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ code: 'authentication' })
    expect(fixture.boundary.writes).toHaveLength(0)
  })

  it.each([
    {
      name: 'signature', options: { badSignature: true }, code: 'invalid-transaction',
    },
    {
      name: 'extra payload', options: { extraPayload: true }, code: 'payload-count',
    },
    {
      name: 'signed chain', options: { chainId: OTHER_CHAIN_ID }, code: 'wrong-chain',
    },
    {
      name: 'expired block window', options: { exp: 20 }, code: 'expired-transaction',
    },
    {
      name: 'oversized expiration window', options: { exp: 2000 }, code: 'transaction-expiry',
    },
  ])('rejects invalid transaction $name before any upload', async ({ options, code }) => {
    const fixture = await createFixture()
    const intent = await createIntent(fixture)
    const evidence = await signedEvidence(fixture, options)
    const token = await authorization(fixture, intent)

    const response = await confirm(fixture, intent, token, evidence)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code })
    expect(fixture.boundary.writes).toHaveLength(0)
  })

  it('detects a changed connected chain at confirmation, after startup readiness passed', async () => {
    const fixture = await createFixture()
    const intent = await createIntent(fixture)
    const evidence = await signedEvidence(fixture)
    const token = await authorization(fixture, intent)
    fixture.setChainId(OTHER_CHAIN_ID)

    const response = await confirm(fixture, intent, token, evidence)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'wrong-chain' })
    expect(fixture.boundary.writes).toHaveLength(0)
  })

  it('retains an ambiguous write and reconciles by reading without another upload', async () => {
    const fixture = await createFixture()
    const intent = await createIntent(fixture)
    const evidence = await signedEvidence(fixture)
    const token = await authorization(fixture, intent)
    fixture.boundary.setReadsAvailable(false)

    const first = await confirm(fixture, intent, token, evidence)
    const second = await confirm(fixture, intent, token, evidence)
    expect(first.status).toBe(409)
    expect(second.status).toBe(409)
    expect(await first.json()).toMatchObject({ code: 'storage-uncertain' })
    expect(fixture.boundary.writes).toEqual([fixture.normalized.payload])

    fixture.boundary.setReadsAvailable(true)
    const reconciled = await confirm(fixture, intent, token, evidence)
    expect(reconciled.status).toBe(200)
    expect(await reconciled.json()).toMatchObject({ state: 'storage-verified', transactionHash: evidence.transactionHash })
    expect(fixture.boundary.writes).toHaveLength(1)
  })

  it.each(['expired', 'writes-disabled'] as const)('reconciles a reserved upload when %s without another dispatch', async (condition) => {
    const fixture = await createFixture()
    const intent = await createIntent(fixture)
    const evidence = await signedEvidence(fixture)
    fixture.boundary.setReadsAvailable(false)
    const first = await confirm(fixture, intent, await authorization(fixture, intent), evidence)
    expect(first.status).toBe(409)
    expect(fixture.boundary.writes).toHaveLength(1)

    fixture.boundary.setReadsAvailable(true)
    if (condition === 'expired') fixture.setBlockNumber(evidence.exp)
    else fixture.app.config.writeEnabled = false
    const token = await authorization(fixture, intent)
    const prohibitedWrite = await confirm(fixture, intent, token, evidence)
    expect(prohibitedWrite.status).toBe(condition === 'expired' ? 400 : 403)

    const recovered = await reconcile(fixture, intent, token, evidence)
    expect(recovered.status).toBe(200)
    expect(await recovered.json()).toMatchObject({
      state: 'storage-verified', transactionHash: evidence.transactionHash, payloadHash: fixture.normalized.hash,
    })
    expect(fixture.boundary.writes).toHaveLength(1)
  })

  it('explains restart-required provider interruption and preserves read-only recovery without a second upload', async () => {
    const fixture = await createFixture()
    const intent = await createIntent(fixture)
    const evidence = await signedEvidence(fixture)
    const token = await authorization(fixture, intent)
    const interrupted = vi.spyOn(fixture.boundary.storage, 'get')
      .mockRejectedValueOnce(new SampleError('auto-drive-aborted', 'Provider client stopped', 503))

    const failed = await confirm(fixture, intent, token, evidence)

    expect(failed.status).toBe(503)
    const failure: unknown = await failed.json()
    expect(failure).toMatchObject({ code: 'storage-uncertain' })
    expect(failure).toHaveProperty('message', expect.stringContaining('Restart the sample'))
    interrupted.mockRestore()
    const recovered = await reconcile(fixture, intent, token, evidence)
    expect(recovered.status).toBe(200)
    expect(fixture.boundary.writes).toHaveLength(1)
  })

  it('does not create a reservation or access storage through reconciliation of a prepared intent', async () => {
    const fixture = await createFixture()
    const intent = await createIntent(fixture)
    const evidence = await signedEvidence(fixture)

    const response = await reconcile(fixture, intent, await authorization(fixture, intent), evidence)

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: 'intent-not-reserved' })
    expect(fixture.boundary.reads).toBe(0)
    expect(fixture.boundary.writes).toHaveLength(0)
  })

  it.each(['different-evidence', 'wrong-nonce'] as const)('requires the reserved evidence and fresh authorization for recovery: %s', async (condition) => {
    const fixture = await createFixture()
    const intent = await createIntent(fixture)
    const evidence = await signedEvidence(fixture)
    fixture.boundary.setReadsAvailable(false)
    const first = await confirm(fixture, intent, await authorization(fixture, intent), evidence)
    expect(first.status).toBe(409)
    const readsBefore = fixture.boundary.reads
    fixture.boundary.setReadsAvailable(true)
    const substituted = condition === 'different-evidence' ? await signedEvidence(fixture, { exp: 90 }) : evidence
    const token = await authorization(fixture, intent, condition === 'wrong-nonce' ? { nonce: 'another-nonce' } : {})

    const response = await reconcile(fixture, intent, token, substituted)

    expect(response.status).toBe(condition === 'different-evidence' ? 409 : 401)
    expect(fixture.boundary.reads).toBe(readsBefore)
    expect(fixture.boundary.writes).toHaveLength(1)
  })

  it('dispatches one upload for concurrent confirmations and gives a verifiable duplicate result', async () => {
    const fixture = await createFixture()
    const intent = await createIntent(fixture)
    const evidence = await signedEvidence(fixture)
    const token = await authorization(fixture, intent)

    const responses = await Promise.all([
      confirm(fixture, intent, token, evidence),
      confirm(fixture, intent, token, evidence),
    ])

    expect(responses.some(response => response.status === 200)).toBe(true)
    expect(responses.every(response => response.status === 200 || response.status === 409)).toBe(true)
    const duplicate = await confirm(fixture, intent, token, evidence)
    expect(duplicate.status).toBe(200)
    expect(await duplicate.json()).toMatchObject({ payloadHash: fixture.normalized.hash, state: 'storage-verified' })
    expect(fixture.boundary.writes).toEqual([fixture.normalized.payload])
  })

  it('requires the configured browser origin on mutations and does not accept localhost as an alias', async () => {
    const fixture = await createFixture()
    const wrongOrigin = fixture.app.origin.replace('127.0.0.1', 'localhost')

    const response = await post(fixture, '/api/store-intents', { payload: fixture.normalized.payload }, undefined, wrongOrigin)

    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ code: 'origin' })
    const accepted = await createIntent(fixture)
    expect(accepted.payloadHash).toBe(fixture.normalized.hash)
    expect(fixture.boundary.writes).toHaveLength(0)
  })

  it.each(['http://localhost:5173', 'https://127.0.0.1:5173'])('rejects unsupported local launch origin %s before dependency access', async (origin) => {
    const account = await Account.random()
    const boundary = storageBoundary()
    const chain = {
      chainId: async () => CHAIN_ID,
      currentBlockNumber: async () => asXL1BlockNumber(20, true),
    }

    await expect(startSampleApplication({
      config: configuration(account, origin), chain, storage: boundary.storage,
    })).rejects.toMatchObject({ code: 'configuration' })

    expect(boundary.readinessChecks).toBe(0)
    expect(boundary.writes).toHaveLength(0)
  })
})
