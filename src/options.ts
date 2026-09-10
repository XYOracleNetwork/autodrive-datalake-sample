import { readFile } from 'node:fs/promises'
import Path from 'node:path'
import { parseArgs, parseEnv } from 'node:util'

import { MainNetwork, SequenceNetwork } from '@xyo-network/xl1-sdk'

import type { SampleNetwork } from './contracts.js'
import { SampleError } from './errors.js'

export const USAGE = `Usage: sample-cli "<message>" [--autoDriveKey <key>] [--network sequence|mainnet]

The message is required; quote it to pass it as one argument.
--autoDriveKey overrides AUTODRIVE_API_KEY from the environment or .env.
--network defaults to sequence; the sample selects that network in Aries.
Run in a terminal: Aries prompts for your password, then choose a wallet and account.
Create/import a wallet in Aries first and fund the account on your chosen network.
No seed phrase is read by this sample. Selected wallet/network remain active in Aries.
Each invocation generates a new salt and stores a new payload (maximum 4096 bytes).
`

export async function readEnvironment(cwd: string, environment: NodeJS.ProcessEnv) {
  let file: NodeJS.ProcessEnv = {}
  try {
    file = parseEnv(await readFile(Path.join(cwd, '.env'), 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new SampleError('configuration', 'Could not read .env')
  }
  return { ...file, ...Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== undefined)) }
}

function argumentsFrom(args: string[]) {
  try {
    return parseArgs({
      args,
      allowPositionals: true,
      strict: true,
      options: {
        autoDriveKey: { type: 'string' }, help: { type: 'boolean', short: 'h' }, network: { type: 'string' },
      },
    })
  } catch {
    throw new SampleError('arguments', 'Invalid arguments. Use sample-cli --help')
  }
}

export function parseOptions(args: string[], environment: NodeJS.ProcessEnv) {
  const parsed = argumentsFrom(args)
  if (parsed.values.help === true) return { help: true as const }
  if (parsed.positionals.length !== 1 || parsed.positionals[0].trim().length === 0) {
    throw new SampleError('arguments', 'Provide exactly one nonempty message in quotes. Use sample-cli --help')
  }
  const apiKey = parsed.values.autoDriveKey ?? environment.AUTODRIVE_API_KEY
  if (apiKey === undefined || apiKey.length === 0 || /\s/u.test(apiKey)) throw new SampleError('configuration', 'Provide --autoDriveKey or set AUTODRIVE_API_KEY in .env')
  const id = parsed.values.network ?? 'sequence'
  if (id !== 'sequence' && id !== 'mainnet') throw new SampleError('arguments', 'Network must be sequence or mainnet')
  const preset = id === 'sequence' ? SequenceNetwork : MainNetwork
  if (!preset.chain) throw new SampleError('configuration', 'SDK network has no expected chain identity')
  const network: SampleNetwork = {
    chainId: preset.chain, id, rpcUrl: `${preset.url}/rpc`, walletNetworkId: `xl1-${id}`,
  }
  return {
    help: false as const, apiKey, bucket: environment.AUTODRIVE_BUCKET ?? 'autodrive-sample', message: parsed.positionals[0], network,
  }
}
