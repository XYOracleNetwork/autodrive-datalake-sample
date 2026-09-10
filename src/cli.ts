#!/usr/bin/env node
import { mkdir, mkdtemp } from 'node:fs/promises'
import Path from 'node:path'

import { AbstractModule } from '@xyo-network/sdk'
import type { GatewaySession } from '@xyo-network/xl1-sdk'
import { GatewayBuilder } from '@xyo-network/xl1-sdk'

import type { OwnedAutoDriveStorage } from './autoDrive.js'
import { createAutoDriveStorage } from './autoDrive.js'
import { SampleError } from './errors.js'
import {
  parseOptions, readEnvironment, USAGE,
} from './options.js'
import { setupAriesWallet } from './walletSetup.js'
import { storeAndAnchor } from './workflow.js'

async function main() {
  const args = process.argv.slice(2)
  const environment = args.includes('--help') || args.includes('-h') ? {} : await readEnvironment(process.cwd(), process.env)
  const options = parseOptions(args, environment)
  if (options.help) return console.log(USAGE)
  AbstractModule.enableLazyLoad = true
  const root = Path.resolve('.sample/runs')
  await mkdir(root, { recursive: true, mode: 0o700 })
  const directory = await mkdtemp(Path.join(root, 'run-'))
  console.error(`Evidence: ${directory}`)
  const controller = new AbortController()
  const abort = () => controller.abort()
  process.once('SIGINT', abort)
  process.once('SIGTERM', abort)
  let session: GatewaySession | undefined
  let storage: OwnedAutoDriveStorage | undefined
  let result: Awaited<ReturnType<typeof storeAndAnchor>>
  try {
    const wallet = await setupAriesWallet(options.network, directory, { signal: controller.signal })
    const builder = new GatewayBuilder()
    session = await builder.name('autodrive-cli-sample').rpcUrl(options.network.rpcUrl).buildSession()
    const viewer = session.gateway.connection.viewer
    if (!viewer) throw new SampleError('gateway', 'Gateway has no XL1 viewer')
    storage = await createAutoDriveStorage({
      apiKey: options.apiKey, bucket: options.bucket, namespace: options.network.id, signal: controller.signal,
    })
    result = await storeAndAnchor(options.message, {
      network: options.network,
      directory,
      wallet,
      viewer,
      storage,
      signal: controller.signal,
      progress: message => console.error(message),
    })
  } finally {
    await Promise.allSettled([storage?.close(), session?.stop()])
    process.removeListener('SIGINT', abort)
    process.removeListener('SIGTERM', abort)
  }
  console.log(JSON.stringify(result, null, 2))
  console.log(`https://explore.xyo.network/xl1/${options.network.id}/transaction/${result.transactionHash}`)
}

void main().catch((error: unknown) => {
  console.error(error instanceof SampleError
    ? error.message
    : 'Sample failed. Inspect the retained evidence before retrying; no automatic retry was performed.')
  process.exitCode = 1
})
