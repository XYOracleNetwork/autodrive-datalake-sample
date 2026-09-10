import { RestPayloadsClient } from '@ariestools/aries-datalake-client'
import type { SamplePayload } from '@xyo-network/autodrive-sample-protocol'
import { normalizeRetrievedSamplePayload, normalizeSamplePayload } from '@xyo-network/autodrive-sample-protocol'

const MAX_RESPONSE_BYTES = 65_536
const REQUEST_TIMEOUT_MS = 60_000
const HASH_PATTERN = /^[\da-f]{64}$/u

export interface SampleStorage {
  readonly identity: string
  checkReady(): Promise<void>
  get(hash: string): Promise<unknown>
  insert(payload: SamplePayload): Promise<void>
}

export interface AriesStorageOptions {
  baseUrl: string
  datalakeId: string
  /** Optional existing object to verify during readiness; never creates an object. */
  knownReadHash?: string
  signal?: AbortSignal
  token: string
}

/** Carries only a fixed local message and, for an actual HTTP failure, its status. */
export class AriesStorageError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AriesStorageError'
    this.status = status
  }
}

/** This transport restriction does not narrow the underlying Aries credential. */
export function createAriesStorage(options: AriesStorageOptions): SampleStorage {
  const {
    datalakeId, token, signal, knownReadHash,
  } = options
  if (typeof datalakeId !== 'string' || !/^[\w-]{1,128}$/u.test(datalakeId)) throw new AriesStorageError('Invalid Aries datalake ID')
  if (typeof token !== 'string' || token.trim().length === 0 || /\s/u.test(token)) throw new AriesStorageError('Invalid Aries service credential')
  if (knownReadHash !== undefined) requireHash(knownReadHash)
  const baseUrl = normalizeBaseUrl(options.baseUrl, datalakeId)
  const endpoint = new URL(baseUrl)
  const resourcePath = `${endpoint.pathname.replace(/\/$/u, '')}/v1/datalakes/${encodeURIComponent(datalakeId)}`
  const identity = `${baseUrl}/v1/datalakes/${encodeURIComponent(datalakeId)}`
  const client = new RestPayloadsClient({
    baseUrl,
    datalakeId,
    authToken: token,
    fetchImpl: createBoundedFetch(baseUrl, resourcePath, token, signal),
  })

  const get = async (hash: string): Promise<unknown> => {
    requireHash(hash)
    try {
      const stored: unknown = await client.get(hash)
      await verifyStoredPayload(stored, hash)
      return stored
    } catch (error) {
      if (error instanceof AriesStorageError && error.status === 404) return undefined
      throw redactError(error, 'Aries payload retrieval failed')
    }
  }

  return {
    identity,
    get,
    async insert(payload) {
      try {
        // Capture normalized bytes before the request; the client sends exactly this one payload.
        const expected = await normalizeSamplePayload(payload)
        const result = await client.insert([expected.payload])
        if (!Array.isArray(result.inserted) || result.summary.rejected.length > 0) {
          throw new AriesStorageError('Aries rejected the payload or returned an invalid acknowledgment')
        }
        if (result.summary.duplicates === 1 && result.inserted.length === 0) {
          const existing = await get(expected.hash)
          if (existing === undefined) throw new AriesStorageError('Aries duplicate could not be reconciled')
          const normalized = await verifyStoredPayload(existing, expected.hash)
          if (normalized.canonicalJson !== expected.canonicalJson) throw new AriesStorageError('Aries duplicate content did not match')
          return
        }
        if (result.summary.duplicates !== 0 || result.inserted.length !== 1) {
          throw new AriesStorageError('Aries returned an incomplete or inconsistent acknowledgment')
        }
        const normalized = await verifyStoredPayload(result.inserted[0], expected.hash)
        if (normalized.canonicalJson !== expected.canonicalJson) throw new AriesStorageError('Aries acknowledged different payload content')
      } catch (error) {
        throw redactError(error, 'Aries payload insertion failed; reconcile before retrying')
      }
    },
    async checkReady() {
      try {
        const usage = await client.usage()
        if (usage.datalakeId !== datalakeId || !Number.isSafeInteger(usage.payloadCount) || usage.payloadCount < 0) {
          throw new AriesStorageError('Aries returned invalid readiness evidence')
        }
        if (knownReadHash !== undefined && await get(knownReadHash) === undefined) {
          throw new AriesStorageError('Aries readiness payload was not found')
        }
      } catch (error) {
        throw redactError(error, 'Aries authenticated readiness check failed')
      }
    },
  }
}

function requireHash(hash: string) {
  if (!HASH_PATTERN.test(hash)) throw new AriesStorageError('Invalid XYO payload hash')
}

