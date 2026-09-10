import { readFile, realpath } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import Path from 'node:path'

import {
  MAX_PAYLOAD_BYTES, normalizeRetrievedSamplePayload, normalizeSamplePayload, SAMPLE_SCHEMA,
} from '@xyo-network/autodrive-sample-protocol'
import { parseStrictJsonText } from '@xyo-network/dapp-kit'

import type { AdmissionChain } from './admission.js'
import { validateAdmission, validateReconciliation } from './admission.js'
import type { SampleStorage } from './aries.js'
import { AriesStorageError } from './aries.js'
import type { SampleConfiguration } from './configuration.js'
import { validateSampleConfiguration } from './configuration.js'
import {
  isRecord, requireCondition, SampleError,
} from './errors.js'
import type { SampleLedger, StoreIntent } from './ledger.js'
import { createSampleLedger } from './ledger.js'

export interface StartSampleApplicationOptions {
  chain: AdmissionChain
  config: SampleConfiguration
  now?: () => number
  stateDirectory?: string
  storage: SampleStorage
  webRoot?: string
}

function send(response: ServerResponse, status: number, value: unknown) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}

async function readBody(request: IncomingMessage) {
  requireCondition(request.headers['content-type']?.split(';', 1)[0] === 'application/json', 'content-type', 'Expected application/json', 415)
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    length += bytes.length
    requireCondition(length <= 65_536, 'request-size', 'Request exceeds 64 KiB', 413)
    chunks.push(bytes)
  }
  const decoder = new TextDecoder('utf-8', { fatal: true })
  const text = decoder.decode(Buffer.concat(chunks))
  return parseStrictJsonText(text, { maximumDepth: 32, requireTopLevelObject: true })
}

function confirmation(intent: StoreIntent, chainId: string) {
  return {
    byteLength: intent.byteLength,
    chainId,
    intentId: intent.id,
    payloadHash: intent.payloadHash,
    signer: intent.signer,
    state: 'storage-verified',
    transactionHash: intent.transactionHash,
    verifiedAt: intent.verifiedAt,
  }
}

async function serveStatic(pathname: string, response: ServerResponse, webRoot?: string) {
  requireCondition(webRoot !== undefined, 'not-found', 'Not found', 404)
  const root = await realpath(webRoot)
  const requested = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).slice(1)
  let file: string
  try {
    file = await realpath(Path.resolve(root, requested))
  } catch {
    throw new SampleError('not-found', 'Not found', 404)
  }
  requireCondition(file.startsWith(`${root}${Path.sep}`), 'not-found', 'Not found', 404)
  const mime: Record<string, string> = {
    '.css': 'text/css',
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  }
  const contentType = mime[Path.extname(file)]
  requireCondition(contentType !== undefined, 'not-found', 'Not found', 404)
  response.writeHead(200, {
    'content-type': `${contentType}; charset=utf-8`, 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
  })
  response.end(await readFile(file))
}

interface RouteContext extends StartSampleApplicationOptions {
  ledger: SampleLedger
  now: () => number
}

async function resolveStorage(context: RouteContext, request: IncomingMessage, id: string, body: Record<string, unknown>, readOnly: boolean) {
  const {
    chain, config, ledger, now, storage,
  } = context
  requireCondition(Object.keys(body).length === 1 && 'evidence' in body, 'request', 'Expected only signed evidence')
  const token = request.headers.authorization?.match(/^Bearer ([^\s]+)$/u)?.[1]
  requireCondition(token !== undefined && token.length <= 8192, 'authentication', 'Wallet authorization is required', 401)
  const intent = await ledger.get(id)
  const validate = readOnly ? validateReconciliation : validateAdmission
  const {
    evidence, signer, snapshot,
  } = await validate({
    chain, config, evidence: body.evidence, intent, now: now(), token,
  })
  // A read-only recovery request must never reserve capacity or dispatch an upload.
  const reservation = readOnly ? undefined : await ledger.reserve(intent.id, signer, evidence.transactionHash, config.limits, now())
  try {
    if (reservation?.dispatch === true) await storage.insert(snapshot.payload)
    const stored = await storage.get(snapshot.hash)
    requireCondition(stored !== undefined, 'storage-uncertain', 'Storage could not be verified', 409)
    const retrieved = await normalizeRetrievedSamplePayload(stored)
    requireCondition(retrieved.hash === snapshot.hash && retrieved.canonicalJson === snapshot.canonicalJson, 'storage-uncertain', 'Storage read-back did not match', 409)
    const verified = await ledger.verify(intent.id, now())
    return confirmation(verified, config.chainId)
  } catch (error) {
    if (error instanceof SampleError && (error.code === 'auto-drive-aborted' || error.code === 'auto-drive-closed')) {
      throw new SampleError(
        'storage-uncertain',
        'Storage outcome is uncertain and the Auto Drive client is stopped. Restart the sample, then reconcile the same signed evidence without repeating the upload.',
        503,
      )
    }
    throw new SampleError('storage-uncertain', 'Storage outcome is uncertain. Reconcile the same signed evidence through the read-only recovery route; no upload will be repeated.', 409)
  }
}

