import {
  MAX_PAYLOAD_BYTES, normalizeSampleData, normalizeSamplePayload, SAMPLE_SCHEMA,
} from '@xyo-network/autodrive-sample-protocol'
import { Account, PayloadBuilder } from '@xyo-network/sdk'
import {
  asChainId, asSignedHydratedTransactionWithHashMeta, asXL1BlockNumber, signBoundWitness,
} from '@xyo-network/xl1-sdk'
import {
  describe, expect, it, vi,
} from 'vitest'

import { createSampleApi } from '../../api.js'
import type {
  FlowProgress, PendingOperation, SampleApi, SampleConfiguration, SampleWallet,
} from '../../contracts.js'
import { resumeAnchor, storeAndAnchor } from '../../flow.js'

const chainId = asChainId('4b43a753c8024c0e5000e8ac948ac0063ac624bc', true)
const config: SampleConfiguration = {
  audience: 'autodrive-sample',
  chainId,
  maxPayloadBytes: MAX_PAYLOAD_BYTES,
  networkId: 'sequence',
  origin: 'http://127.0.0.1:3456',
  schema: SAMPLE_SCHEMA,
  status: 'test',
  writeEnabled: true,
}

async function fixture() {
  const account = await Account.random()
  const normalized = await normalizeSampleData('{"message":"offline fault injection"}')
  const intent = {
    chainId,
    expiresAt: Date.now() + 300_000,
    id: 'offline-intent',
    nonce: 'offline-nonce',
    payloadHash: normalized.hash,
  }
  const wallet: SampleWallet = {
    runner: { broadcastTransaction: vi.fn<SampleWallet['runner']['broadcastTransaction']>(async transaction => await PayloadBuilder.hash(transaction[0])) },
    signer: {
      address: () => account.address,
      signJwt: async options => await account.signJwt({ ...options, claims: { ...options.claims, origin: config.origin } }),
      signTransaction: async transaction => asSignedHydratedTransactionWithHashMeta([
        await PayloadBuilder.addHashMeta(await signBoundWitness(transaction[0], account)),
        await PayloadBuilder.addHashMeta(transaction[1]),
      ], true),
    },
    viewer: {
      block: { blockByHash: async () => null, blockByTransactionHash: async () => null },
      chainId: () => chainId,
      currentBlockNumber: () => asXL1BlockNumber(10, true),
    },
  }
  const storageReply: SampleApi['confirm'] = async (intentId, token, evidence) => {
    const authorization = await Account.verifyJwt(token, { audience: config.audience })
    expect(authorization.ok).toBe(true)
    return {
      byteLength: normalized.byteLength,
      chainId,
      intentId,
      payloadHash: normalized.hash,
      signer: evidence.from,
      state: 'storage-verified',
      transactionHash: evidence.transactionHash,
      verifiedAt: Date.now(),
    }
  }
  const api: SampleApi = {
    configuration: async () => config,
    confirm: vi.fn(storageReply),
    reconcile: vi.fn(storageReply),
    createIntent: vi.fn(async () => intent),
    intent: async () => ({
      ...intent, byteLength: normalized.byteLength, state: 'reserved',
    }),
    payload: vi.fn(async () => normalized),
  }
  return {
    api, normalized, wallet,
  }
}

