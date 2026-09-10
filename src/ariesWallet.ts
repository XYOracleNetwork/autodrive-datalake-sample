import { spawn } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import Path from 'node:path'
import { stripVTControlCharacters } from 'node:util'

import { asAddress } from '@ariestools/sdk'
import { asSignedHydratedTransaction, createSignedXl1TransactionEvidence } from '@xyo-network/xl1-sdk'

import type { CliWallet, SampleNetwork } from './contracts.js'
import { isRecord, SampleError } from './errors.js'

export interface AriesCommandOptions {
  accountOffset?: string
  environment?: NodeJS.ProcessEnv
  signal?: AbortSignal
  walletId?: string
}

/** Spawn the installed wallet CLI; neither provider credentials nor a shell are involved. */
export async function runAries(args: string[], options: AriesCommandOptions = {}) {
  const environment = { ...options.environment ?? process.env }
  delete environment.AUTODRIVE_API_KEY
  delete environment.AUTODRIVE_BUCKET
  if (!process.stdin.isTTY) environment.ARIES_WALLET_NON_INTERACTIVE = '1'
  return await new Promise<string>((resolve, reject) => {
    const child = spawn('aries', ['wallet', ...args], {
      env: environment,
      stdio: ['inherit', 'pipe', 'pipe'],
      signal: options.signal,
      timeout: 120_000,
    })
    let stdout = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
      if (stdout.length > 131_072) child.kill()
    })
    // Never relay arbitrary wallet output/errors into credential-free sample diagnostics.
    child.stderr.resume()
    child.once('error', () => reject(new SampleError('wallet', 'Could not run aries wallet. Install AriesTools and unlock its wallet.')))
    child.once('close', (code) => {
      if (code !== 0 || stdout.length > 131_072) {
        reject(new SampleError('wallet', 'Aries wallet command failed or was cancelled. Check your wallet password and Aries wallet setup.'))
      } else resolve(stripVTControlCharacters(stdout))
    })
  })
}

export function parseWalletJson(text: string, array = false): unknown {
  const start = text.indexOf(array ? '[' : '{')
  const end = text.lastIndexOf(array ? ']' : '}')
  try {
    if (start === -1 || end < start) throw new Error('Missing JSON')
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new SampleError('wallet', 'Aries wallet returned invalid JSON')
  }
}

export function createAriesWallet(network: SampleNetwork, directory: string, options: AriesCommandOptions = {}): CliWallet {
  const command = (args: string[]) => runAries(args, options)
  const offset = options.accountOffset ?? '0'
  const signedPath = Path.join(directory, 'signed-transaction.json')
  const assertNetwork = async () => {
    if (options.walletId !== undefined) {
      const wallets = parseWalletJson(await command(['list', '--json']), true)
      if (!Array.isArray(wallets) || wallets.filter((value: unknown) => isRecord(value) && value.active === true).length !== 1
        || wallets.every((value: unknown) => !(isRecord(value) && value.active === true && value.id === options.walletId))) {
        throw new SampleError('wallet', 'The selected Aries wallet changed during this run. Run the sample again to choose a wallet.')
      }
    }
    const networks = parseWalletJson(await command(['network', 'list', '--json']), true)
    if (!Array.isArray(networks)) throw new SampleError('wallet', 'Aries wallet returned an invalid network list')
    const active: unknown[] = networks.filter((value: unknown) => isRecord(value) && value.active === true)
    const selected = active[0]
    if (active.length !== 1 || !isRecord(selected) || selected.id !== network.walletNetworkId || selected.rpcUrl !== network.rpcUrl) {
      throw new SampleError('wallet-network', `Aries wallet must use the SDK endpoint for ${network.walletNetworkId}. The network changed or its configured endpoint does not match.`)
    }
  }
  return {
    assertNetwork,
    async address() {
      await assertNetwork()
      const value = parseWalletJson(await command(['account', 'show', offset, '--json']))
      if (!isRecord(value) || typeof value.address !== 'string') throw new SampleError('wallet', 'Aries wallet returned no account address')
      return asAddress(value.address.replace(/^0x/u, '').toLowerCase(), true)
    },
    async sign(request) {
      await assertNetwork()
      const unsignedPath = Path.join(directory, 'unsigned-transaction.json')
      await writeFile(unsignedPath, JSON.stringify(request), { mode: 0o600 })
      await command(['tx', 'sign', unsignedPath, '--offset', offset, '--output', signedPath])
      const text = await readFile(signedPath, 'utf8')
      if (text.length > 65_536) throw new SampleError('wallet', 'Aries wallet returned an oversized transaction')
      const raw: unknown = JSON.parse(text)
      return await createSignedXl1TransactionEvidence(asSignedHydratedTransaction(raw, true))
    },
    async broadcast(evidence) {
      await assertNetwork()
      await writeFile(signedPath, JSON.stringify(evidence.transaction), { mode: 0o600 })
      const output = await command(['tx', 'broadcast', signedPath, '--offset', offset])
      const hash = /Broadcast accepted:\s*([0-9a-f]{64})\b/u.exec(output)?.[1]
      if (hash !== evidence.transactionHash) throw new SampleError('broadcast-unknown', 'Wallet broadcast was not acknowledged with the expected transaction hash')
      return hash
    },
  }
}
