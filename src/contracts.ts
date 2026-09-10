import type {
  BlockViewer, SignedXl1TransactionEvidence, XyoViewer,
} from '@xyo-network/xl1-sdk'

import type { SamplePayload } from './payload.js'

export interface SampleStorage {
  readonly identity: string
  checkReady(this: void): Promise<void>
  get(this: void, hash: string): Promise<unknown>
  insert(this: void, payload: SamplePayload): Promise<void>
}

export interface SampleNetwork {
  chainId: string
  id: string
  rpcUrl: string
  walletNetworkId: string
}

export interface SigningRequest {
  chain: string
  exp: number
  nbf: number
  offChainPayloads: SamplePayload[]
  onChainPayloads: []
}

export interface CliWallet {
  address(this: void): Promise<string>
  assertNetwork(this: void): Promise<void>
  broadcast(this: void, evidence: SignedXl1TransactionEvidence): Promise<string>
  sign(this: void, request: SigningRequest): Promise<SignedXl1TransactionEvidence>
}

export interface SampleRunOptions {
  directory: string
  finalityTimeoutMs?: number
  network: SampleNetwork
  pollIntervalMs?: number
  progress?: (message: string) => void
  signal?: AbortSignal
  storage: SampleStorage
  viewer: Pick<XyoViewer, 'chainId' | 'currentBlockNumber'> & {
    block: Pick<BlockViewer, 'blockByHash' | 'blockByTransactionHash'>
  }
  wallet: CliWallet
}
