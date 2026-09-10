import {
  mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises'
import OS from 'node:os'
import Path from 'node:path'

import {
  afterEach, describe, expect, it, vi,
} from 'vitest'

import type { WalletChoice } from '../../walletSetup.js'
import { setupAriesWallet } from '../../walletSetup.js'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})
const network = {
  id: 'sequence', walletNetworkId: 'xl1-sequence', rpcUrl: 'https://sequence.example/rpc', chainId: '0'.repeat(40),
}

async function fixture(accounts = true, wallets = true) {
  const directory = await mkdtemp(Path.join(OS.tmpdir(), 'sample-setup-'))
  directories.push(directory)
  const statePath = Path.join(directory, 'state.json')
  await writeFile(statePath, JSON.stringify({
    active: 'first', network: 'xl1-mainnet', calls: [],
  }))
  await writeFile(Path.join(directory, 'aries'), `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
const path = process.env.TEST_STATE;
const state = JSON.parse(readFileSync(path, 'utf8'));
const args = process.argv.slice(3);
state.calls.push(args);
if (args[0] === 'use') state.active = args[1];
if (args[0] === 'network' && args[1] === 'use') state.network = args[2];
writeFileSync(path, JSON.stringify(state));
if (args[0] === 'list') console.log(JSON.stringify(${wallets} ? ['first','second'].map(id => ({ id, label: id, active: state.active === id })) : []));
if (args[0] === 'account' && args[1] === 'list') console.log(JSON.stringify({ accounts: ${accounts} ? [
 { offset: '0', label: 'Default', address: '0x' + '1'.repeat(40) },
 { offset: '7', label: 'Savings', address: '0x' + '2'.repeat(40) }
] : [] }));
if (args[0] === 'account' && args[1] === 'show') console.log(JSON.stringify({address: '0x' + (args[2] === '7' ? '2' : '1').repeat(40)}));
if (args[0] === 'network' && args[1] === 'list') console.log(JSON.stringify([{id: state.network, active: true, rpcUrl: 'https://sequence.example/rpc'}]));
`, { mode: 0o700 })
  return {
    directory,
    statePath,
    environment: { PATH: `${directory}${Path.delimiter}${process.env.PATH ?? ''}`, TEST_STATE: statePath },
    progress: () => { /* Suppress test progress. */ },
  }
}

describe('guided Aries wallet setup', () => {
  it('unlocks, selects a different wallet and account, and automatically switches the network', async () => {
    const test = await fixture()
    const choose = vi.fn((_title: string, choices: WalletChoice[]) => Promise.resolve(choices[1].value))
    const wallet = await setupAriesWallet(network, test.directory, { ...test, choose })
    expect(choose).toHaveBeenCalledTimes(2)
    expect(await wallet.address()).toBe('2'.repeat(40))
    const state: unknown = JSON.parse(await readFile(test.statePath, 'utf8'))
    expect(state).toMatchObject({ active: 'second', network: 'xl1-sequence' })
    expect(state).toHaveProperty('calls', expect.arrayContaining([
      ['unlock', '--ttl', '900'], ['use', 'second'], ['account', 'show', '7', '--json'], ['network', 'use', 'xl1-sequence'],
    ]))
  })

  it('offers account zero when the wallet has no saved accounts', async () => {
    const test = await fixture(false)
    const choose = vi.fn((_title: string, choices: WalletChoice[]) => Promise.resolve(choices[0].value))
    const wallet = await setupAriesWallet(network, test.directory, { ...test, choose })
    expect(await wallet.address()).toBe('1'.repeat(40))
    expect(choose.mock.calls[1][1]).toEqual([{ value: '0', label: `Default account — offset 0 — 0x${'1'.repeat(40)}` }])
  })

  it('rejects wallet changes after selection', async () => {
    const test = await fixture()
    const wallet = await setupAriesWallet(network, test.directory, { ...test, choose: (_title: string, choices: WalletChoice[]) => Promise.resolve(choices[0].value) })
    await writeFile(test.statePath, JSON.stringify({
      active: 'second', network: 'xl1-sequence', calls: [],
    }))
    await expect(wallet.assertNetwork()).rejects.toThrow('selected Aries wallet changed')
  })

  it('cancels before selecting a network or submitting anything', async () => {
    const test = await fixture()
    await expect(setupAriesWallet(network, test.directory, { ...test, choose: () => Promise.reject(new Error('Cancelled')) })).rejects.toThrow('Cancelled')
    expect(JSON.parse(await readFile(test.statePath, 'utf8'))).toMatchObject({ active: 'first', network: 'xl1-mainnet' })
  })

  it('explains initial wallet setup when there are no wallets', async () => {
    const test = await fixture(true, false)
    const choose = vi.fn()
    await expect(setupAriesWallet(network, test.directory, { ...test, choose })).rejects.toThrow('aries wallet create or aries wallet import')
    expect(choose).not.toHaveBeenCalled()
  })
})
