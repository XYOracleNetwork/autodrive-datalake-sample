import type { S3Archivist } from '@xyo-network/archivist-s3'
import {
  AutoDriveS3Endpoint, AutoDriveStorageError, createAutoDriveArchivist,
} from '@xyo-network/archivist-s3/auto-drive'
import type { SamplePayload } from '@xyo-network/autodrive-sample-protocol'
import {
  MAX_PAYLOAD_BYTES, normalizeRetrievedSamplePayload, normalizeSamplePayload, SAMPLE_SCHEMA,
} from '@xyo-network/autodrive-sample-protocol'

import type { SampleStorage } from './aries.js'
import { requireCondition, SampleError } from './errors.js'

const READINESS_HASH = '0'.repeat(64)
const OPERATION_TIMEOUT_MS = 65_000

export interface AutoDriveStorageOptions {
  apiKey: string
  bucket: string
  namespace: string
  signal?: AbortSignal
}

export interface OwnedAutoDriveStorage extends SampleStorage {
  close(): Promise<void>
}

function safeError(error: unknown, message: string): SampleError {
  if (error instanceof SampleError) return error
  const status = error instanceof AutoDriveStorageError ? error.statusCode : undefined
  return new SampleError('auto-drive', status === undefined ? message : `${message} (HTTP ${status})`, 503)
}

async function verifyStored(value: unknown, hash: string) {
  requireCondition(
    typeof value === 'object' && value !== null && '_hash' in value && value._hash === hash,
    'auto-drive-identity',
    'Auto Drive returned an unexpected payload identity',
    503,
  )
  const normalized = await normalizeRetrievedSamplePayload(value)
  requireCondition(normalized.hash === hash, 'auto-drive-identity', 'Auto Drive returned content with an invalid payload hash', 503)
  return normalized
}

function operationOwner(archivist: S3Archivist, callerSignal?: AbortSignal) {
  const controller = new AbortController()
  const signal = callerSignal === undefined ? controller.signal : AbortSignal.any([controller.signal, callerSignal])
  const active = new Set<Promise<unknown>>()
  const destroy = () => archivist.client.destroy()
  signal.addEventListener('abort', destroy, { once: true })
  let closing: Promise<void> | undefined

  // Reject any subsequent SDK command if an abort interrupts a multi-command insert.
  archivist.client.middlewareStack.add(next => async (args) => {
    signal.throwIfAborted()
    return await next(args)
  }, { step: 'initialize', name: 'sampleAutoDriveAbort' })

  const run = async <T>(operation: () => Promise<T>, message: string): Promise<T> => {
    requireCondition(!signal.aborted && closing === undefined, 'auto-drive-closed', 'Auto Drive storage is stopped; restart the server before reconciliation', 503)
    let interrupted: (() => void) | undefined
    const timer = setTimeout(() => controller.abort(), OPERATION_TIMEOUT_MS)
    const result = Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        interrupted = () => reject(new SampleError('auto-drive-aborted', 'Auto Drive operation was cancelled or timed out; restart the server before reconciliation', 503))
        signal.addEventListener('abort', interrupted, { once: true })
        if (signal.aborted) interrupted()
      }),
    ])
    active.add(result)
    try {
      return await result
    } catch (error) {
      throw safeError(error, message)
    } finally {
      active.delete(result)
      clearTimeout(timer)
      if (interrupted !== undefined) signal.removeEventListener('abort', interrupted)
    }
  }

  const close = () => {
    closing ??= (async () => {
      controller.abort()
      await Promise.allSettled(active)
      await archivist.stop()
      signal.removeEventListener('abort', destroy)
    })()
    return closing
  }
  return { run, close }
}

/**
 * Thin app adapter over the published XYO Auto Drive archivist; construction never writes.
 * The executable should enable AbstractModule.enableLazyLoad before constructing SDK modules,
 * so its explicit lifecycle owns startup instead of the SDK's delayed automatic startup timer.
 */
export async function createAutoDriveStorage(options: AutoDriveStorageOptions): Promise<OwnedAutoDriveStorage> {
  const startupAborted = () => options.signal?.aborted === true
  requireCondition(!startupAborted(), 'auto-drive-aborted', 'Auto Drive startup was cancelled', 503)
  requireCondition(
    typeof options.apiKey === 'string' && options.apiKey.trim().length > 0 && !/\s/u.test(options.apiKey),
    'auto-drive-config',
    'AUTODRIVE_API_KEY must be a nonempty provider key',
  )
  requireCondition(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(options.bucket), 'auto-drive-config', 'Invalid Auto Drive bucket')
  requireCondition(/^[\w-]{1,128}$/u.test(options.namespace), 'auto-drive-config', 'Invalid Auto Drive namespace')
  let archivist: S3Archivist
  try {
    archivist = await createAutoDriveArchivist({
      apiKey: options.apiKey,
      bucket: options.bucket,
      keyPrefix: options.namespace,
      admission: { allowedSchemas: [SAMPLE_SCHEMA], maxPayloadBytes: MAX_PAYLOAD_BYTES },
    })
  } catch (error) {
    throw safeError(error, 'Auto Drive storage initialization failed')
  }
  const owner = operationOwner(archivist, options.signal)
  if (startupAborted()) {
    await owner.close()
    throw new SampleError('auto-drive-aborted', 'Auto Drive startup was cancelled', 503)
  }
  const get = async (hash: string): Promise<unknown> => {
    requireCondition(/^[\da-f]{64}$/u.test(hash), 'auto-drive-hash', 'Invalid XYO payload hash')
    return await owner.run(async () => {
      // This SDK method bypasses aliases and caches and fetches the primary remote object afresh.
      const found = await archivist.getStoredPayloads([hash])
      if (found.length === 0) return
      requireCondition(found.length === 1, 'auto-drive-read', 'Auto Drive returned an unexpected object count', 503)
      await verifyStored(found[0], hash)
      return found[0]
    }, 'Auto Drive payload retrieval failed')
  }
  return {
    identity: `${AutoDriveS3Endpoint}/${options.bucket}/${options.namespace}`,
    close: owner.close,
    get,
    async checkReady() {
      await owner.run(async () => {
        try {
          // A single authenticated HEAD proves connectivity without uploading or enumerating objects.
          await archivist.getObjectReceipt(READINESS_HASH)
        } catch (error) {
          if (!(error instanceof AutoDriveStorageError && error.statusCode === 404)) throw error
        }
      }, 'Auto Drive authenticated readiness check failed')
    },
    async insert(payload: SamplePayload) {
      const expected = await normalizeSamplePayload(payload)
      await owner.run(async () => {
        const acknowledged = await archivist.insert([expected.payload])
        requireCondition(acknowledged.length <= 1, 'auto-drive-ack', 'Auto Drive returned an unexpected acknowledgment', 503)
        if (acknowledged.length === 1) await verifyStored(acknowledged[0], expected.hash)
        // An empty acknowledgment can mean a duplicate; only a fresh exact read can confirm it.
        const stored = await get(expected.hash)
        requireCondition(stored !== undefined, 'auto-drive-readback', 'Auto Drive did not return the stored payload; reconcile before retrying', 503)
        const verified = await verifyStored(stored, expected.hash)
        requireCondition(verified.canonicalJson === expected.canonicalJson, 'auto-drive-readback', 'Auto Drive returned different payload content', 503)
      }, 'Auto Drive insertion failed; reconcile before retrying')
    },
  }
}
