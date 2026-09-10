import { mkdtemp, rm } from 'node:fs/promises'
import OS from 'node:os'
import Path from 'node:path'

import { Account } from '@xyo-network/sdk'
import {
  asChainId, asXL1BlockNumber, buildTransaction, createSignedXl1TransactionEvidence,
} from '@xyo-network/xl1-sdk'
import {
  afterEach, describe, expect, it, vi,
} from 'vitest'

import type {
  CliWallet, SampleRunOptions, SampleStorage,
} from '../../contracts.js'
import { normalizeSamplePayload } from '../../payload.js'
import { storeAndAnchor } from '../../workflow.js'

const chainId = asChainId('0123456789abcdef0123456789abcdef01234567', true)
const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const account = await Account.random()
  const directory = await mkdtemp(Path.join(OS.tmpdir(), 'sample-flow-'))
  directories.push(directory)
  const stored = new Map<string, unknown>()
  const options: SampleRunOptions = {
    directory,
    network: {
      chainId, id: 'test', walletNetworkId: 'test', rpcUrl: 'http://127.0.0.1:1/rpc',
    },
    finalityTimeoutMs: 0,
    pollIntervalMs: 1,
    viewer: {
      chainId: () => chainId,
      currentBlockNumber: () => asXL1BlockNumber(1, true),
      block: { blockByHash: async () => null, blockByTransactionHash: async () => null },
    },
    storage: {
      identity: 'controlled',
      checkReady: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      insert: vi.fn<SampleStorage['insert']>(async (payload) => {
        const normalized = await normalizeSamplePayload(payload)
        stored.set(normalized.hash, payload)
      }),
      get: vi.fn<SampleStorage['get']>(async hash => stored.get(hash)),
    },
    wallet: {
      address: async () => account.address,
      assertNetwork: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
      sign: async (request) => {
        const signed = await buildTransaction(chainId, [], request.offChainPayloads, account, asXL1BlockNumber(request.nbf, true), asXL1BlockNumber(request.exp, true))
        return await createSignedXl1TransactionEvidence(signed)
      },
      broadcast: vi.fn<CliWallet['broadcast']>(async evidence => evidence.transactionHash),
    },
  }
  return options
}

describe('storage before chain broadcast', () => {
  it('rejects oversized messages and wrong chains before provider writes', async () => {
    const options = await fixture()
    await expect(storeAndAnchor('x'.repeat(4096), options)).rejects.toThrow('maximum is')
    options.network.chainId = '0'.repeat(40)
    await expect(storeAndAnchor('hello', options)).rejects.toThrow('Gateway chain identity')
    expect(options.storage.insert).not.toHaveBeenCalled()
    expect(options.wallet.broadcast).not.toHaveBeenCalled()
  })

  it('does not upload when signing is rejected or the signer differs', async () => {
    const options = await fixture()
    const sign = options.wallet.sign
    options.wallet.sign = async () => {
      throw new Error('Signing rejected')
    }
    await expect(storeAndAnchor('hello', options)).rejects.toThrow('Signing rejected')
    options.wallet.sign = sign
    options.wallet.address = async () => '0'.repeat(40)
    await expect(storeAndAnchor('hello', options)).rejects.toThrow('approved message, signer, or network')
    expect(options.storage.insert).not.toHaveBeenCalled()
  })

  it('does not broadcast or retry after missing or corrupt read-back', async () => {
    const options = await fixture()
    options.storage.get = vi.fn<SampleStorage['get']>().mockResolvedValue(undefined)
    await expect(storeAndAnchor('hello', options)).rejects.toThrow('storage is not verified')
    expect(options.storage.insert).toHaveBeenCalledOnce()
    expect(options.wallet.broadcast).not.toHaveBeenCalled()
  })

  it('reports unconfirmed finality as failure after exactly one write and broadcast', async () => {
    const options = await fixture()
    await expect(storeAndAnchor('hello', options)).rejects.toThrow('chain finality is unconfirmed')
    expect(options.storage.insert).toHaveBeenCalledOnce()
    expect(options.wallet.broadcast).toHaveBeenCalledOnce()
  })
})
