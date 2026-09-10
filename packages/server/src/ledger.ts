import { randomBytes, randomUUID } from 'node:crypto'
import type { FileHandle } from 'node:fs/promises'
import {
  mkdir, open, rm,
} from 'node:fs/promises'
import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'

import type { SampleLimits } from './configuration.js'
import { requireCondition, SampleError } from './errors.js'

export interface StoreIntent {
  byteLength: number
  expiresAt: number
  id: string
  nonce: string
  payloadHash: string
  signer?: string
  state: string
  transactionHash?: string
  verifiedAt?: number
}

interface BudgetRow {
  bytes: number
  count: number
  signer: string
}

const intentColumns = `id, nonce, payload_hash AS "payloadHash", byte_length AS "byteLength",
  expires_at::float8 AS "expiresAt", state, signer, transaction_hash AS "transactionHash", verified_at::float8 AS "verifiedAt"`

async function acquireOwnership(directory?: string) {
  if (directory === undefined) return
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const lockPath = path.join(directory, 'writer.lock')
  let lock: FileHandle
  try {
    lock = await open(lockPath, 'wx', 0o600)
  } catch {
    throw new SampleError('ledger-locked', 'Ledger cannot acquire writer.lock; stop the existing owner before operator recovery', 503)
  }
  try {
    await lock.writeFile(String(process.pid))
  } catch (error) {
    await lock.close()
    await rm(lockPath)
    throw error
  }
  return async () => {
    await lock.close()
    await rm(lockPath)
  }
}

async function initializeDatabase(db: PGlite, identity: string) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS sample_identity (singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton), identity TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS intents (
      id TEXT PRIMARY KEY, nonce TEXT NOT NULL, payload_hash TEXT NOT NULL, byte_length INTEGER NOT NULL,
      expires_at BIGINT NOT NULL, state TEXT NOT NULL DEFAULT 'prepared', signer TEXT,
      transaction_hash TEXT, verified_at BIGINT
    );
    CREATE TABLE IF NOT EXISTS uploads (
      payload_hash TEXT PRIMARY KEY, byte_length INTEGER NOT NULL, signer TEXT NOT NULL,
      day TEXT NOT NULL, state TEXT NOT NULL, verified_at BIGINT
    );
    CREATE INDEX IF NOT EXISTS uploads_day ON uploads(day, signer);
  `)
  await db.query('INSERT INTO sample_identity(identity) VALUES ($1) ON CONFLICT DO NOTHING', [identity])
  const result = await db.query<{ identity: string }>('SELECT identity FROM sample_identity')
  requireCondition(result.rows.at(0)?.identity === identity, 'ledger-identity', 'Retained ledger belongs to a different chain or datalake', 503)
}

function requireBudget(limits: SampleLimits, rows: BudgetRow[], signer: string, payloadBytes: number) {
  const account = rows.find(row => row.signer === signer)
  const writes = rows.reduce((sum, row) => sum + row.count, 0)
  const bytes = rows.reduce((sum, row) => sum + row.bytes, 0)
  const allowed = writes < limits.globalDailyWrites
    && bytes + payloadBytes <= limits.globalDailyBytes
    && (account?.count ?? 0) < limits.accountDailyWrites
    && (account?.bytes ?? 0) + payloadBytes <= limits.accountDailyBytes
  requireCondition(allowed, 'budget', 'The configured daily upload budget is exhausted', 429)
}

export async function createSampleLedger(identity: string, directory?: string) {
  const releaseOwnership = await acquireOwnership(directory)
  let db: PGlite | undefined
  try {
    db = await PGlite.create(directory === undefined ? 'memory://' : path.join(directory, 'postgres'))
    await initializeDatabase(db, identity)
  } catch (error) {
    // Keep ownership if closing fails: another writer must not open a possibly live database.
    await db?.close()
    await releaseOwnership?.()
    throw error
  }
  const database = db
  let closing: Promise<void> | undefined
  const get = async (id: string) => {
    const result = await database.query<StoreIntent>(`SELECT ${intentColumns} FROM intents WHERE id=$1`, [id])
    const row = result.rows.at(0)
    requireCondition(row !== undefined, 'intent-not-found', 'Intent not found', 404)
    if (row.signer === null) delete row.signer
    if (row.transactionHash === null) delete row.transactionHash
    if (row.verifiedAt === null) delete row.verifiedAt
    return row
  }
  return {
    close() {
      closing ??= (async () => {
        await database.close()
        await releaseOwnership?.()
      })()
      return closing
    },
    async create(payloadHash: string, byteLength: number, now: number) {
      const id = randomUUID()
      const nonce = randomBytes(32).toString('hex')
      await database.transaction(async (tx) => {
        await tx.query("DELETE FROM intents WHERE state='prepared' AND expires_at < $1", [now])
        const result = await tx.query<{ count: number }>("SELECT count(*)::int AS count FROM intents WHERE state='prepared'")
        const count = result.rows.at(0)?.count ?? 0
        requireCondition(count < 100, 'intent-limit', 'Too many pending intents; allow existing challenges to expire', 429)
        await tx.query('INSERT INTO intents(id,nonce,payload_hash,byte_length,expires_at) VALUES ($1,$2,$3,$4,$5)', [id, nonce, payloadHash, byteLength, now + 300_000])
      })
      return await get(id)
    },
    get,
    reserve: async (id: string, signer: string, transactionHash: string, limits: SampleLimits, now: number) => await database.transaction(async (tx) => {
      const result = await tx.query<StoreIntent>(`SELECT ${intentColumns} FROM intents WHERE id=$1 FOR UPDATE`, [id])
      const intent = result.rows.at(0)
      requireCondition(intent !== undefined, 'intent-not-found', 'Intent not found', 404)
      if (intent.state === 'prepared') requireCondition(intent.expiresAt > now, 'intent-expired', 'Create a fresh intent and authorization', 409)
      else requireCondition(intent.signer === signer && intent.transactionHash === transactionHash, 'intent-consumed', 'Intent is already bound to different signed evidence', 409)
      const existing = await tx.query<{ state: string }>('SELECT state FROM uploads WHERE payload_hash=$1', [intent.payloadHash])
      let dispatch = false
      if (existing.rows.length === 0) {
        const date = new Date(now)
        const day = date.toISOString().slice(0, 10)
        const usage = await tx.query<BudgetRow>('SELECT signer, count(*)::int AS count, sum(byte_length)::float8 AS bytes FROM uploads WHERE day=$1 GROUP BY signer', [day])
        requireBudget(limits, usage.rows, signer, intent.byteLength)
        await tx.query(
          "INSERT INTO uploads(payload_hash,byte_length,signer,day,state) VALUES ($1,$2,$3,$4,'storage-uncertain')",
          [intent.payloadHash, intent.byteLength, signer, day],
        )
        dispatch = true
      }
      await tx.query("UPDATE intents SET signer=$2, transaction_hash=$3, state='storage-uncertain' WHERE id=$1", [id, signer, transactionHash])
      return { dispatch, intent }
    }),
    async verify(id: string, now: number) {
      await database.transaction(async (tx) => {
        await tx.query("UPDATE intents SET state='storage-verified', verified_at=$2 WHERE id=$1", [id, now])
        await tx.query("UPDATE uploads SET state='storage-verified', verified_at=$2 WHERE payload_hash=(SELECT payload_hash FROM intents WHERE id=$1)", [id, now])
      })
      return await get(id)
    },
  }
}

export type SampleLedger = Awaited<ReturnType<typeof createSampleLedger>>
