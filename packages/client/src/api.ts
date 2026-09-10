import {
  createSampleProfile, MAX_PAYLOAD_BYTES, normalizeRetrievedSamplePayload, SAMPLE_SCHEMA,
} from '@xyo-network/autodrive-sample-protocol'

import type {
  SampleApi, SampleConfiguration, StorageConfirmation, StoreIntent, StoreIntentStatus,
} from './contracts.js'

export function record(value: unknown, description: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${description} must be an object`)
  }
  return value as Record<string, unknown>
}

function textField(value: Record<string, unknown>, key: string) {
  const field = value[key]
  if (typeof field !== 'string' || field.length === 0) throw new TypeError(`Invalid response field: ${key}`)
  return field
}

function numberField(value: Record<string, unknown>, key: string) {
  const field = value[key]
  if (typeof field !== 'number' || !Number.isSafeInteger(field) || field < 0) {
    throw new TypeError(`Invalid response field: ${key}`)
  }
  return field
}

export function parseConfiguration(input: unknown): SampleConfiguration {
  const value = record(input, 'Configuration')
  if (value.schema !== SAMPLE_SCHEMA || value.maxPayloadBytes !== MAX_PAYLOAD_BYTES) {
    throw new Error('The website and service have incompatible payload policies')
  }
  if (typeof value.writeEnabled !== 'boolean') throw new TypeError('Invalid write-enabled state')
  const config: SampleConfiguration = {
    schema: textField(value, 'schema'),
    maxPayloadBytes: numberField(value, 'maxPayloadBytes'),
    chainId: textField(value, 'chainId'),
    networkId: textField(value, 'networkId'),
    writeEnabled: value.writeEnabled,
    status: textField(value, 'status'),
    audience: textField(value, 'audience'),
    origin: textField(value, 'origin'),
  }
  if (value.transactionValidityBlocks !== undefined) {
    config.transactionValidityBlocks = numberField(value, 'transactionValidityBlocks')
  }
  createSampleProfile(config.chainId, config.networkId)
  return config
}

export function parseIntent(input: unknown): StoreIntent {
  const value = record(input, 'Store intent')
  return {
    id: textField(value, 'id'),
    nonce: textField(value, 'nonce'),
    expiresAt: numberField(value, 'expiresAt'),
    payloadHash: textField(value, 'payloadHash'),
    chainId: textField(value, 'chainId'),
  }
}

export function parseConfirmation(input: unknown): StorageConfirmation {
  const value = record(input, 'Storage confirmation')
  if (value.state !== 'storage-verified') throw new Error('Storage has not been verified')
  return {
    intentId: textField(value, 'intentId'),
    signer: textField(value, 'signer'),
    payloadHash: textField(value, 'payloadHash'),
    transactionHash: textField(value, 'transactionHash'),
    chainId: textField(value, 'chainId'),
    byteLength: numberField(value, 'byteLength'),
    verifiedAt: numberField(value, 'verifiedAt'),
    state: 'storage-verified',
  }
}

function parseIntentStatus(input: unknown): StoreIntentStatus {
  const value = record(input, 'Intent status')
  return {
    ...parseIntent(input),
    state: textField(value, 'state'),
    byteLength: numberField(value, 'byteLength'),
    ...(value.transactionHash === undefined ? {} : { transactionHash: textField(value, 'transactionHash') }),
    ...(value.signer === undefined ? {} : { signer: textField(value, 'signer') }),
    ...(value.verifiedAt === undefined ? {} : { verifiedAt: numberField(value, 'verifiedAt') }),
  }
}

/** The sample owns these HTTP routes; XL1 and Aries protocol RPC stays in their SDKs. */
export function createSampleApi(baseUrl = '', fetcher: typeof fetch = fetch): SampleApi {
  async function request(path: string, options?: RequestInit) {
    const response = await fetcher(`${baseUrl}${path}`, {
      cache: 'no-store',
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...options?.headers },
    })
    const body: unknown = await response.json()
    if (!response.ok) {
      const error = record(body, 'Service error')
      const message = typeof error.message === 'string'
        ? error.message
        : typeof error.error === 'string' ? error.error : `Service request failed (${response.status})`
      throw new Error(message)
    }
    return body
  }

  return {
    configuration: async () => parseConfiguration(await request('/api/config')),
    createIntent: async payload => parseIntent(await request('/api/store-intents', { method: 'POST', body: JSON.stringify({ payload }) })),
    confirm: async (intentId, token, evidence) => parseConfirmation(await request(`/api/store-intents/${encodeURIComponent(intentId)}/confirm`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ evidence }),
    })),
    intent: async intentId => parseIntentStatus(await request(`/api/store-intents/${encodeURIComponent(intentId)}`)),
    reconcile: async (intentId, token, evidence) => parseConfirmation(await request(`/api/store-intents/${encodeURIComponent(intentId)}/reconcile`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ evidence }),
    })),
    async payload(hash) {
      const body = record(await request(`/api/payloads/${encodeURIComponent(hash)}`), 'Retrieved payload')
      const normalized = await normalizeRetrievedSamplePayload(body.payload)
      if (normalized.hash !== hash || body.hash !== hash || body.byteLength !== normalized.byteLength
        || body.canonicalJson !== normalized.canonicalJson) {
        throw new Error('Retrieved payload bytes or XYO hash do not match the requested content')
      }
      return normalized
    },
  }
}
