import { normalizeRetrievedSamplePayload, SAMPLE_SCHEMA } from '@xyo-network/autodrive-sample-protocol'
import type { JwtPayload } from '@xyo-network/sdk'
import { verifyJwt } from '@xyo-network/sdk'
import type { SignedXl1TransactionEvidence, XyoViewer } from '@xyo-network/xl1-sdk'
import {
  asChainId, asSignedHydratedTransaction, createSignedXl1TransactionEvidence, DEFAULT_MAX_EXP_AHEAD, validateTransaction,
} from '@xyo-network/xl1-sdk'

import type { SampleConfiguration } from './configuration.js'
import { isRecord, requireCondition } from './errors.js'
import type { StoreIntent } from './ledger.js'

export type AdmissionChain = Pick<XyoViewer, 'chainId' | 'currentBlockNumber'>

function validateClaims(claims: JwtPayload, config: SampleConfiguration, intent: StoreIntent, signer: string, now: number) {
  const seconds = Math.floor(now / 1000)
  requireCondition(
    Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp)
    && claims.iat <= seconds && claims.exp > claims.iat && claims.exp - claims.iat <= 300,
    'authentication',
    'Authorization lifetime must be at most 300 seconds',
    401,
  )
  requireCondition(
    claims.schema === 'network.xyo.auth.signin' && claims.origin === config.origin
    && claims.purpose === 'autodrive-store' && claims.scope === 'payload:append',
    'authentication',
    'Authorization origin or purpose does not match',
    401,
  )
  requireCondition(
    claims.nonce === intent.nonce && claims.intentId === intent.id
    && claims.chainId === config.chainId && claims.payloadHash === intent.payloadHash,
    'authentication',
    'Authorization is bound to a different intent',
    401,
  )
  requireCondition(
    claims.iss.toLowerCase().replace(/^0x/u, '') === signer && config.allowedSigners.includes(signer),
    'signer',
    'This signer is not authorized',
    403,
  )
}

async function validateContent(evidence: SignedXl1TransactionEvidence, intent: StoreIntent) {
  const [witness, payloads] = evidence.transaction
  const fields = new Set([
    'schema',
    '$version',
    'addresses',
    '$signatures',
    'previous_hashes',
    'payload_hashes',
    'payload_schemas',
    'chain',
    'fees',
    'nbf',
    'exp',
    'from',
    '_hash',
    '_dataHash',
    '_sequence',
  ])
  requireCondition(Object.keys(witness).every(key => fields.has(key)), 'transaction-shape', 'Unexpected transaction fields or operations')
  requireCondition(witness.addresses.length === 1 && witness.addresses[0] === evidence.from, 'signer', 'Exactly the intended transaction signer is required')
  requireCondition(
    witness.script === undefined && witness.payload_hashes.length === 1 && witness.payload_schemas.length === 1 && payloads.length === 1,
    'payload-count',
    'Exactly one off-chain application payload and no script are allowed',
  )
  requireCondition(witness.payload_schemas[0] === SAMPLE_SCHEMA, 'schema', 'Transaction schema is not admitted')
  const payloadFields = new Set(['schema', 'salt', 'data', '_hash', '_dataHash', '_sequence'])
  requireCondition(Object.keys(payloads[0]).every(key => payloadFields.has(key)), 'payload-shape', 'Unexpected application payload metadata')
  const snapshot = await normalizeRetrievedSamplePayload(payloads[0])
  requireCondition(
    snapshot.hash === intent.payloadHash && snapshot.byteLength === intent.byteLength && witness.payload_hashes[0] === snapshot.hash,
    'payload-mismatch',
    'Signed payload differs from the approved intent',
  )
  return snapshot
}

interface ValidationOptions {
  chain: AdmissionChain
  config: SampleConfiguration
  evidence: unknown
  intent: StoreIntent
  now: number
  token: string
}

async function validateSignedIntent(options: ValidationOptions) {
  const {
    chain, config, intent, now,
  } = options
  requireCondition(isRecord(options.evidence), 'evidence', 'Signed transaction evidence is required')
  const supplied = options.evidence
  const transaction = asSignedHydratedTransaction(supplied.transaction, true)
  const evidence = await createSignedXl1TransactionEvidence(transaction)
  requireCondition(supplied.transactionHash === evidence.transactionHash && supplied.chainId === evidence.chainId, 'evidence', 'Evidence identity does not match its signed transaction')
  const actualChain = await chain.chainId()
  requireCondition(actualChain === config.chainId && evidence.chainId === config.chainId, 'wrong-chain', 'The configured and signed chain identities must match')
  const errors = await validateTransaction({ chainId: asChainId(config.chainId, true), singletons: {} }, evidence.transaction)
  requireCondition(errors.length === 0, 'invalid-transaction', 'Transaction signature, headers, fees, or protocol rules are invalid')
  const snapshot = await validateContent(evidence, intent)

  const verified = await verifyJwt(options.token, { audience: config.audience, now: Math.floor(now / 1000) })
  requireCondition(verified.ok, 'authentication', 'Wallet authorization is invalid or expired', 401)
  const signer = evidence.from.toLowerCase().replace(/^0x/u, '')
  validateClaims(verified.payload, config, intent, signer, now)
  return {
    evidence, signer, snapshot,
  }
}

export async function validateAdmission(options: ValidationOptions) {
  requireCondition(options.config.writeEnabled, 'writes-disabled', 'The operator has disabled writes', 403)
  const validated = await validateSignedIntent(options)
  const block = await options.chain.currentBlockNumber()
  const { evidence } = validated
  requireCondition(evidence.nbf <= block && block < evidence.exp, 'expired-transaction', 'Transaction is not currently valid')
  requireCondition(evidence.exp <= block + DEFAULT_MAX_EXP_AHEAD, 'transaction-expiry', 'Transaction expiration exceeds the supported mempool window')
  return validated
}

/** Expiration cannot prevent reading the outcome of an already dispatched upload. */
export async function validateReconciliation(options: ValidationOptions) {
  const { intent } = options
  requireCondition(
    intent.state === 'storage-uncertain' || intent.state === 'storage-verified',
    'intent-not-reserved',
    'Read-only reconciliation requires an already reserved intent',
    409,
  )
  const validated = await validateSignedIntent(options)
  requireCondition(
    intent.signer === validated.signer && intent.transactionHash === validated.evidence.transactionHash,
    'intent-consumed',
    'Intent is already bound to different signed evidence',
    409,
  )
  return validated
}
