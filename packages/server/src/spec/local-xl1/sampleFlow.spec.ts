import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import Path from 'node:path'

import { assertEx } from '@ariestools/sdk'
import type {
  SampleApi, SampleConfiguration as ClientConfiguration, SampleWallet,
} from '@xyo-network/autodrive-sample-client'
import {
  createSampleApi, resumeAnchor, storeAndAnchor,
} from '@xyo-network/autodrive-sample-client'
import type { SamplePayload } from '@xyo-network/autodrive-sample-protocol'
import {
  normalizeSampleData, normalizeSamplePayload, SAMPLE_SCHEMA,
} from '@xyo-network/autodrive-sample-protocol'
import {
  LOCAL_XL1_DEV_ACCOUNT_0_ADDRESS,
  LOCAL_XL1_DEV_MNEMONIC,
  localXl1RpcUrl,
} from '@xyo-network/dapp-kit-vitest-config'
import { HDWallet } from '@xyo-network/sdk'
import { GatewayBuilder } from '@xyo-network/xl1-sdk'
import {
  describe, expect, it,
} from 'vitest'

import type { SampleConfiguration } from '../../configuration.js'
import { startSampleApplication } from '../../index.js'
import { exerciseCompiledCli, exerciseDefaultLocalCli } from './compiledCli.js'

type RunningApplication = Awaited<ReturnType<typeof startSampleApplication>>
type StartOptions = Parameters<typeof startSampleApplication>[0]
type FlowResult = Awaited<ReturnType<typeof storeAndAnchor>>

interface ApplicationOwner { app?: RunningApplication }

/** A controlled storage boundary: real payload objects, no provider or Aries qualification. */
function createControlledStorage() {
  const stored = new Map<string, SamplePayload>()
  const writes: SamplePayload[] = []
  let reads = 0
  return {
    stored,
    writes,
    get reads() { return reads },
    storage: {
      identity: 'local-xl1-sample-spec',
      checkReady: () => Promise.resolve(),
      async get(hash: string) {
        reads++
        const value = stored.get(hash)
        return value === undefined ? undefined : structuredClone(value)
      },
      async insert(payload: SamplePayload) {
        const normalized = await normalizeSamplePayload(payload)
        if (stored.has(normalized.hash)) throw new Error('An already stored payload must not be uploaded again')
        const copy = structuredClone(normalized.payload)
        writes.push(copy)
        stored.set(normalized.hash, copy)
      },
    },
  }
}

type ControlledStorage = ReturnType<typeof createControlledStorage>

function apiAt(origin: string) {
  // Browsers attach Origin to mutation requests; the Node test adapter supplies that browser boundary.
  return createSampleApi(origin, async (input, options) => {
    const headers = new Headers(options?.headers)
    headers.set('Origin', origin)
    return await fetch(input, { ...options, headers })
  })
}

function createTestWallet(
  session: Awaited<ReturnType<GatewayBuilder['buildRunnerSession']>>,
  account: Awaited<ReturnType<typeof HDWallet.fromPhrase>>,
  origin: string,
  boundary: ControlledStorage,
  stages: string[],
) {
  const viewer = assertEx(session.gateway.connection.viewer, () => 'The local XL1 gateway must expose a viewer')
  const runner = assertEx(session.gateway.connection.runner, () => 'The local XL1 gateway must expose a runner')
  const signer = session.gateway.signer
  let broadcasts = 0
  const wallet: SampleWallet = {
    viewer,
    signer: {
      address: () => signer.address(),
      signTransaction: transaction => signer.signTransaction(transaction),
      // Use actual SDK signatures; inject only the invocation origin normally stamped by Chrome Wallet.
      signJwt: options => account.signJwt({ ...options, claims: { ...options.claims, origin } }),
    },
    runner: {
      async broadcastTransaction(transaction) {
        expect(boundary.writes).toHaveLength(1)
        expect(boundary.reads).toBeGreaterThan(0)
        expect(stages).toContain('storage-verified')
        broadcasts++
        return await runner.broadcastTransaction(transaction)
      },
    },
  }
  return {
    wallet,
    get broadcasts() { return broadcasts },
  }
}

