import Path from 'node:path'
import { loadEnvFile } from 'node:process'

import { AbstractModule } from '@xyo-network/sdk'
import type { GatewaySession } from '@xyo-network/xl1-sdk'
import { GatewayBuilder } from '@xyo-network/xl1-sdk'

import { startSampleApplication } from './application.js'
import { createAriesStorage } from './aries.js'
import { createAutoDriveStorage } from './autoDrive.js'
import {
  configurationFromEnvironment, profileStateDirectories, storageConfigurationFromEnvironment,
} from './configuration.js'
import { requireCondition, SampleError } from './errors.js'
import { startLocalChain } from './localChain.js'
import { publicNetworkConfiguration, startupProfileFromArguments } from './networks.js'

function loadEnvironment() {
  try {
    loadEnvFile(Path.resolve('.env'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

async function createStorage(settings: ReturnType<typeof storageConfigurationFromEnvironment>, signal: AbortSignal) {
  if (settings.kind === 'auto-drive') {
    const storage = await createAutoDriveStorage({ ...settings, signal })
    return { storage, close: () => storage.close() }
  }
  return { storage: createAriesStorage({ ...settings, signal }), close: undefined }
}

async function main() {
  loadEnvironment()
  // The app explicitly starts owned SDK modules; suppress the SDK's delayed automatic start timer.
  AbstractModule.enableLazyLoad = true
  const profile = startupProfileFromArguments(process.argv.slice(2))
  const storageSettings = storageConfigurationFromEnvironment(process.env, profile)
  const directories = profileStateDirectories(process.env, profile)
  const controller = new AbortController()
  let app: Awaited<ReturnType<typeof startSampleApplication>> | undefined
  let session: GatewaySession | undefined
  let localChain: Awaited<ReturnType<typeof startLocalChain>> | undefined
  let storageOwner: Awaited<ReturnType<typeof createStorage>> | undefined
  let shutdown: Promise<void> | undefined
  const close = () => {
    shutdown ??= (async () => {
      try {
        await app?.close()
      } finally {
        try {
          await session?.stop()
        } finally {
          try {
            await localChain?.stop()
          } finally {
            await storageOwner?.close?.()
          }
        }
      }
    })()
    return shutdown
  }
  const stop = () => {
    controller.abort()
    // During startup, let construction finish or fail before releasing its resources.
    if (app !== undefined) {
      void close().catch(() => {
        process.exitCode = 1
      })
    }
  }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  try {
    storageOwner = await createStorage(storageSettings, controller.signal)
    if (profile === 'local') {
      localChain = await startLocalChain({ directory: directories.chainDirectory, signal: controller.signal })
    }
    const network = localChain ?? publicNetworkConfiguration(profile === 'mainnet' ? 'mainnet' : 'sequence')
    const settings = configurationFromEnvironment(process.env, network)
    const builder = new GatewayBuilder()
    session = await builder.name('autodrive-sample').rpcUrl(settings.rpcUrl).buildSession()
    const chain = session.gateway.connection.viewer
    requireCondition(chain, 'configuration', 'The configured RPC did not expose an XL1 viewer')
    app = await startSampleApplication({
      chain,
      config: settings.config,
      stateDirectory: settings.stateDirectory,
      storage: storageOwner.storage,
      webRoot: Path.resolve('packages/web/dist'),
    })
    if (controller.signal.aborted) {
      await close()
      return
    }
    console.log(`Auto Drive sample ready at ${app.origin}; writes ${app.config.writeEnabled ? 'enabled' : 'disabled'}; network ${profile}; storage ${storageSettings.kind}`)
  } catch (error) {
    await close()
    if (!controller.signal.aborted) throw error
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof SampleError ? error.message : 'Sample startup failed. Check the configured chain, Aries endpoint, credentials, and retained state.')
  process.exitCode = 1
})
