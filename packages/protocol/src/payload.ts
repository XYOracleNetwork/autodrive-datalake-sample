import {
  zodAsFactory, zodIsFactory, zodToFactory,
} from '@ariestools/sdk'
import {
  bytesToHex, randomBytes, utf8ToBytes,
} from '@noble/hashes/utils.js'
import { canonicalizeIJson, parseStrictJsonText } from '@xyo-network/dapp-kit'
import {
  asSchema, PayloadBuilder, PayloadZodStrictOfSchema,
} from '@xyo-network/sdk'
import * as z from 'zod/mini'

import { freezeJson } from './freeze.js'

// The explicit PRD contract retains this prescribed schema name.
export const SAMPLE_SCHEMA = asSchema('com.example.message', true)
export const MAX_PAYLOAD_BYTES = 4096
export const MAX_JSON_DEPTH = 16

export const SamplePayloadZod = z.extend(PayloadZodStrictOfSchema(SAMPLE_SCHEMA), {
  data: z.record(z.string(), z.json()),
  salt: z.string().check(z.regex(/^[0-9a-f]{64}$/u, 'Salt must be 32 bytes encoded as 64 lowercase hexadecimal characters')),
})
  .check(z.refine(value => !Object.hasOwn(value, '$version'), 'Only schema, salt, and data are admitted at the payload root'))

export type SamplePayload = z.infer<typeof SamplePayloadZod>
export const isSamplePayload = zodIsFactory(SamplePayloadZod)
export const asSamplePayload = zodAsFactory(SamplePayloadZod, 'asSamplePayload')
export const toSamplePayload = zodToFactory(SamplePayloadZod, 'toSamplePayload')

export interface NormalizedSamplePayload {
  readonly byteLength: number
  readonly canonicalJson: string
  readonly hash: string
  readonly payload: SamplePayload
}

/** Bound object inputs before the recursive canonical encoder, without executing getters. */
function assertBoundedTree(value: unknown, depth = 0, ancestors = new Set<object>()): void {
  if (depth > MAX_JSON_DEPTH) throw new TypeError(`JSON nesting exceeds ${MAX_JSON_DEPTH}`)
  if (value === null || typeof value !== 'object') return
  if (ancestors.has(value)) throw new TypeError('Cyclic values are not JSON')
  ancestors.add(value)
  for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
    if (Array.isArray(value) && key === 'length') continue
    if ('value' in descriptor) assertBoundedTree(descriptor.value, depth + 1, ancestors)
  }
  ancestors.delete(value)
}

/** Validate and capture one immutable complete app payload before awaiting its hash. */
export async function normalizeSamplePayload(value: unknown): Promise<NormalizedSamplePayload> {
  assertBoundedTree(value)
  const canonicalJson = canonicalizeIJson(value)
  const parsed = parseStrictJsonText(canonicalJson, {
    maximumDepth: MAX_JSON_DEPTH,
    requireTopLevelObject: true,
  })
  SamplePayloadZod.parse(parsed)
  // Retain the validated source tree: admission must never silently strip a data key.
  const payload = parsed as SamplePayload
  const byteLength = utf8ToBytes(canonicalJson).byteLength
  if (byteLength > MAX_PAYLOAD_BYTES) {
    throw new RangeError(`Payload is ${byteLength} UTF-8 bytes; maximum is ${MAX_PAYLOAD_BYTES}`)
  }
  freezeJson(payload)
  const hash = await PayloadBuilder.hash(payload)
  return Object.freeze({
    payload, canonicalJson, byteLength, hash,
  })
}

/** Generate a public, cryptographically random 256-bit salt once per new draft. */
export function createSampleSalt() {
  return bytesToHex(randomBytes(32))
}

/** Build a new salted payload from data; pass the existing salt to preserve its identity. */
export async function normalizeSampleData(text: string, salt = createSampleSalt()): Promise<NormalizedSamplePayload> {
  const data = parseStrictJsonText(text, {
    maximumDepth: MAX_JSON_DEPTH,
    requireTopLevelObject: true,
  })
  return await normalizeSamplePayload({
    schema: SAMPLE_SCHEMA, salt, data,
  })
}

/** Parse the complete editor payload without changing its schema, salt, or data. */
export async function normalizeSamplePayloadText(text: string): Promise<NormalizedSamplePayload> {
  return await normalizeSamplePayload(parseStrictJsonText(text, {
    maximumDepth: MAX_JSON_DEPTH,
    requireTopLevelObject: true,
  }))
}

/** Only retrieved storage objects may shed SDK storage metadata; client metadata is rejected. */
export async function normalizeRetrievedSamplePayload(value: unknown): Promise<NormalizedSamplePayload> {
  assertBoundedTree(value)
  // Validate the untrusted object before the SDK projection can read properties.
  const parsed = parseStrictJsonText(canonicalizeIJson(value), {
    maximumDepth: MAX_JSON_DEPTH,
    requireTopLevelObject: true,
  })
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('Retrieved payload must be an object')
  }
  return await normalizeSamplePayload(PayloadBuilder.omitStorageMeta(parsed, 1))
}