function normalizeBaseUrl(value: string, datalakeId: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new AriesStorageError('Aries endpoint must be an absolute HTTP(S) URL')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new AriesStorageError('Aries endpoint must be HTTP(S) without credentials, query, or fragment')
  }
  const marker = '/v1/datalakes'
  const index = url.pathname.indexOf(marker)
  if (index !== -1) {
    const suffix = url.pathname.slice(index).replace(/\/$/u, '')
    if (suffix !== `${marker}/${encodeURIComponent(datalakeId)}`) throw new AriesStorageError('Aries endpoint does not match the configured datalake')
    url.pathname = url.pathname.slice(0, index)
  }
  return `${url.origin}${url.pathname.replace(/\/$/u, '')}`
}

async function verifyStoredPayload(value: unknown, hash: string) {
  if (typeof value !== 'object' || value === null || !('_hash' in value) || value._hash !== hash) {
    throw new AriesStorageError('Aries returned an unexpected payload hash')
  }
  const normalized = await normalizeRetrievedSamplePayload(value)
  if (normalized.hash !== hash) throw new AriesStorageError('Aries returned content with an invalid XYO hash')
  return normalized
}

function redactError(error: unknown, fallback: string) {
  return error instanceof AriesStorageError ? error : new AriesStorageError(fallback)
}

function createBoundedFetch(baseUrl: string, resourcePath: string, token: string, callerSignal?: AbortSignal): typeof fetch {
  const endpoint = new URL(baseUrl)
  const { origin } = endpoint
  return async (input, init) => {
    const {
      url, headers, isInsert,
    } = validateRequest(input, init, origin, resourcePath, token)
    const timeoutSignal = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal
    let response: Response | undefined
    try {
      response = await fetch(url, {
        ...init,
        headers,
        credentials: 'omit',
        redirect: 'error',
        signal,
      })
      // Do not parse or forward a provider error body, which may include credentials.
      if (!response.ok) {
        await response.body?.cancel()
        throw new AriesStorageError('Aries data plane returned an HTTP error', response.status)
      }
      if (isInsert) validateSummaryHeaders(response.headers)
      const body = await readBoundedBody(response, signal)
      return new Response(body, { status: response.status, headers: response.headers })
    } catch (error) {
      await cancelQuietly(response?.body)
      throw redactError(error, signal.aborted ? 'Aries request was cancelled or timed out' : 'Aries transport failed')
    }
  }
}

function validateRequest(input: Parameters<typeof fetch>[0], init: RequestInit | undefined, origin: string, resourcePath: string, token: string) {
  if (typeof input !== 'string') throw new AriesStorageError('Aries request must use a fixed URL')
  const url = new URL(input)
  const headers = new Headers(init?.headers)
  const method = init?.method ?? 'GET'
  if (url.origin !== origin || url.search.length > 0 || url.hash.length > 0 || !isAllowedRoute(url.pathname, method, resourcePath)
    || headers.has('origin') || headers.has('cookie') || headers.get('authorization') !== `Bearer ${token}`) {
    throw new AriesStorageError('Aries request was outside the allowed transport boundary')
  }
  return {
    url, headers, isInsert: method === 'POST',
  }
}

function isAllowedRoute(pathname: string, method: string, resourcePath: string) {
  if (method === 'POST') return pathname === `${resourcePath}/insert`
  if (method !== 'GET') return false
  if (pathname === `${resourcePath}/usage`) return true
  const getPrefix = `${resourcePath}/get/`
  return pathname.startsWith(getPrefix) && HASH_PATTERN.test(pathname.slice(getPrefix.length))
}

async function cancelQuietly(body: { cancel(): Promise<unknown> } | null | undefined) {
  try {
    await body?.cancel()
  } catch {
    // Preserve the already selected redacted failure if cancelling a closed stream fails.
  }
}

function validateSummaryHeaders(headers: Headers) {
  const duplicates = headers.get('x-datalake-duplicates')
  if (duplicates !== null && duplicates !== '0' && duplicates !== '1') {
    throw new AriesStorageError('Aries returned an invalid duplicate summary')
  }
  const rejected = headers.get('x-datalake-rejected')
  if (rejected !== null && rejected !== '' && !HASH_PATTERN.test(rejected)) {
    throw new AriesStorageError('Aries returned an invalid rejection summary')
  }
}

async function readBoundedBody(response: Response, signal: AbortSignal) {
  const declared = response.headers.get('content-length')
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > MAX_RESPONSE_BYTES)) {
    throw new AriesStorageError('Aries response exceeded the response limit')
  }
  const reader = response.body?.getReader()
  if (!reader) throw new AriesStorageError('Aries returned an empty response')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const result = await reader.read()
      if (result.done) break
      const value: unknown = result.value
      if (!(value instanceof Uint8Array)) throw new AriesStorageError('Aries returned an invalid response body')
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES) throw new AriesStorageError('Aries response exceeded the response limit')
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  } finally {
    await cancelQuietly(reader)
    reader.releaseLock()
  }
}
