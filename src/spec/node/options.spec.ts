import { execFile } from 'node:child_process'
import {
  mkdtemp, rm, writeFile,
} from 'node:fs/promises'
import OS from 'node:os'
import Path from 'node:path'
import { promisify } from 'node:util'

import {
  afterEach, describe, expect, it,
} from 'vitest'

import { parseOptions, readEnvironment } from '../../options.js'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('CLI arguments and environment', () => {
  it('requires exactly one nonempty message', () => {
    for (const args of [[], [''], ['  '], ['unquoted', 'words']]) {
      expect(() => parseOptions(args, { AUTODRIVE_API_KEY: 'synthetic' })).toThrow('one nonempty message')
    }
  })

  it('preserves quoted text and literal shell-looking content', () => {
    const message = 'hello "world"; $(echo unchanged)\n😀'
    expect(parseOptions([message], { AUTODRIVE_API_KEY: 'synthetic' })).toMatchObject({ message, network: { id: 'sequence' } })
  })

  it('uses flag over process environment over .env without mutating the process', async () => {
    const directory = await mkdtemp(Path.join(OS.tmpdir(), 'sample-env-'))
    directories.push(directory)
    await writeFile(Path.join(directory, '.env'), 'AUTODRIVE_API_KEY=file-key\nAUTODRIVE_BUCKET=file-bucket\n')
    const file = await readEnvironment(directory, {})
    expect(parseOptions(['message'], file)).toMatchObject({ apiKey: 'file-key', bucket: 'file-bucket' })
    const env = await readEnvironment(directory, { AUTODRIVE_API_KEY: 'process-key' })
    expect(parseOptions(['message'], env)).toMatchObject({ apiKey: 'process-key' })
    expect(parseOptions(['message', '--autoDriveKey', 'flag-key'], env)).toMatchObject({ apiKey: 'flag-key' })
    expect(file.AUTODRIVE_API_KEY).toBe('file-key')
  })

  it('rejects absent or empty keys, unknown flags, and unsupported networks without reflecting values', () => {
    expect(() => parseOptions(['message'], {})).toThrow('AUTODRIVE_API_KEY')
    expect(() => parseOptions(['message', '--autoDriveKey', ''], { AUTODRIVE_API_KEY: 'fallback' })).toThrow('AUTODRIVE_API_KEY')
    expect(() => parseOptions(['message', '--private=secret'], {})).toThrow('Invalid arguments')
    expect(() => parseOptions(['message', '--network', 'local'], { AUTODRIVE_API_KEY: 'synthetic' })).toThrow('Network must be')
    expect(parseOptions(['message', '--network', 'mainnet'], { AUTODRIVE_API_KEY: 'synthetic' })).toMatchObject({ network: { walletNetworkId: 'xl1-mainnet' } })
  })

  it('compiled executable prints help without credentials and rejects an unquoted message', async () => {
    const execute = promisify(execFile)
    const directory = await mkdtemp(Path.join(OS.tmpdir(), 'sample-cli-'))
    directories.push(directory)
    const bin = Path.resolve('dist/node/cli.mjs')
    const result = await execute(process.execPath, [bin, '--help'], { cwd: directory })
    expect(result.stdout).toContain('Usage: sample-cli')
    await expect(execute(process.execPath, [bin, 'hello', 'world'], { cwd: directory })).rejects.toThrow('Provide exactly one nonempty message in quotes')
  })
})
