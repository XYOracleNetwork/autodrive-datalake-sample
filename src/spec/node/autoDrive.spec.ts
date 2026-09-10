import {
  GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3'
import { AbstractModule } from '@xyo-network/sdk'
import type { MockInstance } from 'vitest'
import {
  afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi,
} from 'vitest'

import { createAutoDriveStorage } from '../../autoDrive.js'
import type { SamplePayload } from '../../payload.js'
import { normalizeSampleData, SAMPLE_SCHEMA } from '../../payload.js'

const KEY = 'synthetic-offline-provider-key'
const PREFIX = 'local/by-hash/'
type Command = GetObjectCommand | HeadObjectCommand | PutObjectCommand
type PromiseSender = (command: unknown) => Promise<unknown>
interface StoredObject { body: Uint8Array; metadata: Record<string, string> }

function missing() {
  return Object.assign(new Error('Synthetic missing object'), { $metadata: { httpStatusCode: 404 } })
}

describe('official Auto Drive storage adapter', () => {
  const previousLazyLoad = AbstractModule.enableLazyLoad
  const objects = new Map<string, StoredObject>()
  const requests: Command[] = []
  const owned: Awaited<ReturnType<typeof createAutoDriveStorage>>[] = []
  let failPut = false
  let hangReads = false
  let forbidden = false
  let send: MockInstance<PromiseSender>

  beforeAll(() => {
    AbstractModule.enableLazyLoad = true
  })
  afterAll(() => {
    AbstractModule.enableLazyLoad = previousLazyLoad
  })

  async function create(signal?: AbortSignal) {
    const storage = await createAutoDriveStorage({
      apiKey: KEY, bucket: 'autodrive-sample', namespace: 'local', signal,
    })
    owned.push(storage)
    return storage
  }

  function read(command: GetObjectCommand | HeadObjectCommand) {
    const value = objects.get(command.input.Key ?? '')
    if (value === undefined) throw missing()
    return {
      $metadata: {},
      Metadata: { ...value.metadata },
      Body: { transformToByteArray: () => Promise.resolve(new Uint8Array(value.body)) },
    }
  }

  function put(command: PutObjectCommand) {
    if (failPut) throw Object.assign(new Error(`Rejected ${KEY}`, { cause: new Error(KEY) }), { $metadata: { httpStatusCode: 503 } })
    const body = command.input.Body
    if (typeof body !== 'string' && !(body instanceof Uint8Array)) throw new Error('Unexpected SDK upload body')
    objects.set(command.input.Key ?? '', { body: Buffer.from(body), metadata: { ...command.input.Metadata } })
    return { $metadata: {} }
  }

  beforeEach(() => {
    objects.clear()
    requests.length = 0
    failPut = false
    hangReads = false
    forbidden = false
    const dispatch = async (command: unknown) => {
      if (!(command instanceof GetObjectCommand || command instanceof HeadObjectCommand || command instanceof PutObjectCommand)) {
        throw new TypeError('Listing, deletion, or unexpected provider operation is forbidden in this sample')
      }
      requests.push(command)
      if (forbidden) throw Object.assign(new Error(`Authorization failed: ${KEY}`), { $metadata: { httpStatusCode: 403 } })
      if (command instanceof PutObjectCommand) return put(command)
      if (hangReads) return await new Promise(() => { /* Controlled stalled provider boundary. */ })
      return read(command)
    }
    // The AWS send API overloads callbacks and promises; this fixture implements its promise form.
    const clientPrototype = S3Client.prototype as { send: PromiseSender }
    send = vi.spyOn(clientPrototype, 'send').mockImplementation(dispatch)
  })

  afterEach(async () => {
    for (const storage of owned) await storage.close()
    owned.length = 0
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('creates without requests and probes readiness with one authenticated HEAD and no permanent write', async () => {
    const storage = await create()
    expect(requests).toHaveLength(0)
    await storage.checkReady()
    expect(requests).toHaveLength(1)
    expect(requests[0]).toBeInstanceOf(HeadObjectCommand)
    expect(requests[0]?.input).toEqual({ Bucket: 'autodrive-sample', Key: `${PREFIX}${'0'.repeat(64)}` })
    expect(storage.identity).toBe('https://s3.auto-drive.autonomys.xyz/autodrive-sample/local')
    const client = send.mock.contexts[0]
    expect(client).toBeInstanceOf(S3Client)
    if (!(client instanceof S3Client)) throw new Error('The official SDK must create the client')
    expect(await client.config.maxAttempts()).toBe(1)
    expect(client.config.forcePathStyle).toBe(true)
    expect(await client.config.credentials()).toMatchObject({ accessKeyId: KEY, secretAccessKey: 'autodrive' })
    expect(JSON.stringify(storage)).not.toContain(KEY)
  })

  it('stores the canonical payload and published SDK index, then reconciles duplicates after reopening', async () => {
    const storage = await create()
    const sample = await normalizeSampleData('{"message":"hello"}')
    await storage.insert(sample.payload)
    const primaryKey = `${PREFIX}${sample.hash}`
    const stored = objects.get(primaryKey)
    expect(stored).toBeDefined()
    expect(JSON.parse(Buffer.from(stored?.body ?? []).toString('utf8'))).toEqual(sample.payload)
    expect(requests.at(-1)).toBeInstanceOf(GetObjectCommand)
    const reopened = await create()
    await reopened.insert(sample.payload)
    const writes = requests.filter(command => command instanceof PutObjectCommand && command.input.Key === primaryKey)
    expect(writes).toHaveLength(1)
    expect(requests.filter(command => command instanceof PutObjectCommand)).toHaveLength(2)
    const indexes = objects.entries().filter(([key]) => key.startsWith('local/by-seq/')).toArray()
    expect(indexes).toHaveLength(1)
    expect(indexes[0][0]).toMatch(new RegExp(`${sample.hash}$`, 'u'))
    expect(indexes[0][1].body.byteLength).toBe(0)
    expect(objects.size).toBe(2)
    const fresh = await reopened.get(sample.hash)
    expect(fresh).toMatchObject({ ...sample.payload, _hash: sample.hash })
    expect(requests.at(-1)).toBeInstanceOf(GetObjectCommand)
  })

  it('rejects wrong-schema, oversized, and envelope payloads before any provider operation', async () => {
    const storage = await create()
    const invalid = [
      { schema: 'other', data: {} },
      { schema: SAMPLE_SCHEMA, data: 'x'.repeat(4096) },
      {
        schema: SAMPLE_SCHEMA, data: {}, $signatures: ['not-a-carrier'],
      },
    ]
    for (const payload of invalid) await expect(storage.insert(payload as SamplePayload)).rejects.toThrow()
    expect(requests).toHaveLength(0)
  })

  it('deduplicates concurrent identical payloads within one adapter and stores a new salt as a new identity', async () => {
    const storage = await create()
    const first = await normalizeSampleData('{"message":"same data"}')
    const salted = await normalizeSampleData('{"message":"same data"}')
    expect(first.payload.data).toEqual(salted.payload.data)
    expect(first.hash).not.toBe(salted.hash)
    await Promise.all([storage.insert(first.payload), storage.insert(first.payload)])
    await storage.insert(salted.payload)
    const primaryWrites = requests.filter(command => command instanceof PutObjectCommand && command.input.Key?.startsWith(PREFIX) === true)
    expect(primaryWrites.map(command => command.input.Key).toSorted()).toEqual([`${PREFIX}${first.hash}`, `${PREFIX}${salted.hash}`].toSorted())
    expect(requests.filter(command => command instanceof PutObjectCommand)).toHaveLength(4)
    expect(await storage.get(first.hash)).toMatchObject(first.payload)
    expect(await storage.get(salted.hash)).toMatchObject(salted.payload)
  })

  it('rejects corrupt remote content even after a successful insert', async () => {
    const storage = await create()
    const sample = await normalizeSampleData('{"message":"hello"}')
    await storage.insert(sample.payload)
    const object = objects.get(`${PREFIX}${sample.hash}`)
    if (object === undefined) throw new Error('The actual SDK must store the primary object')
    object.body = Buffer.from(JSON.stringify({ schema: SAMPLE_SCHEMA, data: { message: 'corrupted' } }))
    await expect(storage.get(sample.hash)).rejects.toThrow('Auto Drive payload retrieval failed')
  })

  it('redacts a failed permanent write and never retries it automatically', async () => {
    const storage = await create()
    const sample = await normalizeSampleData('{}')
    failPut = true
    let failure: unknown
    try {
      await storage.insert(sample.payload)
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toContain('reconcile before retrying')
    expect(String(failure)).not.toContain(KEY)
    expect(JSON.stringify(failure)).not.toContain(KEY)
    expect(failure).not.toHaveProperty('cause')
    expect(requests.filter(command => command instanceof PutObjectCommand)).toHaveLength(1)
  })

  it('rejects failed authentication instead of treating it as an absent readiness object', async () => {
    const storage = await create()
    forbidden = true
    await expect(storage.checkReady()).rejects.toThrow('HTTP 403')
    expect(requests).toHaveLength(1)
  })

  it('cancels a stalled read and closes idempotently without allowing later operations', async () => {
    const controller = new AbortController()
    const storage = await create(controller.signal)
    hangReads = true
    const operation = expect(storage.checkReady()).rejects.toThrow('cancelled or timed out')
    controller.abort()
    await operation
    await Promise.all([storage.close(), storage.close()])
    await expect(storage.checkReady()).rejects.toThrow('stopped')
    expect(requests).toHaveLength(1)
  })

  it('bounds a stalled provider operation without retrying it', async () => {
    const storage = await create()
    vi.useFakeTimers()
    hangReads = true
    const operation = expect(storage.checkReady()).rejects.toThrow('cancelled or timed out')
    await vi.advanceTimersByTimeAsync(65_001)
    await operation
    expect(requests).toHaveLength(1)
  })
})
