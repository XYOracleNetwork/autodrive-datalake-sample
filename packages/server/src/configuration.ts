import { existsSync } from 'node:fs'
import Path from 'node:path'

import { createSampleProfile } from '@xyo-network/autodrive-sample-protocol'
import { asChainId, DEFAULT_MAX_EXP_AHEAD } from '@xyo-network/xl1-sdk'

import { requireCondition } from './errors.js'
import type { SampleNetworkConfiguration, StartupProfile } from './networks.js'

export interface SampleLimits {
  accountDailyBytes: number
  accountDailyWrites: number
  globalDailyBytes: number
  globalDailyWrites: number
}

export interface SampleConfiguration {
  allowedSigners: readonly string[]
  audience: string
  chainId: string
  limits: SampleLimits
  networkId: string
  origin: string
  transactionValidityBlocks: number
  writeEnabled: boolean
}

export function validateSampleConfiguration(config: SampleConfiguration) {
  createSampleProfile(config.chainId, config.networkId)
  const origin = new URL(config.origin)
  requireCondition(origin.origin === config.origin && !origin.username && !origin.password, 'configuration', 'SAMPLE_ORIGIN must be an exact origin')
  requireCondition(origin.protocol === 'https:' || (origin.protocol === 'http:' && origin.hostname === '127.0.0.1'), 'configuration', 'Use HTTPS or http://127.0.0.1 for the wallet origin')
  requireCondition(config.audience.length > 0 && config.audience.length <= 256, 'configuration', 'A bounded JWT audience is required')
  requireCondition(
    Number.isSafeInteger(config.transactionValidityBlocks) && config.transactionValidityBlocks > 0 && config.transactionValidityBlocks <= DEFAULT_MAX_EXP_AHEAD,
    'configuration',
    `Transaction validity must be 1–${DEFAULT_MAX_EXP_AHEAD} blocks`,
  )
  for (const signer of config.allowedSigners) requireCondition(/^[0-9a-f]{40}$/u.test(signer), 'configuration', 'Allowed signers must be lowercase 40-character XYO addresses')
  if (config.writeEnabled) {
    requireCondition(config.allowedSigners.length > 0, 'configuration', 'Write mode requires SAMPLE_ALLOWED_SIGNERS')
    for (const limit of Object.values(config.limits)) requireCondition(Number.isSafeInteger(limit) && limit > 0, 'configuration', 'Write mode requires explicit positive count and byte budgets')
  }
  return config
}

function requiredEnvironment(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim()
  requireCondition(value !== undefined && value.length > 0, 'configuration', `Configure ${key} in .env`)
  return value
}

export function planeConfigurationFromEnvironment(env: NodeJS.ProcessEnv) {
  return {
    baseUrl: requiredEnvironment(env, 'ARIES_PLANE_URL'),
    datalakeId: requiredEnvironment(env, 'ARIES_DATALAKE_ID'),
    token: requiredEnvironment(env, 'ARIES_PLANE_TOKEN'),
  }
}

/** Local startup owns its provider client; an explicit Aries connection remains all-or-nothing. */
export function storageConfigurationFromEnvironment(env: NodeJS.ProcessEnv, profile: StartupProfile) {
  const hasPlaneSetting = ['ARIES_PLANE_URL', 'ARIES_DATALAKE_ID', 'ARIES_PLANE_TOKEN']
    .some(key => Boolean(env[key]?.trim()))
  if (profile === 'local' && !hasPlaneSetting) {
    return {
      kind: 'auto-drive' as const,
      apiKey: requiredEnvironment(env, 'AUTODRIVE_API_KEY'),
      bucket: 'autodrive-sample',
      namespace: 'local',
    }
  }
  return { kind: 'aries' as const, ...planeConfigurationFromEnvironment(env) }
}

export function profileStateDirectories(env: NodeJS.ProcessEnv, profile: StartupProfile) {
  const base = Path.resolve(env.SAMPLE_STATE_DIR ?? '.sample/state')
  requireCondition(
    !existsSync(Path.join(base, 'postgres')) && !existsSync(Path.join(base, 'writer.lock')),
    'ledger-layout',
    'An earlier ledger exists directly under SAMPLE_STATE_DIR. Move it into <original-network>/ledger before using startup profiles; preserve its database and budgets.',
  )
  const directory = Path.join(base, profile)
  return { chainDirectory: Path.join(directory, 'chain'), stateDirectory: Path.join(directory, 'ledger') }
}

export function configurationFromEnvironment(env: NodeJS.ProcessEnv, network: SampleNetworkConfiguration) {
  const writeFlag = env.SAMPLE_WRITE_ENABLED ?? 'false'
  requireCondition(writeFlag === 'true' || writeFlag === 'false', 'configuration', 'SAMPLE_WRITE_ENABLED must be true or false')
  const number = (key: string) => Number(env[key] ?? 0)
  const config = validateSampleConfiguration({
    allowedSigners: (env.SAMPLE_ALLOWED_SIGNERS ?? '').split(',').map(value => value.trim().toLowerCase().replace(/^0x/u, '')).filter(Boolean),
    audience: env.SAMPLE_AUDIENCE ?? 'autodrive-sample',
    chainId: asChainId(network.chainId, true),
    limits: {
      accountDailyBytes: number('SAMPLE_ACCOUNT_DAILY_BYTES'),
      accountDailyWrites: number('SAMPLE_ACCOUNT_DAILY_WRITES'),
      globalDailyBytes: number('SAMPLE_GLOBAL_DAILY_BYTES'),
      globalDailyWrites: number('SAMPLE_GLOBAL_DAILY_WRITES'),
    },
    networkId: network.networkId,
    origin: env.SAMPLE_ORIGIN ?? 'http://127.0.0.1:5173',
    transactionValidityBlocks: Number(env.SAMPLE_TRANSACTION_VALIDITY_BLOCKS ?? 120),
    writeEnabled: writeFlag === 'true',
  })
  return {
    config,
    storage: storageConfigurationFromEnvironment(env, network.networkId),
    rpcUrl: network.rpcUrl,
    ...profileStateDirectories(env, network.networkId),
  }
}