async function assertInvalidPayload(origin: string, boundary: ControlledStorage) {
  const invalid = await fetch(`${origin}/api/store-intents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': origin },
    body: JSON.stringify({
      payload: {
        schema: SAMPLE_SCHEMA, data: {}, _hash: 'untrusted',
      },
    }),
  })
  expect(invalid.status).toBeGreaterThanOrEqual(400)
  expect(boundary.writes).toHaveLength(0)
}

async function assertSuccessfulFlow(result: FlowResult, boundary: ControlledStorage, stages: string[], api: SampleApi) {
  expect(result.inclusion).toBeDefined()
  expect(result.inclusion?.transactionHash).toBe(result.evidence.transactionHash)
  expect(stages.at(-1)).toBe('complete')
  expect(result.confirmation?.state).toBe('storage-verified')
  expect(result.evidence.transaction[0].payload_hashes).toEqual([result.normalized.hash])
  expect(result.evidence.transaction[0].payload_schemas).toEqual([SAMPLE_SCHEMA])
  expect(boundary.writes).toEqual([result.normalized.payload])
  expect(boundary.stored.has(result.evidence.transactionHash)).toBe(false)
  expect(await api.payload(result.normalized.hash)).toEqual(result.normalized)
}

async function confirmDuplicate(result: FlowResult, config: ClientConfiguration, wallet: SampleWallet, api: SampleApi) {
  const authorization = await wallet.signer.signJwt({
    audience: config.audience,
    schema: 'network.xyo.auth.signin',
    ttl: 300,
    claims: {
      purpose: 'autodrive-store',
      scope: 'payload:append',
      nonce: result.pending.intent.nonce,
      intentId: result.pending.intent.id,
      chainId: config.chainId,
      payloadHash: result.normalized.hash,
    },
  })
  const duplicate = await api.confirm(result.pending.intent.id, authorization.token, result.evidence)
  expect(duplicate.transactionHash).toBe(result.evidence.transactionHash)
  expect(duplicate.state).toBe('storage-verified')
  expect(await api.payload(result.normalized.hash)).toEqual(result.normalized)
}

async function recoverAndConfirm(owner: ApplicationOwner, options: StartOptions, result: FlowResult, wallet: SampleWallet) {
  const origin = assertEx(owner.app, () => 'The first app must be running').origin
  await owner.app?.close()
  owner.app = undefined
  owner.app = await startSampleApplication({ ...options, config: { ...options.config, origin } })
  expect(owner.app.origin).toBe(origin)
  const api = apiAt(origin)
  const config = await api.configuration()
  const retained = await api.intent(result.pending.intent.id)
  expect(retained.state).toBe('storage-verified')
  expect(retained.transactionHash).toBe(result.evidence.transactionHash)
  const resumed = await resumeAnchor({
    config,
    wallet,
    api,
    pending: result.pending,
    finalityTimeoutMs: 5000,
    pollIntervalMs: 250,
  })
  expect(resumed.inclusion).toEqual(result.inclusion)
  await confirmDuplicate(result, config, wallet, api)
}

describe('functional sample on the dapp-kit local XL1 chain', () => {
  it('starts the compiled local CLI with only an Auto Drive API key and no Aries configuration', async () => {
    await exerciseDefaultLocalCli()
  }, 90_000)

  it('starts the compiled local CLI without XL1 environment, serves fresh assets, and retains chain and ledger on restart', async () => {
    await exerciseCompiledCli()
  }, 150_000)

  it('authenticates, stores one payload, finalizes, retrieves, and recovers without a second upload', async () => {
    const stateDirectory = await mkdtemp(Path.join(tmpdir(), 'autodrive-sample-flow-'))
    const account = await HDWallet.fromPhrase(LOCAL_XL1_DEV_MNEMONIC)
    expect(account.address).toBe(LOCAL_XL1_DEV_ACCOUNT_0_ADDRESS.slice(2))
    const builder = new GatewayBuilder()
    const session = await builder.name('autodrive-functional-sample').rpcUrl(localXl1RpcUrl()).account(account).buildRunnerSession()
    const viewer = assertEx(session.gateway.connection.viewer, () => 'The local XL1 gateway must expose a viewer')
    const boundary = createControlledStorage()
    const config: SampleConfiguration = {
      allowedSigners: [account.address],
      audience: 'autodrive-local-sample-spec',
      chainId: await viewer.chainId(),
      limits: {
        accountDailyBytes: 4096,
        accountDailyWrites: 1,
        globalDailyBytes: 4096,
        globalDailyWrites: 1,
      },
      networkId: 'local-xl1',
      origin: 'http://127.0.0.1:0',
      transactionValidityBlocks: 500,
      writeEnabled: true,
    }
    const owner: ApplicationOwner = {}
    const options = {
      config, storage: boundary.storage, chain: viewer, stateDirectory,
    }
    try {
      owner.app = await startSampleApplication(options)
      const api = apiAt(owner.app.origin)
      const clientConfig = await api.configuration()
      const stages: string[] = []
      const observed = createTestWallet(session, account, owner.app.origin, boundary, stages)
      await assertInvalidPayload(owner.app.origin, boundary)
      const approved = await normalizeSampleData('{"message":"Stored from the functional sample","unicode":"é😀"}')
      const result = await storeAndAnchor({
        config: clientConfig,
        payloadText: approved.canonicalJson,
        wallet: observed.wallet,
        api,
        finalityTimeoutMs: 45_000,
        pollIntervalMs: 250,
        onProgress: (progress) => { stages.push(progress.stage) },
      })
      expect(result.normalized).toEqual(approved)
      await assertSuccessfulFlow(result, boundary, stages, api)
      expect(observed.broadcasts).toBe(1)
      await recoverAndConfirm(owner, options, result, observed.wallet)
      expect(boundary.writes).toHaveLength(1)
      expect(observed.broadcasts).toBe(1)
    } finally {
      try {
        await owner.app?.close()
      } finally {
        try {
          await session.stop()
        } finally {
          await rm(stateDirectory, { recursive: true, force: true })
        }
      }
    }
  }, 90_000)
})