describe('shared wallet orchestration admission boundaries', () => {
  it('a rejected wallet signature causes zero storage confirmations and broadcasts', async () => {
    const test = await fixture()
    test.wallet.signer.signTransaction = vi.fn(async () => {
      throw new Error('User rejected signing')
    })
    await expect(storeAndAnchor({
      ...test, config, payloadText: JSON.stringify(test.normalized.payload),
    }))
      .rejects.toThrow('User rejected signing')
    expect(test.api.confirm).not.toHaveBeenCalled()
    expect(test.wallet.runner.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('a substituted storage confirmation cannot authorize broadcast', async () => {
    const test = await fixture()
    const confirm = test.api.confirm
    test.api.confirm = vi.fn<SampleApi['confirm']>(async (...args) => ({ ...await confirm(...args), intentId: 'other-intent' }))
    await expect(storeAndAnchor({
      ...test, config, payloadText: JSON.stringify(test.normalized.payload),
    }))
      .rejects.toThrow('Storage confirmation does not match')
    expect(test.api.confirm).toHaveBeenCalledOnce()
    expect(test.wallet.runner.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('fresh read-back corruption prevents broadcast even after server verification', async () => {
    const test = await fixture()
    const wrong = await normalizeSampleData('{"message":"different content"}')
    test.api.payload = vi.fn(async () => wrong)
    await expect(storeAndAnchor({
      ...test, config, payloadText: JSON.stringify(test.normalized.payload),
    }))
      .rejects.toThrow('Fresh storage retrieval does not match')
    expect(test.api.confirm).toHaveBeenCalledOnce()
    expect(test.wallet.runner.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('a changed wallet chain refuses admission before requesting an intent', async () => {
    const test = await fixture()
    test.wallet.viewer.chainId = () => asChainId('0000000000000000000000000000000000000000', true)
    await expect(storeAndAnchor({
      ...test, config, payloadText: JSON.stringify(test.normalized.payload),
    }))
      .rejects.toThrow('Wallet network changed')
    expect(test.api.createIntent).not.toHaveBeenCalled()
    expect(test.api.confirm).not.toHaveBeenCalled()
    expect(test.wallet.runner.broadcastTransaction).not.toHaveBeenCalled()
  })

  it('an unknown broadcast is queried without resending; explicit retry reuses the signed transaction and stored payload', async () => {
    const test = await fixture()
    const captured: PendingOperation[] = []
    const stages: string[] = []
    const broadcast = vi.fn(test.wallet.runner.broadcastTransaction)
      .mockRejectedValueOnce(new Error('Broadcast response lost'))
    test.wallet.runner.broadcastTransaction = broadcast
    const options = {
      ...test,
      config,
      finalityTimeoutMs: 1,
      onPending: (pending: PendingOperation) => { captured.push(pending) },
      onProgress: (progress: FlowProgress) => { stages.push(progress.stage) },
      pollIntervalMs: 1,
    }
    await expect(storeAndAnchor({ ...options, payloadText: JSON.stringify(test.normalized.payload) }))
      .rejects.toThrow('Broadcast response lost')
    const pending = captured.at(-1)
    if (!pending) throw new Error('The signed operation was not captured for recovery')
    expect(pending.confirmation?.state).toBe('storage-verified')
    expect(pending.broadcastAttempted).toBe(true)
    expect(test.api.confirm).toHaveBeenCalledOnce()
    await resumeAnchor({ ...options, pending })
    expect(broadcast).toHaveBeenCalledOnce()
    expect(stages.at(-1)).toBe('broadcast-unknown')
    await resumeAnchor({
      ...options, pending, retryBroadcast: true,
    })
    expect(broadcast).toHaveBeenCalledTimes(2)
    expect(test.api.confirm).toHaveBeenCalledOnce()
    expect(stages.at(-1)).toBe('pending')
    expect(broadcast.mock.calls[0]?.[0]).toEqual(broadcast.mock.calls[1]?.[0])
  })

  it('expired reserved evidence reconciles stored content with writes disabled without broadcasting', async () => {
    const test = await fixture()
    const captured: PendingOperation[] = []
    test.api.confirm = vi.fn<SampleApi['confirm']>(async () => {
      throw new Error('Provider outcome uncertain')
    })
    const options = {
      ...test, config, onPending: (pending: PendingOperation) => { captured.push(pending) },
    }
    await expect(storeAndAnchor({ ...options, payloadText: JSON.stringify(test.normalized.payload) }))
      .rejects.toThrow('Provider outcome uncertain')
    const pending = captured.at(-1)
    if (!pending) throw new Error('The signed operation was not captured')
    test.api.intent = async () => ({
      ...pending.intent, byteLength: test.normalized.byteLength, state: 'storage-uncertain',
    })
    test.wallet.viewer.currentBlockNumber = () => asXL1BlockNumber(pending.evidence.exp + 1, true)
    await expect(resumeAnchor({
      ...options, config: { ...config, writeEnabled: false }, pending,
    }))
      .rejects.toThrow('signed transaction expired')
    expect(test.api.confirm).toHaveBeenCalledOnce()
    expect(test.api.reconcile).toHaveBeenCalledOnce()
    expect(captured.at(-1)?.confirmation?.state).toBe('storage-verified')
    expect(test.wallet.runner.broadcastTransaction).not.toHaveBeenCalled()
  })
})

describe('sample retrieval HTTP boundary', () => {
  it('rejects a response that claims the requested hash for different payload bytes', async () => {
    const desired = await normalizeSampleData('{"value":1}')
    const substituted = await normalizeSamplePayload({
      schema: SAMPLE_SCHEMA, salt: desired.payload.salt, data: { value: 2 },
    })
    const api = createSampleApi('http://127.0.0.1', async () => Response.json({
      ...substituted,
      hash: desired.hash,
    }, { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await expect(api.payload(desired.hash)).rejects.toThrow('Retrieved payload bytes or XYO hash do not match')
  })
})
