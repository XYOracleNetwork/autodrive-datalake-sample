import { writeFile } from 'node:fs/promises'
import Path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import type { SignedXl1TransactionEvidence } from '@xyo-network/xl1-sdk'
import {
  asChainId, observeXl1TransactionFinality, observeXl1TransactionInclusion, validateTransaction,
} from '@xyo-network/xl1-sdk'

import type { SampleRunOptions } from './contracts.js'
import { SampleError } from './errors.js'
import type { NormalizedSamplePayload } from './payload.js'
import {
  normalizeRetrievedSamplePayload, normalizeSampleData, SAMPLE_SCHEMA,
} from './payload.js'

async function verifyEvidence(evidence: SignedXl1TransactionEvidence, payload: NormalizedSamplePayload, address: string, options: SampleRunOptions) {
  const [transaction, content] = evidence.transaction
  const errors = await validateTransaction({ chainId: asChainId(options.network.chainId, true), singletons: {} }, evidence.transaction)
  if (errors.length > 0 || evidence.from !== address || evidence.chainId !== options.network.chainId
    || transaction.payload_hashes.length !== 1 || transaction.payload_hashes[0] !== payload.hash
    || transaction.payload_schemas.length !== 1 || transaction.payload_schemas[0] !== SAMPLE_SCHEMA
    || content.length !== 1 || (transaction.script?.length ?? 0) !== 0) {
    throw new SampleError('signature', 'Wallet transaction does not match the approved message, signer, or network')
  }
  const signedPayload = await normalizeRetrievedSamplePayload(content[0])
  if (signedPayload.canonicalJson !== payload.canonicalJson) throw new SampleError('signature', 'Wallet changed the approved payload')
}

async function verifyStorage(payload: NormalizedSamplePayload, options: SampleRunOptions) {
  const found = await options.storage.get(payload.hash)
  if (found === undefined) throw new SampleError('storage', 'Auto Drive payload is missing; storage is not verified')
  const retrieved = await normalizeRetrievedSamplePayload(found)
  if (retrieved.hash !== payload.hash || retrieved.canonicalJson !== payload.canonicalJson) {
    throw new SampleError('storage', 'Auto Drive read-back differs from the approved payload')
  }
}

async function waitForFinality(evidence: SignedXl1TransactionEvidence, options: SampleRunOptions) {
  const deadline = Date.now() + (options.finalityTimeoutMs ?? 90_000)
  do {
    options.signal?.throwIfAborted()
    const inclusion = await observeXl1TransactionInclusion(options.viewer.block, evidence.transactionHash)
    if (inclusion !== null) {
      const finalized = await observeXl1TransactionFinality(options.viewer.block, inclusion)
      if (finalized !== null) return finalized
    }
    if (await options.viewer.currentBlockNumber() >= evidence.exp) break
    await delay(options.pollIntervalMs ?? 1500, undefined, { signal: options.signal })
  } while (Date.now() < deadline)
  throw new SampleError('finality-unknown', 'Storage is verified but chain finality is unconfirmed. Retain the signed transaction; do not rerun the message automatically.')
}

/** Same single-pass workflow in the CLI and Vitest; no web service or storage authentication layer. */
export async function storeAndAnchor(message: string, options: SampleRunOptions) {
  if (message.trim().length === 0) throw new SampleError('message', 'Message must not be empty')
  const payload = await normalizeSampleData(JSON.stringify({ message }))
  const save = (name: string, value: unknown) => writeFile(Path.join(options.directory, name), JSON.stringify(value, null, 2), { mode: 0o600 })
  await save('payload.json', payload)
  await options.wallet.assertNetwork()
  if (await options.viewer.chainId() !== options.network.chainId) throw new SampleError('chain', 'Gateway chain identity differs from the selected network')
  const address = await options.wallet.address()
  await options.storage.checkReady()
  const nbf = await options.viewer.currentBlockNumber()
  options.progress?.('Signing with Aries wallet…')
  const evidence = await options.wallet.sign({
    chain: options.network.chainId, nbf, exp: nbf + 500, onChainPayloads: [], offChainPayloads: [payload.payload],
  })
  await verifyEvidence(evidence, payload, address, options)
  await save('evidence.json', evidence)
  options.progress?.(`Payload: ${payload.hash}\nTransaction: ${evidence.transactionHash}`)
  options.signal?.throwIfAborted()
  if (await options.viewer.currentBlockNumber() >= evidence.exp) throw new SampleError('expired', 'Signed transaction expired before storage')
  await options.wallet.assertNetwork()
  await save('write-dispatch.json', { payloadHash: payload.hash, at: Date.now() })
  await options.storage.insert(payload.payload)
  await verifyStorage(payload, options)
  options.progress?.('Auto Drive read-back verified. Broadcasting with Aries wallet…')
  options.signal?.throwIfAborted()
  if (await options.viewer.currentBlockNumber() >= evidence.exp) throw new SampleError('expired', 'Storage is verified but the signed transaction expired')
  await save('broadcast-dispatch.json', { transactionHash: evidence.transactionHash, at: Date.now() })
  if (await options.wallet.broadcast(evidence) !== evidence.transactionHash) throw new SampleError('broadcast-unknown', 'Broadcast returned a different transaction hash')
  const inclusion = await waitForFinality(evidence, options)
  await verifyStorage(payload, options)
  const result = {
    status: 'finalized', network: options.network.id, chainId: evidence.chainId, payload, transactionHash: evidence.transactionHash, inclusion, archivalConfirmed: false,
  }
  await save('result.json', result)
  return result
}
