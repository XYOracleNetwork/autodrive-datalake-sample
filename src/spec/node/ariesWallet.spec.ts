import {
  mkdtemp, rm, writeFile,
} from 'node:fs/promises'
import OS from 'node:os'
import Path from 'node:path'

import {
  afterEach, describe, expect, it,
} from 'vitest'

import { createAriesWallet, runAries } from '../../ariesWallet.js'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

async function executable(script: string) {
  const directory = await mkdtemp(Path.join(OS.tmpdir(), 'sample-command-'))
  directories.push(directory)
  await writeFile(Path.join(directory, 'aries'), `#!/usr/bin/env node\n${script}\n`, { mode: 0o700 })
  return { directory, environment: { PATH: `${directory}${Path.delimiter}${process.env.PATH ?? ''}` } }
}

describe('Aries CLI subprocess boundary', () => {
  it('does not pass Auto Drive credentials through arguments or environment', async () => {
    const fixture = await executable(`console.log(JSON.stringify({
      args: process.argv.slice(2),
      providerKeyPresent: Object.hasOwn(process.env, 'AUTODRIVE_API_KEY'),
      bucketPresent: Object.hasOwn(process.env, 'AUTODRIVE_BUCKET'),
      walletPasswordRetained: process.env.ARIES_WALLET_PASSWORD === 'synthetic-wallet-password'
    }))`)
    const output = await runAries(['account', 'show', '0', '--json'], {
      environment: {
        ...fixture.environment, AUTODRIVE_API_KEY: 'synthetic-provider-key', AUTODRIVE_BUCKET: 'synthetic-bucket', ARIES_WALLET_PASSWORD: 'synthetic-wallet-password',
      },
    })
    expect(JSON.parse(output)).toEqual({
      args: ['wallet', 'account', 'show', '0', '--json'], providerKeyPresent: false, bucketPresent: false, walletPasswordRetained: true,
    })
  })

  it('redacts command errors instead of relaying child output', async () => {
    const fixture = await executable('console.error("synthetic-secret"); process.exit(1)')
    await expect(runAries(['account', 'show', '0'], fixture)).rejects.toThrow('Aries wallet command failed')
  })

  it('rejects a different active wallet network without changing it', async () => {
    const fixture = await executable('console.log(JSON.stringify([{ id: "xl1-mainnet", active: true, rpcUrl: "https://other.example/rpc" }]))')
    const wallet = createAriesWallet({
      id: 'sequence', walletNetworkId: 'xl1-sequence', rpcUrl: 'https://sequence.example/rpc', chainId: '0'.repeat(40),
    }, fixture.directory, fixture)
    await expect(wallet.assertNetwork()).rejects.toThrow('SDK endpoint for xl1-sequence')
  })
})