async function handlePost(context: RouteContext, request: IncomingMessage, response: ServerResponse, pathname: string) {
  const {
    config, ledger, now,
  } = context
  requireCondition(request.headers.origin === config.origin, 'origin', 'A matching browser Origin is required', 403)
  const match = /^\/api\/store-intents\/([a-z0-9-]+)\/(confirm|reconcile)$/u.exec(pathname)
  const readOnly = match?.[2] === 'reconcile'
  requireCondition(readOnly || config.writeEnabled, 'writes-disabled', 'The operator has disabled writes', 403)
  const body = await readBody(request)
  requireCondition(isRecord(body), 'request', 'Expected a request object')
  if (pathname === '/api/store-intents') {
    requireCondition(Object.keys(body).length === 1 && 'payload' in body, 'request', 'Expected only payload')
    const snapshot = await normalizeSamplePayload(body.payload)
    const intent = await ledger.create(snapshot.hash, snapshot.byteLength, now())
    send(response, 201, { ...intent, chainId: config.chainId })
    return
  }
  const id = match?.[1]
  requireCondition(id !== undefined, 'not-found', 'Not found', 404)
  send(response, 200, await resolveStorage(context, request, id, body, readOnly))
}

async function handleGet(context: RouteContext, response: ServerResponse, pathname: string) {
  const {
    config, ledger, storage,
  } = context
  if (pathname === '/api/config') {
    send(response, 200, {
      audience: config.audience,
      chainId: config.chainId,
      maxPayloadBytes: MAX_PAYLOAD_BYTES,
      networkId: config.networkId,
      origin: config.origin,
      schema: SAMPLE_SCHEMA,
      status: 'ready',
      transactionValidityBlocks: config.transactionValidityBlocks,
      writeEnabled: config.writeEnabled,
    })
    return
  }
  const intentId = /^\/api\/store-intents\/([a-z0-9-]+)$/u.exec(pathname)?.[1]
  if (intentId !== undefined) {
    const intent = await ledger.get(intentId)
    send(response, 200, { ...intent, chainId: config.chainId })
    return
  }
  const hash = /^\/api\/payloads\/([a-f0-9]{64})$/u.exec(pathname)?.[1]
  if (hash !== undefined) {
    const payload = await storage.get(hash)
    requireCondition(payload !== undefined, 'not-found', 'Payload not found', 404)
    const retrieved = await normalizeRetrievedSamplePayload(payload)
    requireCondition(retrieved.hash === hash, 'integrity', 'Retrieved payload failed identity verification', 502)
    send(response, 200, retrieved)
    return
  }
  await serveStatic(pathname, response, context.webRoot)
}

function respondToError(response: ServerResponse, error: unknown) {
  if (response.headersSent) {
    response.end()
    return
  }
  if (error instanceof SampleError) {
    send(response, error.status, { code: error.code, message: error.message })
  } else if (error instanceof AriesStorageError) {
    send(response, 503, { code: 'storage-unavailable', message: 'The configured storage service is unavailable or failed verification' })
  } else {
    send(response, 400, { code: 'invalid-request', message: 'Request validation failed' })
  }
}

function createRouter(context: RouteContext, isClosing: () => boolean) {
  let count = 0
  let windowStart = context.now()
  return async (request: IncomingMessage, response: ServerResponse) => {
    const { config, now } = context
    requireCondition(!isClosing(), 'closing', 'Service is shutting down', 503)
    const url = new URL(request.url ?? '/', config.origin)
    const expected = new URL(config.origin)
    requireCondition(request.headers.host === expected.host && url.origin === config.origin, 'origin', 'Unexpected request host', 403)
    requireCondition(url.search === '', 'query', 'Query parameters are not supported')
    if (url.pathname.startsWith('/api/')) {
      if (now() - windowStart >= 60_000) {
        count = 0
        windowStart = now()
      }
      requireCondition(++count <= 240, 'rate-limit', 'Sample request limit reached; try again in one minute', 429)
    }
    if (request.method === 'POST') return await handlePost(context, request, response, url.pathname)
    requireCondition(request.method === 'GET', 'method', 'Method not allowed', 405)
    await handleGet(context, response, url.pathname)
  }
}

export async function startSampleApplication(options: StartSampleApplicationOptions) {
  const { chain, storage } = options
  const config = structuredClone(validateSampleConfiguration(options.config))
  const expectedOrigin = new URL(config.origin)
  requireCondition(
    expectedOrigin.protocol === 'http:' && expectedOrigin.hostname === '127.0.0.1',
    'configuration',
    'The local launcher requires an HTTP numeric-loopback origin; hosted TLS needs a qualified proxy',
  )
  requireCondition(await chain.chainId() === config.chainId, 'wrong-chain', 'Configured chain identity differs from the connected chain', 503)
  await storage.checkReady()
  const ledger = await createSampleLedger(JSON.stringify({ chainId: config.chainId, storage: storage.identity }), options.stateDirectory)
  const active = new Set<Promise<void>>()
  let shutdown: Promise<void> | undefined
  const handle = createRouter({
    ...options, config, ledger, now: options.now ?? Date.now,
  }, () => shutdown !== undefined)
  const server = createServer((request, response) => {
    const operation = (async () => {
      try {
        await handle(request, response)
      } catch (error) {
        respondToError(response, error)
      }
    })()
    active.add(operation)
    void operation.finally(() => active.delete(operation))
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  try {
    await new Promise<void>((resolveReady, reject) => {
      server.once('error', reject)
      server.listen(Number(expectedOrigin.port || 80), '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolveReady()
      })
    })
  } catch (error) {
    await ledger.close()
    throw error
  }
  config.origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    config,
    origin: config.origin,
    close() {
      shutdown ??= (async () => {
        await new Promise<void>(resolveClosed => server.close(() => resolveClosed()))
        await Promise.allSettled(active)
        await ledger.close()
      })()
      return shutdown
    },
  }
}
