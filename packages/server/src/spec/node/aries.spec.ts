import type { IncomingHttpHeaders } from 'node:http'
import { createServer } from 'node:http'

import { normalizeSampleData } from '@xyo-network/autodrive-sample-protocol'
import {
  afterEach, describe, expect, it,
} from 'vitest'

import { AriesStorageError, createAriesStorage } from '../../aries.js'

interface FixtureRequest {
  body: unknown
  headers: IncomingHttpHeaders
  method: string
  url: string
}

interface FixtureResponse {
  body?: unknown
  headers?: Record<string, string>
  raw?: string
  status?: number
}

const closeFixtures: (() => Promise<void>)[] = []
const TOKEN = 'test-service-credential'
const LAKE_ID = 'dl_sample'
const HASH = 'a'.repeat(64)

afterEach(async () => {
  await Promise.all(closeFixtures.splice(0).map(close => close()))
})

async function startFixture(handler: (request: FixtureRequest) => FixtureResponse) {
  const requests: FixtureRequest[] = []
  const server = createServer((request, response) => {
    void (async () => {
      try {
        const chunks: Buffer[] = []
        for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array))
        const text = Buffer.concat(chunks).toString('utf8')
        const captured: FixtureRequest = {
          method: request.method ?? '',
          url: request.url ?? '',
          headers: request.headers,
          body: text.length > 0 ? JSON.parse(text) as unknown : undefined,
        }
        requests.push(captured)
        const result = handler(captured)
        response.writeHead(result.status ?? 200, { 'content-type': 'application/json', ...result.headers })
        response.end(result.raw ?? JSON.stringify(result.body))
      } catch {
        response.writeHead(500)
        response.end('{"code":"internal","message":"fixture failure"}')
      }
    })()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  closeFixtures.push(async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('Fixture did not bind a TCP port')
  return { baseUrl: `http://127.0.0.1:${address.port}`, requests }
}

async function sample() {
  const normalized = await normalizeSampleData('{"message":"storage boundary"}')
  return {
    ...normalized,
    stored: {
      ...normalized.payload,
      _hash: normalized.hash,
      _dataHash: normalized.hash,
      _sequence: '1',
    },
  }
}

describe('configured Aries storage', () => {
  it('checks authenticated readiness and writes exactly one normalized payload through prefixed public HTTP routes', async () => {
    const approved = await sample()
    const fixture = await startFixture(({ url }) => ({
      body: url.endsWith('/usage')
        ? { datalakeId: LAKE_ID, payloadCount: 1 }
        : url.endsWith('/insert') ? [approved.stored] : approved.stored,
    }))
    const storage = createAriesStorage({
      baseUrl: `${fixture.baseUrl}/plane/v1/datalakes/${LAKE_ID}`,
      datalakeId: LAKE_ID,
      token: TOKEN,
    })

    await storage.checkReady()
    expect(fixture.requests.map(request => request.method)).toEqual(['GET'])
    await storage.insert(approved.payload)
    await expect(storage.get(approved.hash)).resolves.toEqual(approved.stored)

    expect(storage.identity).toBe(`${fixture.baseUrl}/plane/v1/datalakes/${LAKE_ID}`)
    expect(fixture.requests.map(request => [request.method, request.url])).toEqual([
      ['GET', `/plane/v1/datalakes/${LAKE_ID}/usage`],
      ['POST', `/plane/v1/datalakes/${LAKE_ID}/insert`],
      ['GET', `/plane/v1/datalakes/${LAKE_ID}/get/${approved.hash}`],
    ])
    expect(fixture.requests[1]?.body).toEqual([approved.payload])
    for (const request of fixture.requests) {
      expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`)
      expect(request.headers.origin).toBeUndefined()
      expect(request.headers.cookie).toBeUndefined()
    }
  })

  it.each(['empty', 'wrong-hash', 'rejected', 'invalid-duplicates', 'inconsistent'] as const)(
    'refuses an %s insertion acknowledgment without retrying',
    async (kind) => {
      const approved = await sample()
      const fixture = await startFixture(() => ({
        headers: {
          'x-datalake-duplicates': kind === 'invalid-duplicates' ? 'not-a-count' : kind === 'inconsistent' ? '1' : '0',
          'x-datalake-rejected': kind === 'rejected' ? approved.hash : '',
        },
        body: kind === 'empty' ? [] : [{ ...approved.stored, _hash: kind === 'wrong-hash' ? HASH : approved.hash }],
      }))
      const storage = createAriesStorage({
        baseUrl: fixture.baseUrl, datalakeId: LAKE_ID, token: TOKEN,
      })

      await expect(storage.insert(approved.payload)).rejects.toBeInstanceOf(AriesStorageError)
      expect(fixture.requests).toHaveLength(1)
      expect(fixture.requests[0]?.method).toBe('POST')
    },
  )

  it('reconciles an empty duplicate acknowledgment through a fresh exact-hash read', async () => {
    const approved = await sample()
    const fixture = await startFixture(({ method }) => method === 'POST'
      ? { headers: { 'x-datalake-duplicates': '1' }, body: [] }
      : { body: approved.stored })
    const storage = createAriesStorage({
      baseUrl: fixture.baseUrl, datalakeId: LAKE_ID, token: TOKEN,
    })

    await expect(storage.insert(approved.payload)).resolves.toBeUndefined()
    expect(fixture.requests.map(request => request.method)).toEqual(['POST', 'GET'])
    expect(fixture.requests[1]?.url).toBe(`/v1/datalakes/${LAKE_ID}/get/${approved.hash}`)
  })

  it('does not accept a duplicate whose stored bytes have changed under the claimed hash', async () => {
    const approved = await sample()
    const fixture = await startFixture(({ method }) => method === 'POST'
      ? { headers: { 'x-datalake-duplicates': '1' }, body: [] }
      : { body: { ...approved.stored, data: { message: 'substituted' } } })
    const storage = createAriesStorage({
      baseUrl: fixture.baseUrl, datalakeId: LAKE_ID, token: TOKEN,
    })

    await expect(storage.insert(approved.payload)).rejects.toThrow('invalid XYO hash')
    expect(fixture.requests.map(request => request.method)).toEqual(['POST', 'GET'])
  })

  it('returns undefined only for an actual HTTP 404 and redacts other response bodies', async () => {
    let status = 404
    const fixture = await startFixture(() => ({ status, body: { code: 'internal', message: `secret ${TOKEN}` } }))
    const storage = createAriesStorage({
      baseUrl: fixture.baseUrl, datalakeId: LAKE_ID, token: TOKEN,
    })

    await expect(storage.get(HASH)).resolves.toBeUndefined()
    for (const failure of [401, 403, 429, 500]) {
      status = failure
      await expect(storage.get(HASH)).rejects.toMatchObject({ status: failure, message: 'Aries data plane returned an HTTP error' })
    }
    status = 200
    await expect(storage.get(HASH)).rejects.toThrow('unexpected payload hash')
  })

  it('rejects oversized decoded responses and malformed JSON with redacted errors', async () => {
    let body = JSON.stringify({ padding: 'x'.repeat(70_000) })
    const fixture = await startFixture(() => ({ raw: body, headers: { 'transfer-encoding': 'chunked' } }))
    const storage = createAriesStorage({
      baseUrl: fixture.baseUrl, datalakeId: LAKE_ID, token: TOKEN,
    })

    await expect(storage.get(HASH)).rejects.toThrow('response limit')
    body = `{"secret":"${TOKEN}"`
    await expect(storage.get(HASH)).rejects.toThrow('Aries payload retrieval failed')
  })

  it('keeps cancellation active through an actual HTTP request', async () => {
    const controller = new AbortController()
    const fixture = await startFixture(() => {
      controller.abort(new Error(`secret ${TOKEN}`))
      return { body: { datalakeId: LAKE_ID, payloadCount: 0 } }
    })
    const storage = createAriesStorage({
      baseUrl: fixture.baseUrl, datalakeId: LAKE_ID, token: TOKEN, signal: controller.signal,
    })

    await expect(storage.checkReady()).rejects.toThrow('Aries request was cancelled or timed out')
    expect(fixture.requests).toHaveLength(1)
  })

  it('does not follow redirects or forward a service credential to their target', async () => {
    const target = await startFixture(() => ({ body: {} }))
    const fixture = await startFixture(() => ({
      status: 302, headers: { location: target.baseUrl }, body: {},
    }))
    const storage = createAriesStorage({
      baseUrl: fixture.baseUrl, datalakeId: LAKE_ID, token: TOKEN,
    })

    await expect(storage.get(HASH)).rejects.toThrow('Aries transport failed')
    expect(target.requests).toHaveLength(0)
  })

  it('refuses mismatched configuration and path-shaped hashes before HTTP dispatch', async () => {
    const fixture = await startFixture(() => ({ body: {} }))
    expect(() => createAriesStorage({
      baseUrl: `${fixture.baseUrl}/v1/datalakes/other`, datalakeId: LAKE_ID, token: TOKEN,
    })).toThrow('does not match')
    expect(() => createAriesStorage({
      baseUrl: `${fixture.baseUrl}?secret=${TOKEN}`, datalakeId: LAKE_ID, token: TOKEN,
    })).toThrow('without credentials')
    const storage = createAriesStorage({
      baseUrl: fixture.baseUrl, datalakeId: LAKE_ID, token: TOKEN,
    })

    await expect(storage.get('../clear')).rejects.toThrow('Invalid XYO payload hash')
    expect(fixture.requests).toHaveLength(0)
  })

  it('checks a configured existing readiness hash without creating a payload', async () => {
    const fixture = await startFixture(({ url }) => url.endsWith('/usage')
      ? { body: { datalakeId: LAKE_ID, payloadCount: 0 } }
      : { status: 404, body: { code: 'not_found', message: 'missing' } })
    const storage = createAriesStorage({
      baseUrl: fixture.baseUrl, datalakeId: LAKE_ID, token: TOKEN, knownReadHash: HASH,
    })

    await expect(storage.checkReady()).rejects.toThrow('readiness payload was not found')
    expect(fixture.requests.map(request => request.method)).toEqual(['GET', 'GET'])
  })

  it('accepts an empty configured lake but refuses another lake in readiness evidence', async () => {
    let datalakeId = LAKE_ID
    const fixture = await startFixture(() => ({ body: { datalakeId, payloadCount: 0 } }))
    const storage = createAriesStorage({
      baseUrl: fixture.baseUrl, datalakeId: LAKE_ID, token: TOKEN,
    })

    await expect(storage.checkReady()).resolves.toBeUndefined()
    datalakeId = 'dl_other'
    await expect(storage.checkReady()).rejects.toThrow('invalid readiness evidence')
    expect(fixture.requests.map(request => [request.method, request.url])).toEqual([
      ['GET', `/v1/datalakes/${LAKE_ID}/usage`],
      ['GET', `/v1/datalakes/${LAKE_ID}/usage`],
    ])
  })
})
