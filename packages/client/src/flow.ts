import {
  createSampleProfile, normalizeRetrievedSamplePayload, normalizeSamplePayload, normalizeSamplePayloadText, SAMPLE_SCHEMA,
} from '@xyo-network/autodrive-sample-protocol'
import type { SignedXl1TransactionEvidence, TransactionInclusion } from '@xyo-network/xl1-sdk'
import {
  asSignedHydratedTransaction,
  asXL1BlockNumber,
  broadcastXl1Transaction,
  buildXl1Transaction,
  createSignedXl1TransactionEvidence,
  DEFAULT_MAX_EXP_AHEAD,
  observeXl1TransactionFinality,
  observeXl1TransactionInclusion,
  signXl1Transaction,
} from '@xyo-network/xl1-sdk'

import {
  parseConfirmation, parseIntent, record,
} from './api.js'
import type {
  FlowOptions, FlowProgress, PendingOperation, ResumeAnchorOptions, StorageConfirmation, StoreAndAnchorOptions,
} from './contracts.js'

function guard(options: FlowOptions) {
  options.signal?.throwIfAborted()
  options.assertCurrent?.()
}

function progress(options: FlowOptions, stage: FlowProgress['stage'], message: string, pending?: PendingOperation) {
  options.onProgress?.({
    stage,
    message,
    ...(pending ? { payloadHash: pending.normalized.hash, transactionHash: pending.evidence.transactionHash } : {}),
  })
}

