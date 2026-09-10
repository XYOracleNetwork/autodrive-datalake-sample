import { createInterface } from 'node:readline/promises'
import { stripVTControlCharacters } from 'node:util'

import type { AriesCommandOptions } from './ariesWallet.js'
import {
  createAriesWallet, parseWalletJson, runAries,
} from './ariesWallet.js'
import type { SampleNetwork } from './contracts.js'
import { isRecord, SampleError } from './errors.js'

export interface WalletChoice {
  label: string
  value: string
}

export interface WalletSetupOptions extends AriesCommandOptions {
  choose?: (title: string, choices: WalletChoice[], defaultIndex: number) => Promise<string>
  progress?: (message: string) => void
}

function terminalText(value: string) {
  return stripVTControlCharacters(value).replaceAll(/[\p{Cc}\p{Cf}]/gu, '')
}

export async function chooseInTerminal(title: string, choices: WalletChoice[], defaultIndex: number, signal?: AbortSignal) {
  if (!process.stdin.isTTY) throw new SampleError('wallet', 'Wallet selection requires an interactive terminal. Run sample-cli directly in your terminal.')
  const prompt = createInterface({ input: process.stdin, output: process.stderr })
  const cancelled = new AbortController()
  const abort = () => cancelled.abort()
  prompt.once('SIGINT', abort)
  prompt.once('close', abort)
  const questionSignal = signal ? AbortSignal.any([signal, cancelled.signal]) : cancelled.signal
  try {
    console.error(`\n${title}`)
    for (const [index, choice] of choices.entries()) console.error(`  ${index + 1}. ${terminalText(choice.label)}`)
    for (;;) {
      const response = await prompt.question(`Select [${defaultIndex + 1}]: `, { signal: questionSignal })
      const answer = response.trim()
      const index = answer === '' ? defaultIndex : /^\d+$/u.test(answer) ? Number(answer) - 1 : -1
      if (Number.isSafeInteger(index) && index >= 0 && index < choices.length) return choices[index].value
      console.error(`Enter a number from 1 to ${choices.length}.`)
    }
  } catch {
    throw new SampleError('wallet', 'Wallet selection cancelled. No upload or broadcast was started.')
  } finally {
    prompt.close()
  }
}

/** Aries owns password input and session storage; only public wallet metadata enters this process. */
export async function setupAriesWallet(network: SampleNetwork, directory: string, options: WalletSetupOptions = {}) {
  if (!options.choose && !process.stdin.isTTY) throw new SampleError('wallet', 'Wallet selection requires an interactive terminal. Run sample-cli directly in your terminal.')
  const command = (args: string[]) => runAries(args, options)
  const choose = options.choose ?? ((title, choices, defaultIndex) => chooseInTerminal(title, choices, defaultIndex, options.signal))
  const progress = options.progress ?? ((message: string) => console.error(message))
  const rawWallets = parseWalletJson(await command(['list', '--json']), true)
  if (!Array.isArray(rawWallets)) throw new SampleError('wallet', 'Aries wallet returned an invalid wallet list')
  const wallets = rawWallets.map((value: unknown) => {
    if (!isRecord(value) || typeof value.id !== 'string' || typeof value.label !== 'string') throw new SampleError('wallet', 'Aries wallet returned an invalid wallet')
    return {
      value: value.id, label: `${value.label} (${value.id})${value.active === true ? ' — active' : ''}`, active: value.active === true,
    }
  })
  if (wallets.length === 0) throw new SampleError('wallet', 'No Aries wallets found. Run aries wallet create or aries wallet import, then run this sample again.')
  progress('Unlock your Aries wallet (Aries handles the password; the session lasts 15 minutes).')
  await command(['unlock', '--ttl', '900'])
  const walletId = await choose('Choose an Aries wallet', wallets, Math.max(0, wallets.findIndex(wallet => wallet.active)))
  if (wallets.every(wallet => wallet.value !== walletId)) throw new SampleError('wallet', 'Invalid wallet selection')
  await command(['use', walletId])
  const rawAccounts = parseWalletJson(await command(['account', 'list', '--json']))
  if (!isRecord(rawAccounts) || !Array.isArray(rawAccounts.accounts)) throw new SampleError('wallet', 'Aries wallet returned an invalid account list')
  const accounts = rawAccounts.accounts.map((value: unknown) => {
    if (!isRecord(value) || typeof value.offset !== 'string' || !/^\d+$/u.test(value.offset) || typeof value.address !== 'string') {
      throw new SampleError('wallet', 'Aries wallet returned an invalid account')
    }
    return { value: value.offset, label: `${typeof value.label === 'string' ? value.label : 'Account'} — offset ${value.offset} — ${value.address}` }
  })
  if (accounts.length === 0) {
    const account = parseWalletJson(await command(['account', 'show', '0', '--json']))
    if (!isRecord(account) || typeof account.address !== 'string') throw new SampleError('wallet', 'Aries wallet returned no default account')
    accounts.push({ value: '0', label: `Default account — offset 0 — ${account.address}` })
  }
  const accountOffset = await choose('Choose a signing account', accounts, 0)
  if (accounts.every(account => account.value !== accountOffset)) throw new SampleError('wallet', 'Invalid account selection')
  await command(['network', 'use', network.walletNetworkId])
  const wallet = createAriesWallet(network, directory, {
    ...options, walletId, accountOffset,
  })
  await wallet.assertNetwork()
  progress(`Using ${network.walletNetworkId}, account offset ${accountOffset}. Selected wallet and network remain active in Aries.`)
  return wallet
}
