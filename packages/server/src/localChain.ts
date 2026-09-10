import type { FileHandle } from 'node:fs/promises'
import {
  mkdir, open, readFile, unlink, writeFile,
} from 'node:fs/promises'
import Path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { GatewayBuilder } from '@xyo-network/xl1-sdk'

import { SampleError } from './errors.js'
import {
  reserveLocalPort, spawnLocalChain, withDeadline,
} from './localChainProcess.js'

export interface LocalChainOptions {
  directory: string
  /** Defaults to the Chrome Wallet local network's port 8080; zero isolates process lifecycle tests. */
  port?: number
  signal?: AbortSignal
}

export interface LocalChain {
  chainId: string
  networkId: 'local'
  rpcUrl: string
  stop(): Promise<void>
}

function localConfig(directory: string, port: number) {
  const providers = [
    'BlockRunner',
    'BlockValidationViewer',
    'BlockViewer',
    'DeadLetterQueueRunner',
    'DeadLetterQueueViewer',
    'EvidenceStoreRunner',
    'EvidenceViewer',
    'FinalizationRunner',
    'FinalizationViewer',
    'MempoolRunner',
    'MempoolViewer',
    'TransactionValidationViewer',
    'WindowedBlockViewer',
    'XyoRunner',
  ]
  return {
    xl1: {
      connections: { 'local-store': { type: 'lmdb', root: Path.join(directory, 'store') } },
      providerBindings: Object.fromEntries(providers.map(provider => [provider, { connection: 'local-store' }])),
      healthCheckPort: 0,
      telemetry: { metrics: { scrape: { port: 0 } } },
      actors: [
        {
          name: 'api', host: '127.0.0.1', port,
        },
        {
          name: 'producer', accountPath: '0', blockProductionCheckInterval: 100, heartbeatInterval: 500, minStake: 1,
        },
        {
          name: 'finalizer', accountPath: '5', finalizationCheckInterval: 50, heartbeatInterval: 500, minCandidates: 1,
        },
      ],
    },
  }
}

async function acquireDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const lockPath = Path.join(directory, '.owner')
  let lock: FileHandle
  try {
    lock = await open(lockPath, 'wx', 0o600)
  } catch {
    throw new SampleError(
      'local-chain-locked',
      `Local XL1 state is already owned or unavailable: ${lockPath}. Stop its owner before restarting; remove a stale .owner only after verifying that process has exited.`,
    )
  }
  try {
    await lock.writeFile(`${process.pid}\n`)
  } catch (error) {
    await lock.close()
    await unlink(lockPath)
    throw error
  }
  return async () => {
    await lock.close()
    await unlink(lockPath)
  }
}

async function retainIdentity(directory: string, chainId: string) {
  const path = Path.join(directory, 'chain-id')
  let previous: string | undefined
  try {
    const value = await readFile(path, 'utf8')
    previous = value.trim()
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
  if (previous !== undefined && previous !== chainId) {
    throw new SampleError('local-chain-identity', 'Local XL1 persisted chain identity changed; restore its chain store or choose a new sample state directory')
  }
  if (previous === undefined) await writeFile(path, `${chainId}\n`, { flag: 'wx', mode: 0o600 })
}

async function probe(rpcUrl: string): Promise<string | undefined> {
  const builder = new GatewayBuilder()
  const session = await builder.name('autodrive-owned-local-xl1').rpcUrl(rpcUrl).buildSession()
  try {
    const viewer = session.gateway.connection.viewer
    if (viewer === undefined) throw new Error('Local XL1 SDK gateway did not expose a viewer')
    const chainId = await viewer.chainId()
    const height = await viewer.finalization.headNumber()
    return Number.isSafeInteger(height) && height >= 1 ? chainId : undefined
  } finally {
    await session.stop()
  }
}

async function waitReady(rpcUrl: string, child: ReturnType<typeof spawnLocalChain>, signal: AbortSignal) {
  while (true) {
    signal.throwIfAborted()
    if (child.hasExited()) throw new SampleError('local-chain-exited', 'Local XL1 process exited before readiness; verify the configured port and writable chain state directory')
    try {
      const chainId = await probe(rpcUrl)
      signal.throwIfAborted()
      if (chainId !== undefined && !child.hasExited()) return chainId
    } catch {
      signal.throwIfAborted()
    }
    await delay(100, undefined, { signal })
  }
}

/** Own a persistent, isolated dev chain; readiness and identity come from the public XL1 SDK. */
export async function startLocalChain(options: LocalChainOptions): Promise<LocalChain> {
  options.signal?.throwIfAborted()
  const directory = Path.resolve(options.directory)
  const release = await acquireDirectory(directory)
  const controller = new AbortController()
  const signal = options.signal === undefined ? controller.signal : AbortSignal.any([controller.signal, options.signal])
  let child: ReturnType<typeof spawnLocalChain> | undefined
  let stopping: Promise<void> | undefined
  const stop = () => {
    stopping ??= (async () => {
      controller.abort()
      await child?.stop()
      options.signal?.removeEventListener('abort', abort)
      await release()
    })()
    return stopping
  }
  const abort = () => {
    // The owner can still observe cleanup errors by awaiting the shared stop promise.
    void stop().catch(() => { /* Avoid an unhandled rejection from the event callback. */ })
  }
  try {
    const port = await reserveLocalPort(options.port ?? 8080)
    const configPath = Path.join(directory, 'xl1.json')
    await writeFile(configPath, `${JSON.stringify(localConfig(directory, port), null, 2)}\n`, { mode: 0o600 })
    signal.throwIfAborted()
    child = spawnLocalChain(directory, configPath)
    options.signal?.addEventListener('abort', abort, { once: true })
    signal.throwIfAborted()
    const rpcUrl = `http://127.0.0.1:${port}/rpc`
    const chainId = await withDeadline(waitReady(rpcUrl, child, signal), 30_000, 'Local XL1 did not become ready within 30 seconds')
    await retainIdentity(directory, chainId)
    signal.throwIfAborted()
    return {
      chainId, networkId: 'local', rpcUrl, stop,
    }
  } catch (error) {
    await stop()
    throw error
  }
}
