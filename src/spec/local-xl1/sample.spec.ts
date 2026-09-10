import {
  mkdtemp, readFile, rm,
} from 'node:fs/promises'
import OS from 'node:os'
import Path from 'node:path'

import {
  expect, it, vi,
} from 'vitest'

import { normalizeSamplePayload } from '../../payload.js'
import { storeAndAnchor } from '../../workflow.js'
import { localWallet } from '../fixtures/localWallet.js'

it('uses the real Aries CLI wallet to sign, store, broadcast, and finalize on local XL1', async () => {
  const directory = await mkdtemp(Path.join(OS.tmpdir(), 'sample-local-'))
  const fixture = await localWallet(directory)
  const stored = new Map<string, unknown>()
  const insert = vi.fn(async (payload) => {
    const normalized = await normalizeSamplePayload(payload)
    stored.set(normalized.hash, normalized.payload)
  })
  try {
    const result = await storeAndAnchor('Hello from the real Aries CLI wallet 😀', {
      ...fixture,
      directory,
      pollIntervalMs: 250,
      storage: {
        identity: 'controlled', checkReady: () => Promise.resolve(), insert, get: async hash => stored.get(hash),
      },
    })
    expect(result.status).toBe('finalized')
    expect(result.inclusion.transactionHash).toBe(result.transactionHash)
    expect(result.payload.payload.data.message).toBe('Hello from the real Aries CLI wallet 😀')
    expect(insert).toHaveBeenCalledOnce()
    expect(stored.size).toBe(1)
    const evidence: unknown = JSON.parse(await readFile(Path.join(directory, 'evidence.json'), 'utf8'))
    expect(evidence).toHaveProperty('transactionHash', result.transactionHash)
  } finally {
    await fixture.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 120_000)
