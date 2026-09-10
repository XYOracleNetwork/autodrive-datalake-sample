import type { NormalizedSamplePayload } from '@xyo-network/autodrive-sample-protocol'
import type {
  BlockViewer, SignedXl1TransactionEvidence, Xl1TransactionSigner, XyoJwtSignerMethods, XyoRunner, XyoViewer,
} from '@xyo-network/xl1-sdk'

export interface SampleConfiguration {
  audience: string
  chainId: string
  maxPayloadBytes: number
  networkId: string
  origin: string
  schema: string
  status: string
  transactionValidityBlocks?: number
  writeEnabled: boolean
}

export interface StoreIntent {
  chainId: string
  expiresAt: number
  id: string
  nonce: string
  payloadHash: string
}

export interface StorageConfirmation {
  byteLength: number
  chainId: string
  intentId: string
  payloadHash: string
  signer: string
  state: 'storage-verified'
  transactionHash: string
  verifiedAt: number
}

export interface StoreIntentStatus extends StoreIntent {
  byteLength: number
  signer?: string
  state: string
  transactionHash?: string
  verifiedAt?: number
}

export interface SampleApi {
  configuration(this: void): Promise<SampleConfiguration>
  confirm(this: void, intentId: string, token: string, evidence: SignedXl1TransactionEvidence): Promise<StorageConfirmation>
  createIntent(this: void, payload: NormalizedSamplePayload['payload']): Promise<StoreIntent>
  intent(this: void, intentId: string): Promise<StoreIntentStatus>
  payload(this: void, hash: string): Promise<NormalizedSamplePayload>
  reconcile(this: void, intentId: string, token: string, evidence: SignedXl1TransactionEvidence): Promise<StorageConfirmation>
}

export interface SampleWallet {
  runner: Pick<XyoRunner, 'broadcastTransaction'>
  signer: Xl1TransactionSigner & XyoJwtSignerMethods
  viewer: Pick<XyoViewer, 'chainId' | 'currentBlockNumber'> & {
    block: Pick<BlockViewer, 'blockByHash' | 'blockByTransactionHash'>
  }
}

export type FlowStage = 'preparing' | 'signing' | 'authenticating' | 'storing' | 'storage-verified'
  | 'broadcasting' | 'broadcast-unknown' | 'pending' | 'complete' | 'stored-unanchored' | 'failed'

export interface FlowProgress {
  blockNumber?: number
  message: string
  payloadHash?: string
  stage: FlowStage
  transactionHash?: string
}

/** Public signed evidence for recovery; detached authentication JWTs never belong here. */
export interface PendingOperation {
  broadcastAcknowledged?: boolean
  broadcastAttempted: boolean
  chainId: string
  confirmation?: StorageConfirmation
  evidence: SignedXl1TransactionEvidence
  intent: StoreIntent
  networkId: string
  normalized: NormalizedSamplePayload
  origin: string
}

export interface FlowOptions {
  api: SampleApi
  /** Called again before each external effect to reject a replaced wallet connection. */
  assertCurrent?: () => void
  config: SampleConfiguration
  finalityTimeoutMs?: number
  onPending?: (pending: PendingOperation) => void
  onProgress?: (progress: FlowProgress) => void
  pollIntervalMs?: number
  signal?: AbortSignal
  validityBlocks?: number
  wallet: SampleWallet
}

export interface StoreAndAnchorOptions extends FlowOptions {
  payloadText: string
}

export interface ResumeAnchorOptions extends FlowOptions {
  pending: PendingOperation
  /** Explicit user request only: reconcile first, then resend the same signed evidence without another upload. */
  retryBroadcast?: boolean
}
