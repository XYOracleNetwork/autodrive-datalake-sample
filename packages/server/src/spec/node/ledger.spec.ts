import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  describe, expect, it,
} from 'vitest'

import { createSampleLedger } from '../../ledger.js'

const limits = {
  accountDailyBytes: 4096, accountDailyWrites: 1, globalDailyBytes: 4096, globalDailyWrites: 1,
}
const now = Date.UTC(2026, 8, 9)

describe('durable upload admission', () => {
  it('dispatches only once for concurrent confirmations and retains uncertain budget', async () => {
    const ledger = await createSampleLedger('test-ledger')
    try {
      const intent = await ledger.create('hash-a', 100, now)
      expect(intent.signer).toBeUndefined()
      const decisions = await Promise.all([
        ledger.reserve(intent.id, 'signer', 'transaction', limits, now),
        ledger.reserve(intent.id, 'signer', 'transaction', limits, now),
      ])
      expect(decisions.filter(decision => decision.dispatch)).toHaveLength(1)
      await expect(ledger.reserve(intent.id, 'signer', 'substituted-transaction', limits, now)).rejects.toMatchObject({ code: 'intent-consumed' })
      const second = await ledger.create('hash-b', 100, now)
      await expect(ledger.reserve(second.id, 'signer', 'transaction-b', limits, now)).rejects.toMatchObject({ code: 'budget' })
      const retained = await ledger.get(intent.id)
      expect(retained.state).toBe('storage-uncertain')
    } finally { await ledger.close() }
  })

  it('preserves identity, uncertainty, and duplicate suppression across restart', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'sample-ledger-'))
    let ledger = await createSampleLedger('chain-and-plane', directory)
    try {
      const intent = await ledger.create('hash-a', 100, now)
      await ledger.reserve(intent.id, 'signer', 'transaction', limits, now)
      await expect(createSampleLedger('chain-and-plane', directory)).rejects.toMatchObject({ code: 'ledger-locked' })
      const firstClose = ledger.close()
      expect(ledger.close()).toBe(firstClose)
      await firstClose
      await expect(createSampleLedger('different-plane', directory)).rejects.toMatchObject({ code: 'ledger-identity' })
      ledger = await createSampleLedger('chain-and-plane', directory)
      const retained = await ledger.get(intent.id)
      expect(retained.state).toBe('storage-uncertain')
      const repeated = await ledger.reserve(intent.id, 'signer', 'transaction', limits, now)
      expect(repeated.dispatch).toBe(false)
      await ledger.verify(intent.id, now + 1000)
      const duplicateIntent = await ledger.create('hash-a', 100, now + 2000)
      const duplicate = await ledger.reserve(duplicateIntent.id, 'signer', 'new-transaction', limits, now + 2000)
      expect(duplicate.dispatch).toBe(false)
    } finally {
      await ledger.close()
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('expires unused challenges without granting a paid-write reservation', async () => {
    const ledger = await createSampleLedger('expiry')
    try {
      const intent = await ledger.create('hash-a', 100, now)
      await expect(ledger.reserve(intent.id, 'signer', 'transaction', limits, intent.expiresAt)).rejects.toMatchObject({ code: 'intent-expired' })
      const fresh = await ledger.create('hash-b', 4096, intent.expiresAt + 1)
      const reservation = await ledger.reserve(fresh.id, 'signer', 'transaction-b', limits, intent.expiresAt + 1)
      expect(reservation.dispatch).toBe(true)
    } finally { await ledger.close() }
  })
})
