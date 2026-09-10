import {
  mkdir, mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import Path from 'node:path'

import { MainNetwork, SequenceNetwork } from '@xyo-network/xl1-sdk'
import {
  describe, expect, it,
} from 'vitest'

import {
  configurationFromEnvironment, planeConfigurationFromEnvironment, profileStateDirectories, storageConfigurationFromEnvironment,
} from '../../configuration.js'
import { publicNetworkConfiguration, startupProfileFromArguments } from '../../networks.js'

const profiles = ['local', 'sequence', 'mainnet'] as const
// Keep configuration's existence checks independent of an operator's retained ledger.
const configurationStateRoot = Path.join(tmpdir(), `sample-configuration-${randomUUID()}`)
const planeEnvironment: NodeJS.ProcessEnv = {
  ARIES_DATALAKE_ID: 'offline-configuration-lake',
  ARIES_PLANE_TOKEN: 'offline-test-credential',
  ARIES_PLANE_URL: 'https://aries.example.invalid',
  SAMPLE_STATE_DIR: configurationStateRoot,
}
const writableEnvironment: NodeJS.ProcessEnv = {
  ...planeEnvironment,
  SAMPLE_ACCOUNT_DAILY_BYTES: '4096',
  SAMPLE_ACCOUNT_DAILY_WRITES: '1',
  SAMPLE_ALLOWED_SIGNERS: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  SAMPLE_GLOBAL_DAILY_BYTES: '8192',
  SAMPLE_GLOBAL_DAILY_WRITES: '2',
  SAMPLE_WRITE_ENABLED: 'true',
}

describe('explicit startup network profiles', () => {
  it('selects Sequence when no network argument is supplied', () => {
    expect(startupProfileFromArguments([])).toBe('sequence')
  })

  it.each(profiles)('accepts the explicit %s profile', (profile) => {
    expect(startupProfileFromArguments(['--network', profile])).toBe(profile)
  })

  it.each([
    ['--network', 'unknown'],
    ['--network', 'MAINNET'],
    ['--network'],
    ['--network', 'sequence', 'extra'],
    ['--network', 'local', '--network', 'mainnet'],
    ['--network=mainnet'],
    ['mainnet'],
    ['--rpc-url', 'https://untrusted.example.invalid/rpc'],
  ])('rejects unsupported or trailing arguments: %j', (...args) => {
    expect(() => startupProfileFromArguments(args)).toThrow('Use --network local, sequence, or mainnet')
  })

  it.each([
    { profile: 'sequence' as const, preset: SequenceNetwork },
    { profile: 'mainnet' as const, preset: MainNetwork },
  ])('pins $profile to its SDK endpoint and identity despite stale environment selectors', ({ profile, preset }) => {
    const network = publicNetworkConfiguration(profile)
    const settings = configurationFromEnvironment({
      ...planeEnvironment,
      SAMPLE_CHAIN_ID: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      SAMPLE_NETWORK_ID: 'local',
      SAMPLE_RPC_URL: 'https://untrusted.example.invalid/rpc',
      XL1_CHAIN__ID: 'cccccccccccccccccccccccccccccccccccccccc',
      XL1_CONNECTIONS__DEFAULT_RPC__URL: 'https://another.example.invalid/rpc',
    }, network)

    expect(network).toEqual({
      chainId: preset.chain,
      networkId: preset.id,
      rpcUrl: `${preset.url}/rpc`,
    })
    expect(settings.config.chainId).toBe(preset.chain)
    expect(settings.config.networkId).toBe(preset.id)
    expect(settings.rpcUrl).toBe(`${preset.url}/rpc`)
  })

  it('uses an owned local launcher identity without XL1 environment configuration', () => {
    const local = {
      chainId: 'dddddddddddddddddddddddddddddddddddddddd',
      networkId: 'local' as const,
      rpcUrl: 'http://127.0.0.1:8080/rpc',
    }

    const settings = configurationFromEnvironment(planeEnvironment, local)

    expect(settings.config).toMatchObject({
      chainId: local.chainId, networkId: 'local', writeEnabled: false,
    })
    expect(settings.rpcUrl).toBe(local.rpcUrl)
    expect(settings.storage).toEqual({
      kind: 'aries',
      baseUrl: planeEnvironment.ARIES_PLANE_URL,
      datalakeId: planeEnvironment.ARIES_DATALAKE_ID,
      token: planeEnvironment.ARIES_PLANE_TOKEN,
    })
  })

  it('keeps chain and ledger directories distinct across all profiles, including a configured shared state root', () => {
    const root = Path.join(configurationStateRoot, 'profiles')
    const directories = profiles.map(profile => profileStateDirectories({ SAMPLE_STATE_DIR: root }, profile))

    for (const [index, profile] of profiles.entries()) {
      expect(directories[index]).toEqual({
        chainDirectory: Path.join(root, profile, 'chain'),
        stateDirectory: Path.join(root, profile, 'ledger'),
      })
    }
    const distinctDirectories = new Set(directories.flatMap(value => [value.chainDirectory, value.stateDirectory]))
    expect(distinctDirectories.size).toBe(6)
  })
})

describe('storage and admission configuration remain explicit', () => {
  it('defaults local storage to real Auto Drive with only its provider key', () => {
    const env = {
      AUTODRIVE_API_KEY: 'offline-provider-key',
      ARIES_PLANE_URL: '',
      ARIES_DATALAKE_ID: ' ',
      ARIES_PLANE_TOKEN: '',
    }

    expect(storageConfigurationFromEnvironment(env, 'local')).toEqual({
      kind: 'auto-drive', apiKey: 'offline-provider-key', bucket: 'autodrive-sample', namespace: 'local',
    })
    expect(() => storageConfigurationFromEnvironment({}, 'local')).toThrow('Configure AUTODRIVE_API_KEY in .env')
  })

  it.each(['sequence', 'mainnet'] as const)('requires an explicit Aries endpoint on %s even with a provider key', (profile) => {
    expect(() => storageConfigurationFromEnvironment({ AUTODRIVE_API_KEY: 'offline-provider-key' }, profile))
      .toThrow('Configure ARIES_PLANE_URL in .env')
  })

  it('retains complete local Aries overrides and rejects partially configured connections', () => {
    expect(storageConfigurationFromEnvironment(planeEnvironment, 'local')).toMatchObject({
      kind: 'aries', baseUrl: planeEnvironment.ARIES_PLANE_URL, datalakeId: planeEnvironment.ARIES_DATALAKE_ID,
    })
    const partial = { AUTODRIVE_API_KEY: 'offline-provider-key', ARIES_PLANE_URL: 'https://aries.example.invalid' }
    expect(() => storageConfigurationFromEnvironment(partial, 'local')).toThrow('Configure ARIES_DATALAKE_ID in .env')
    expect(() => storageConfigurationFromEnvironment({ ARIES_PLANE_TOKEN: 'offline-token' }, 'local'))
      .toThrow('Configure ARIES_PLANE_URL in .env')
  })

  it.each(['postgres', 'writer.lock'])('preserves a retained legacy %s marker and refuses to start with a fresh profile ledger', async (marker) => {
    const root = await mkdtemp(Path.join(tmpdir(), 'sample-legacy-layout-'))
    try {
      const markerPath = Path.join(root, marker)
      if (marker === 'postgres') await mkdir(markerPath)
      const retainedFile = marker === 'postgres' ? Path.join(markerPath, 'retained-budget-record') : markerPath
      await writeFile(retainedFile, 'existing ledger evidence')

      expect(() => profileStateDirectories({ SAMPLE_STATE_DIR: root }, 'sequence'))
        .toThrow(expect.objectContaining({ code: 'ledger-layout' }))

      expect(await readFile(retainedFile, 'utf8')).toBe('existing ledger evidence')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('allows retained ledger markers inside their profile directory without blocking other profiles', async () => {
    const root = await mkdtemp(Path.join(tmpdir(), 'sample-profile-layout-'))
    try {
      const retained = Path.join(root, 'sequence', 'ledger')
      await mkdir(Path.join(retained, 'postgres'), { recursive: true })
      await writeFile(Path.join(retained, 'writer.lock'), 'existing owner')

      for (const profile of profiles) {
        expect(profileStateDirectories({ SAMPLE_STATE_DIR: root }, profile).stateDirectory)
          .toBe(Path.join(root, profile, 'ledger'))
      }
      expect(await readFile(Path.join(retained, 'writer.lock'), 'utf8')).toBe('existing owner')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it.each(['ARIES_PLANE_URL', 'ARIES_DATALAKE_ID', 'ARIES_PLANE_TOKEN'])('rejects a missing %s', (key) => {
    const env = { ...planeEnvironment, [key]: undefined }

    expect(() => planeConfigurationFromEnvironment(env)).toThrow(`Configure ${key} in .env`)
    expect(() => configurationFromEnvironment(env, publicNetworkConfiguration('sequence'))).toThrow(`Configure ${key} in .env`)
  })

  it('requires an allowed signer before enabling writes', () => {
    expect(() => configurationFromEnvironment({ ...writableEnvironment, SAMPLE_ALLOWED_SIGNERS: '' }, publicNetworkConfiguration('sequence')))
      .toThrow('Write mode requires SAMPLE_ALLOWED_SIGNERS')
  })

  it.each([
    'SAMPLE_ACCOUNT_DAILY_BYTES',
    'SAMPLE_ACCOUNT_DAILY_WRITES',
    'SAMPLE_GLOBAL_DAILY_BYTES',
    'SAMPLE_GLOBAL_DAILY_WRITES',
  ])('requires a positive explicit budget for %s', (key) => {
    expect(() => configurationFromEnvironment({ ...writableEnvironment, [key]: undefined }, publicNetworkConfiguration('sequence')))
      .toThrow('Write mode requires explicit positive count and byte budgets')
  })

  it('accepts bounded write configuration with no XL1 environment values', () => {
    const settings = configurationFromEnvironment(writableEnvironment, publicNetworkConfiguration('sequence'))

    expect(settings.config.writeEnabled).toBe(true)
    expect(settings.config.allowedSigners).toEqual(['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'])
    expect(settings.config.limits).toEqual({
      accountDailyBytes: 4096,
      accountDailyWrites: 1,
      globalDailyBytes: 8192,
      globalDailyWrites: 2,
    })
  })
})
import { randomUUID } from 'node:crypto'