async function assertWallet(options: FlowOptions, signerAddress?: string) {
  guard(options)
  const [chainId, address] = await Promise.all([options.wallet.viewer.chainId(), options.wallet.signer.address()])
  guard(options)
  if (chainId !== options.config.chainId) throw new Error('Wallet network changed or does not match the configured chain')
  if (signerAddress !== undefined && address !== signerAddress) {
    throw new Error('Wallet account changed. Reconnect the account that signed this transaction')
  }
  return address
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

async function captureEvidence(
  evidence: SignedXl1TransactionEvidence,
  normalized: PendingOperation['normalized'],
  chainId: string,
  signer?: string,
) {
  const captured = await createSignedXl1TransactionEvidence(
    asSignedHydratedTransaction(structuredClone(evidence.transaction), true),
  )
  const [transaction, payloads] = captured.transaction
  if (captured.transactionHash !== evidence.transactionHash || captured.chainId !== chainId
    || (signer !== undefined && captured.from !== signer)
    || transaction.payload_hashes.length !== 1 || transaction.payload_hashes[0] !== normalized.hash
    || transaction.payload_schemas.length !== 1 || transaction.payload_schemas[0] !== SAMPLE_SCHEMA
    || payloads.length !== 1 || (transaction.script?.length ?? 0) !== 0) {
    throw new Error('The wallet returned evidence that does not match the approved single payload')
  }
  const signedPayload = await normalizeRetrievedSamplePayload(payloads[0])
  if (signedPayload.canonicalJson !== normalized.canonicalJson || signedPayload.hash !== normalized.hash) {
    throw new Error('The signed payload changed after approval')
  }
  return freeze(captured)
}

export function assertStorageConfirmation(pending: PendingOperation, confirmation: StorageConfirmation) {
  if (confirmation.state !== 'storage-verified' || confirmation.intentId !== pending.intent.id
    || confirmation.signer !== pending.evidence.from || confirmation.payloadHash !== pending.normalized.hash
    || confirmation.transactionHash !== pending.evidence.transactionHash || confirmation.chainId !== pending.chainId
    || confirmation.byteLength !== pending.normalized.byteLength || confirmation.verifiedAt <= 0) {
    throw new Error('Storage confirmation does not match this account, intent, payload, and signed transaction')
  }
}

async function assertFreshRead(options: FlowOptions, pending: PendingOperation) {
  const retrieved = await options.api.payload(pending.normalized.hash)
  if (retrieved.hash !== pending.normalized.hash || retrieved.canonicalJson !== pending.normalized.canonicalJson
    || retrieved.byteLength !== pending.normalized.byteLength) {
    throw new Error('Fresh storage retrieval does not match the approved payload')
  }
}

async function assertUnexpired(options: FlowOptions, pending: PendingOperation) {
  const head = await options.wallet.viewer.currentBlockNumber()
  if (head >= pending.evidence.exp) {
    throw new Error('The signed transaction expired. Stored content remains retrievable; start a new explicit approval to anchor it')
  }
}

async function finalized(options: FlowOptions, pending: PendingOperation) {
  const inclusion = await observeXl1TransactionInclusion(options.wallet.viewer.block, pending.evidence.transactionHash)
  if (inclusion === null) return
  const result = await observeXl1TransactionFinality(options.wallet.viewer.block, inclusion)
  if (result === null) return
  await assertFreshRead(options, pending)
  options.onProgress?.({
    stage: 'complete',
    message: 'Payload retrieval verified and transaction finalized on the configured XL1 chain.',
    payloadHash: pending.normalized.hash,
    transactionHash: pending.evidence.transactionHash,
    blockNumber: result.blockNumber,
  })
  return result
}

function flowResult(pending: PendingOperation, inclusion?: TransactionInclusion) {
  return {
    pending,
    inclusion,
    confirmation: pending.confirmation,
    evidence: pending.evidence,
    normalized: pending.normalized,
  }
}

async function waitForFinality(options: FlowOptions, pending: PendingOperation) {
  const deadline = Date.now() + (options.finalityTimeoutMs ?? 90_000)
  const stage = pending.broadcastAcknowledged === true ? 'pending' : 'broadcast-unknown'
  progress(options, stage, 'Checking the known transaction hash for finalized chain inclusion.', pending)
  do {
    await assertWallet(options, pending.evidence.from)
    const result = await finalized(options, pending)
    if (result) return flowResult(pending, result)
    await assertUnexpired(options, pending)
    await new Promise<void>((resolve) => {
      setTimeout(resolve, options.pollIntervalMs ?? 1500)
    })
  } while (Date.now() < deadline)
  progress(options, stage, 'Finality is not yet confirmed. Keep this transaction and check again; no new upload is needed.', pending)
  return flowResult(pending)
}

async function anchor(options: FlowOptions, initial: PendingOperation, retryBroadcast = false) {
  let pending = initial
  await assertWallet(options, pending.evidence.from)
  if (!pending.confirmation) throw new Error('Storage must be verified before broadcast')
  assertStorageConfirmation(pending, pending.confirmation)
  await assertFreshRead(options, pending)
  // Always reconcile the known transaction hash before a recovery action.
  const alreadyFinalized = await finalized(options, pending)
  if (alreadyFinalized) return flowResult(pending, alreadyFinalized)
  if (pending.broadcastAttempted && !retryBroadcast) return await waitForFinality(options, pending)
  await assertUnexpired(options, pending)
  await assertWallet(options, pending.evidence.from)
  pending = { ...pending, broadcastAttempted: true }
  options.onPending?.(pending)
  progress(options, 'broadcasting', 'Approve broadcast in Chrome Wallet. The exact signed evidence is already stored and verified.', pending)
  try {
    await broadcastXl1Transaction(options.wallet.runner, pending.evidence)
    pending = { ...pending, broadcastAcknowledged: true }
    options.onPending?.(pending)
  } catch (error) {
    progress(options, 'broadcast-unknown', 'Broadcast was rejected or its result is unknown. Storage remains verified; check the known transaction hash before another action.', pending)
    throw error
  }
  return await waitForFinality(options, pending)
}

async function confirmStorage(options: FlowOptions, initial: PendingOperation, reconcile = false) {
  let pending = initial
  await assertWallet(options, pending.evidence.from)
  if (!reconcile) await assertUnexpired(options, pending)
  progress(options, 'authenticating', 'Approve the detached storage authorization in Chrome Wallet. It is never stored as a payload.', pending)
  const signedJwt = await options.wallet.signer.signJwt({
    audience: options.config.audience,
    schema: 'network.xyo.auth.signin',
    ttl: 300,
    claims: {
      purpose: 'autodrive-store',
      scope: 'payload:append',
      nonce: pending.intent.nonce,
      intentId: pending.intent.id,
      chainId: pending.chainId,
      payloadHash: pending.normalized.hash,
    },
  })
  if (signedJwt.payload.iss !== pending.evidence.from || signedJwt.payload.aud !== options.config.audience
    || signedJwt.payload.origin !== options.config.origin) {
    throw new Error('Wallet authorization does not bind the expected signer, audience, and invoking origin')
  }
  await assertWallet(options, pending.evidence.from)
  if (!reconcile) await assertUnexpired(options, pending)
  progress(options, 'storing', reconcile
    ? 'Reconciling the reserved payload by hash with a read-only request. No new upload is requested.'
    : 'Storing the single application payload and checking fresh retrieval.', pending)
  const confirmation = reconcile
    ? await options.api.reconcile(pending.intent.id, signedJwt.token, pending.evidence)
    : await options.api.confirm(pending.intent.id, signedJwt.token, pending.evidence)
  assertStorageConfirmation(pending, confirmation)
  pending = { ...pending, confirmation: freeze(confirmation) }
  options.onPending?.(pending)
  await assertFreshRead(options, pending)
  progress(options, 'storage-verified', 'Payload read-back is verified. Chain anchoring is checked separately.', pending)
  return pending
}

/** Identical browser and Vitest orchestration; signing and broadcast stay behind the supplied wallet. */
export async function storeAndAnchor(options: StoreAndAnchorOptions) {
  guard(options)
  if (!options.config.writeEnabled) throw new Error('The operator has disabled storage writes')
  createSampleProfile(options.config.chainId, options.config.networkId)
  progress(options, 'preparing', 'Validating the payload, configured chain, and wallet account.')
  const normalized = await normalizeSamplePayloadText(options.payloadText)
  const signer = await assertWallet(options)
  const intent = await options.api.createIntent(normalized.payload)
  if (intent.payloadHash !== normalized.hash || intent.chainId !== options.config.chainId) {
    throw new Error('The service returned an intent for different content or a different chain')
  }
  const nbf = await options.wallet.viewer.currentBlockNumber()
  const validityBlocks = options.validityBlocks ?? options.config.transactionValidityBlocks ?? 120
  if (!Number.isSafeInteger(validityBlocks) || validityBlocks <= 0 || validityBlocks > DEFAULT_MAX_EXP_AHEAD) {
    throw new Error(`Transaction validity must be from 1 to ${DEFAULT_MAX_EXP_AHEAD} blocks for this SDK chain policy`)
  }
  const unsigned = await buildXl1Transaction(options.wallet.viewer, options.wallet.signer, [], [normalized.payload], {
    nbf,
    exp: asXL1BlockNumber(nbf + validityBlocks, true),
  })
  await assertWallet(options, signer)
  progress(options, 'signing', 'Approve the transaction in Chrome Wallet. Exactly one application payload is referenced.')
  const evidence = await captureEvidence(await signXl1Transaction(options.wallet.signer, unsigned), normalized, options.config.chainId, signer)
  let pending: PendingOperation = {
    origin: options.config.origin,
    chainId: options.config.chainId,
    networkId: options.config.networkId,
    normalized,
    intent,
    evidence,
    broadcastAttempted: false,
  }
  options.onPending?.(pending)
  pending = await confirmStorage(options, pending)
  return await anchor(options, pending)
}

/** Resume the same signed transaction; uncertain broadcasts are queried without automatic resubmission. */
export async function resumeAnchor(options: ResumeAnchorOptions) {
  let pending = await restorePendingOperation(options.pending, options.config)
  await assertWallet(options, pending.evidence.from)
  if (!pending.confirmation) {
    const status = await options.api.intent(pending.intent.id)
    if (status.state === 'storage-uncertain' || status.state === 'storage-verified') {
      pending = await confirmStorage(options, pending, true)
    } else {
      if (!options.config.writeEnabled) throw new Error('The operator has disabled storage writes')
      pending = await confirmStorage(options, pending)
    }
  }
  return await anchor(options, pending, options.retryBroadcast)
}

/** Revalidate public signed recovery state before trusting browser session storage. */
export async function restorePendingOperation(input: unknown, config: FlowOptions['config']): Promise<PendingOperation> {
  const saved = record(input, 'Saved operation')
  if (saved.origin !== config.origin || saved.chainId !== config.chainId || saved.networkId !== config.networkId) {
    throw new Error('The saved operation belongs to another origin or configured network')
  }
  if (typeof saved.broadcastAttempted !== 'boolean') throw new Error('Invalid saved broadcast state')
  const normalized = await normalizeSamplePayload(record(saved.normalized, 'Saved payload').payload)
  const rawEvidence = record(saved.evidence, 'Saved evidence')
  const signed = await createSignedXl1TransactionEvidence(asSignedHydratedTransaction(rawEvidence.transaction, true))
  if (signed.transactionHash !== rawEvidence.transactionHash) throw new Error('Saved transaction hash does not match signed evidence')
  const evidence = await captureEvidence(signed, normalized, config.chainId)
  const intent = parseIntent(saved.intent)
  if (intent.payloadHash !== normalized.hash || intent.chainId !== config.chainId) throw new Error('Saved intent does not match its payload')
  const pending: PendingOperation = {
    broadcastAcknowledged: saved.broadcastAcknowledged === true,
    origin: config.origin,
    chainId: config.chainId,
    networkId: config.networkId,
    normalized,
    intent,
    evidence,
    broadcastAttempted: saved.broadcastAttempted,
  }
  if (saved.confirmation !== undefined) {
    pending.confirmation = parseConfirmation(saved.confirmation)
    assertStorageConfirmation(pending, pending.confirmation)
  }
  return pending
}
