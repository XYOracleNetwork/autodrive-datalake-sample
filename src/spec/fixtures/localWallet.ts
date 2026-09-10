import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import OS from 'node:os'
import Path from 'node:path'

import {
  LOCAL_XL1_DEV_ACCOUNT_0_ADDRESS, LOCAL_XL1_DEV_MNEMONIC, localXl1RpcUrl,
} from '@xyo-network/dapp-kit-vitest-config'
import { GatewayBuilder } from '@xyo-network/xl1-sdk'
import { expect } from 'vitest'

import { runAries } from '../../ariesWallet.js'
import type { SampleNetwork } from '../../contracts.js'
import { setupAriesWallet } from '../../walletSetup.js'

export async function localWallet(directory: string) {
  const home = await mkdtemp(Path.join(OS.tmpdir(), 'sample-aries-wallet-'))
  const environment = {
    ...process.env,
    XL1_WALLET_HOME: home,
    ARIES_WALLET_HOME: home,
    ARIES_WALLET_PASSWORD: randomUUID(),
    ARIES_WALLET_NON_INTERACTIVE: '1',
  }
  const builder = new GatewayBuilder()
  const session = await builder.name('sample-cli-test').rpcUrl(localXl1RpcUrl()).buildSession()
  try {
    const viewer = session.gateway.connection.viewer
    if (!viewer) throw new Error('Local chain viewer required')
    const network: SampleNetwork = {
      id: 'local-xl1', walletNetworkId: 'sample-local', chainId: await viewer.chainId(), rpcUrl: localXl1RpcUrl(),
    }
    // This is the public disposable genesis mnemonic, never a user wallet secret.
    await runAries(['import', '--label', 'sample-test', '--phrase', LOCAL_XL1_DEV_MNEMONIC], { environment })
    await runAries(['network', 'add', network.walletNetworkId, network.rpcUrl], { environment })
    const choicesSeen: string[] = []
    const wallet = await setupAriesWallet(network, directory, {
      environment,
      choose: (title, choices, defaultIndex) => {
        choicesSeen.push(title)
        return Promise.resolve(choices[defaultIndex].value)
      },
      progress: () => { /* Suppress test progress. */ },
    })
    expect(choicesSeen).toEqual(['Choose an Aries wallet', 'Choose a signing account'])
    expect(await wallet.address()).toBe(LOCAL_XL1_DEV_ACCOUNT_0_ADDRESS.slice(2))
    return {
      network,
      wallet,
      viewer,
      async close() {
        await session.stop()
        await rm(home, { recursive: true, force: true })
      },
    }
  } catch (error) {
    await session.stop()
    await rm(home, { recursive: true, force: true })
    throw error
  }
}
