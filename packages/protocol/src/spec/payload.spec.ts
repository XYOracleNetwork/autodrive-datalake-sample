import { PayloadBuilder } from '@xyo-network/sdk'
import {
  describe, expect, it,
} from 'vitest'

import {
  createSampleSalt,
  MAX_PAYLOAD_BYTES,
  normalizeRetrievedSamplePayload,
  normalizeSampleData,
  normalizeSamplePayload,
  normalizeSamplePayloadText,
  SAMPLE_SCHEMA,
} from '../index.js'

const salt = 'ab'.repeat(32)

describe('sample payload admission', () => {
  it('gives new drafts independent random salts while repeated parsing preserves the complete approved payload', async () => {
    const first = await normalizeSampleData('{"message":"hello"}')
    const second = await normalizeSampleData('{"message":"hello"}')

    expect(first.payload.salt).toMatch(/^[0-9a-f]{64}$/u)
    expect(createSampleSalt()).toMatch(/^[0-9a-f]{64}$/u)
    expect(second.payload.salt).not.toBe(first.payload.salt)
    expect(second.hash).not.toBe(first.hash)
    expect(await normalizeSamplePayloadText(first.canonicalJson)).toEqual(first)
    expect(await normalizeSamplePayloadText(JSON.stringify(first.payload, null, 2))).toEqual(first)
  })

  it.each([undefined, '', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64), 42])('rejects missing or malformed salt: %s', async (invalid) => {
    await expect(normalizeSamplePayload({
      schema: SAMPLE_SCHEMA, salt: invalid, data: {},
    })).rejects.toThrow()
  })

  it('rejects duplicate schema or salt fields in the complete editor payload', async () => {
    await expect(normalizeSamplePayloadText(`{"schema":"${SAMPLE_SCHEMA}","schema":"${SAMPLE_SCHEMA}","salt":"${salt}","data":{}}`)).rejects.toThrow()
    await expect(normalizeSamplePayloadText(`{"schema":"${SAMPLE_SCHEMA}","salt":"${salt}","salt":"${salt}","data":{}}`)).rejects.toThrow()
  })

  it('captures canonical UTF-8 bytes and the SDK root identity independent of input key order', async () => {
    const first = await normalizeSampleData(' { "z": [true, null], "a": "é😀" } ', salt)
    const second = await normalizeSampleData('{"a":"é😀","z":[true,null]}', salt)

    expect(first).toEqual(second)
    expect(first.canonicalJson).toBe(`{"data":{"a":"é😀","z":[true,null]},"salt":"${salt}","schema":"${SAMPLE_SCHEMA}"}`)
    expect(first.byteLength).toBe(first.canonicalJson.length + 3)
    expect(first.hash).toBe(await PayloadBuilder.hash(first.payload))
  })

  it.each([4095, 4096, 4097])('enforces the full wrapper at %i UTF-8 bytes with non-ASCII content', async (target) => {
    const base = await normalizeSampleData('{"text":""}')
    const available = target - base.byteLength
    const text = 'é'.repeat(Math.floor(available / 2)) + 'a'.repeat(available % 2)
    const normalization = normalizeSampleData(JSON.stringify({ text }))

    if (target > MAX_PAYLOAD_BYTES) await expect(normalization).rejects.toThrow('maximum is 4096')
    else {
      const normalized = await normalization
      expect(normalized.byteLength).toBe(target)
    }
  })

  it.each([
    '{"a":1,"a":2}',
    '{"nested":{"a":1,"a":2}}',
    '{"n":9007199254740992}',
    '{"n":1e400}',
    String.raw`{"text":"\ud800"}`,
    '[1,2]',
    'null',
  ])('rejects ambiguous or non-object editor JSON: %s', async (text) => {
    await expect(normalizeSampleData(text)).rejects.toThrow()
  })

  it.each(['_hash', '_dataHash', '_sequence', '$version', '$signatures', 'payload_hashes', 'extra'])('rejects supplied root field %s before admission', async (key) => {
    await expect(normalizeSamplePayload({
      schema: SAMPLE_SCHEMA, salt, data: {}, [key]: 'untrusted',
    })).rejects.toThrow()
  })

  it('rejects a foreign schema and non-object data', async () => {
    await expect(normalizeSamplePayload({ schema: 'network.xyo.other', data: {} })).rejects.toThrow()
    await expect(normalizeSamplePayload({
      schema: SAMPLE_SCHEMA, salt, data: [],
    })).rejects.toThrow()
  })

  it('uses the complete payload depth limit for editor and object inputs', async () => {
    let data: unknown = 1
    for (let index = 0; index < 15; index++) data = { nested: data }
    await expect(normalizeSampleData(JSON.stringify(data))).resolves.toHaveProperty('hash')

    const excessive = { nested: data }
    await expect(normalizeSampleData(JSON.stringify(excessive))).rejects.toThrow('nesting exceeds 16')
    await expect(normalizeSamplePayload({
      schema: SAMPLE_SCHEMA, salt, data: excessive,
    })).rejects.toThrow('nesting exceeds 16')
  })

  it('takes an independent immutable snapshot before asynchronous identity work', async () => {
    const data = { nested: { value: 'approved' }, values: [1, 2] }
    const pending = normalizeSamplePayload({
      schema: SAMPLE_SCHEMA, salt, data,
    })
    data.nested.value = 'edited after approval'
    data.values.push(3)
    const snapshot = await pending

    expect(snapshot.payload.data).toEqual({ nested: { value: 'approved' }, values: [1, 2] })
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.payload.data.nested)).toBe(true)
    expect(Object.isFrozen(snapshot.payload.data.values)).toBe(true)
    expect(snapshot.hash).toBe(await PayloadBuilder.hash(snapshot.payload))
  })

  it('removes only root storage metadata on retrieval and preserves nested content', async () => {
    const approved = await normalizeSampleData('{"_nested":"content","value":1}')
    const retrieved = await normalizeRetrievedSamplePayload({
      ...approved.payload, _hash: 'ignored', _sequence: 17,
    })

    expect(retrieved).toEqual(approved)
    await expect(normalizeRetrievedSamplePayload({ ...approved.payload, $version: 1_000_000 })).rejects.toThrow()
    await expect(normalizeRetrievedSamplePayload({ ...approved.payload, extra: true })).rejects.toThrow()
  })

  it('preserves prototype-shaped JSON keys as ordinary data', async () => {
    const snapshot = await normalizeSampleData('{"__proto__":{"safe":true},"constructor":"data"}')

    expect(Object.hasOwn(snapshot.payload.data, '__proto__')).toBe(true)
    expect(snapshot.canonicalJson).toContain('"__proto__":{"safe":true}')
    expect(snapshot.hash).toBe(await PayloadBuilder.hash(snapshot.payload))
  })

  it('rejects cyclic object values and accessors without invoking a getter', async () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.cycle = cyclic
    await expect(normalizeSamplePayload({
      schema: SAMPLE_SCHEMA, salt, data: cyclic,
    })).rejects.toThrow('Cyclic')

    let invoked = false
    const data = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get() {
        invoked = true
        return 'unexpected'
      },
    })
    await expect(normalizeSamplePayload({
      schema: SAMPLE_SCHEMA, salt, data,
    })).rejects.toThrow()
    expect(invoked).toBe(false)
  })
})
