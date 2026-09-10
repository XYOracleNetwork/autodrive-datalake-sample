import { spawn } from 'node:child_process'
import {
  mkdtemp, readdir, readFile, rm,
} from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import { tmpdir } from 'node:os'
import Path from 'node:path'

import { assertEx } from '@ariestools/sdk'
import { createSampleApi } from '@xyo-network/autodrive-sample-client'
import { normalizeSampleData } from '@xyo-network/autodrive-sample-protocol'
import { GatewayBuilder } from '@xyo-network/xl1-sdk'
import { expect } from 'vitest'

const FIXTURE_TOKEN = 'compiled-cli-local-fixture'
const FIXTURE_LAKE = 'compiled_cli_sample'

async function deadline<T>(promise: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function startPlaneFixture() {
  const sample = await normalizeSampleData('{"message":"read-only CLI fixture"}')
  const calls: string[] = []
  const server = createServer((request, response) => {
    calls.push(`${request.method ?? ''} ${request.url ?? ''}`)
    const authorized = request.headers.authorization === `Bearer ${FIXTURE_TOKEN}` && request.headers.origin === undefined
    const usage = request.url === `/v1/datalakes/${FIXTURE_LAKE}/usage`
    const get = request.url === `/v1/datalakes/${FIXTURE_LAKE}/get/${sample.hash}`
    const accepted = authorized && request.method === 'GET' && (usage || get)
    response.writeHead(accepted ? 200 : 403, { 'Content-Type': 'application/json' })
    response.end(JSON.stringify(usage
      ? { datalakeId: FIXTURE_LAKE, payloadCount: 1 }
      : {
          ...sample.payload, _hash: sample.hash, _dataHash: sample.hash,
        }))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('The local Aries fixture must bind a TCP port')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    calls,
    sample,
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    },
  }
}

async function launchCli(env: NodeJS.ProcessEnv, preloadPath?: string) {
  const preload = preloadPath === undefined ? [] : ['--import', preloadPath]
  const child = spawn(process.execPath, [...preload, Path.resolve('packages/server/dist/node/cli.mjs'), '--network', 'local'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  const storageCommands: unknown[] = []
  child.on('message', (message: unknown) => {
    storageCommands.push(message)
  })
  const stdout = assertEx(child.stdout, () => 'The compiled CLI must expose piped stdout')
  const stderr = assertEx(child.stderr, () => 'The compiled CLI must expose piped stderr')
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
  let output = ''
  const ready = new Promise<string>((resolve) => {
    stdout.on('data', (chunk: Buffer) => {
      output = `${output}${chunk.toString('utf8')}`.slice(-4096)
      const match = /Auto Drive sample ready at (http:\/\/127\.0\.0\.1:\d+);/u.exec(output)
      if (match?.[1] !== undefined) resolve(match[1])
    })
  })
  // Consume bounded diagnostics without forwarding credentials or arbitrary child output.
  stderr.on('data', () => { /* The child reports redacted startup failures; readiness/exit is the test contract. */ })
  const terminate = async () => {
    // The audit channel belongs to this fixture, not to the real terminal-launched CLI.
    if (child.connected) child.disconnect()
    child.kill('SIGTERM')
    try {
      return await deadline(exited, 20_000, 'Compiled CLI did not exit after SIGTERM')
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL')
        await exited
      }
    }
  }
  const stop = async () => {
    expect(await terminate()).toEqual({ code: 0, signal: null })
  }
  const rejectEarlyExit = async () => {
    const result = await exited
    throw new Error(`Compiled CLI exited before readiness (code ${result.code}, signal ${result.signal})`)
  }
  try {
    const origin = await deadline(Promise.race([ready, rejectEarlyExit()]), 60_000, 'Compiled CLI did not become ready')
    return {
      origin, stop, storageCommands,
    }
  } catch (error) {
    await terminate()
    throw error
  }
}

async function inspectServing(origin: string, sample: Awaited<ReturnType<typeof normalizeSampleData>>, writeEnabled: boolean) {
  const api = createSampleApi(origin)
  const config = await api.configuration()
  expect(config).toMatchObject({
    networkId: 'local', origin, writeEnabled, status: 'ready',
  })
  await inspectAssets(origin)
  expect(await api.payload(sample.hash)).toEqual(sample)
  return config
}

async function inspectAssets(origin: string) {
  const page = await fetch(origin)
  expect(page.status).toBe(200)
  const html = await page.text()
  expect(html).toContain('<div id="root"></div>')
  expect(html).toBe(await readFile(Path.resolve('packages/web/dist/index.html'), 'utf8'))
  const files = await readdir(Path.resolve('packages/web/dist/assets'))
  const scripts = files.filter(file => /\.(?:js|mjs|css)$/u.test(file))
  expect(scripts.length).toBeGreaterThan(0)
  for (const file of scripts) {
    const asset = await fetch(`${origin}/assets/${file}`)
    expect(asset.status, `Compiled asset ${file}`).toBe(200)
    expect(asset.headers.get('Content-Type')).toContain(file.endsWith('.css') ? 'text/css' : 'javascript')
    const source = await asset.text()
    expect(source.length).toBeGreaterThan(0)
    expect(source).toBe(await readFile(Path.resolve('packages/web/dist/assets', file), 'utf8'))
  }
}

async function assertWritesDisabled(origin: string, sample: Awaited<ReturnType<typeof normalizeSampleData>>) {
  const deniedWrite = await fetch(`${origin}/api/store-intents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': origin },
    body: JSON.stringify({ payload: sample.payload }),
  })
  expect(deniedWrite.status).toBe(403)
}

async function assertLocalPortReleased() {
  const server = createTcpServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', () => reject(new Error('The CLI local-chain port 127.0.0.1:8080 must be free before startup and after shutdown')))
    server.listen(8080, '127.0.0.1', resolve)
  })
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
}

async function inspectLocalChain(chainId: string) {
  const builder = new GatewayBuilder()
  const session = await builder.rpcUrl('http://127.0.0.1:8080/rpc').buildSession()
  try {
    const viewer = assertEx(session.gateway.connection.viewer, () => 'The CLI-owned local chain must expose a viewer')
    expect(await viewer.chainId()).toBe(chainId)
  } finally {
    await session.stop()
  }
}

function apiWithBrowserOrigin(origin: string) {
  return createSampleApi(origin, async (input, options) => {
    const headers = new Headers(options?.headers)
    headers.set('Origin', origin)
    return await fetch(input, { ...options, headers })
  })
}

/** Launch the compiled local profile without chain environment configuration or provider writes. */
export async function exerciseCompiledCli() {
  await assertLocalPortReleased()
  const stateDirectory = await mkdtemp(Path.join(tmpdir(), 'autodrive-sample-cli-'))
  const plane = await startPlaneFixture()
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SAMPLE_ORIGIN: 'http://127.0.0.1:0',
    SAMPLE_AUDIENCE: 'compiled-cli-sample',
    SAMPLE_WRITE_ENABLED: 'true',
    SAMPLE_ALLOWED_SIGNERS: '1'.repeat(40),
    SAMPLE_ACCOUNT_DAILY_BYTES: '4096',
    SAMPLE_ACCOUNT_DAILY_WRITES: '1',
    SAMPLE_GLOBAL_DAILY_BYTES: '4096',
    SAMPLE_GLOBAL_DAILY_WRITES: '1',
    SAMPLE_TRANSACTION_VALIDITY_BLOCKS: '500',
    SAMPLE_STATE_DIR: stateDirectory,
    ARIES_PLANE_URL: plane.baseUrl,
    ARIES_DATALAKE_ID: FIXTURE_LAKE,
    ARIES_PLANE_TOKEN: FIXTURE_TOKEN,
  }
  let running: Awaited<ReturnType<typeof launchCli>> | undefined
  try {
    running = await launchCli(env)
    const firstConfig = await inspectServing(running.origin, plane.sample, true)
    await inspectLocalChain(firstConfig.chainId)
    const api = apiWithBrowserOrigin(running.origin)
    const intent = await api.createIntent(plane.sample.payload)
    const prepared = await api.intent(intent.id)
    expect(prepared).toMatchObject({
      state: 'prepared', payloadHash: plane.sample.hash, chainId: firstConfig.chainId,
    })
    env.SAMPLE_ORIGIN = running.origin
    env.SAMPLE_WRITE_ENABLED = 'false'
    await running.stop()
    running = undefined
    await assertLocalPortReleased()
    running = await launchCli(env)
    expect(running.origin).toBe(env.SAMPLE_ORIGIN)
    const secondConfig = await inspectServing(running.origin, plane.sample, false)
    expect(secondConfig.chainId).toBe(firstConfig.chainId)
    await inspectLocalChain(secondConfig.chainId)
    expect(await apiWithBrowserOrigin(running.origin).intent(intent.id)).toEqual(prepared)
    await assertWritesDisabled(running.origin, plane.sample)
    expect(plane.calls.filter(call => call.endsWith('/usage'))).toHaveLength(2)
    expect(plane.calls.every(call => call.startsWith('GET '))).toBe(true)
  } finally {
    try {
      await running?.stop()
      await assertLocalPortReleased()
    } finally {
      await plane.close()
      await rm(stateDirectory, { recursive: true, force: true })
    }
  }
}

/** The official Auto Drive archivist runs unchanged; a child-only SDK boundary blocks provider access. */
export async function exerciseDefaultLocalCli() {
  await assertLocalPortReleased()
  const stateDirectory = await mkdtemp(Path.join(tmpdir(), 'autodrive-default-cli-'))
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    SAMPLE_ORIGIN: 'http://127.0.0.1:0',
    SAMPLE_STATE_DIR: stateDirectory,
    SAMPLE_WRITE_ENABLED: 'false',
    AUTODRIVE_API_KEY: FIXTURE_TOKEN,
    ARIES_PLANE_URL: '',
    ARIES_DATALAKE_ID: '',
    ARIES_PLANE_TOKEN: '',
  }
  let running: Awaited<ReturnType<typeof launchCli>> | undefined
  try {
    running = await launchCli(env, Path.resolve('packages/server/src/spec/local-xl1/autoDrivePreload.ts'))
    const api = createSampleApi(running.origin)
    const config = await api.configuration()
    expect(config).toMatchObject({
      networkId: 'local', writeEnabled: false, status: 'ready',
    })
    await inspectLocalChain(config.chainId)
    await inspectAssets(running.origin)
    const sample = await normalizeSampleData('{"message":"unknown direct Auto Drive object"}')
    const missing = await fetch(`${running.origin}/api/payloads/${sample.hash}`)
    expect(missing.status).toBe(404)
    await assertWritesDisabled(running.origin, sample)
    expect(running.storageCommands).toEqual([
      {
        bucket: 'autodrive-sample', command: 'HeadObjectCommand', key: `local/by-hash/${'0'.repeat(64)}`, type: 'auto-drive-command',
      },
      {
        bucket: 'autodrive-sample', command: 'GetObjectCommand', key: `local/by-hash/${sample.hash}`, type: 'auto-drive-command',
      },
    ])
  } finally {
    try {
      await running?.stop()
      await assertLocalPortReleased()
    } finally {
      await rm(stateDirectory, { recursive: true, force: true })
    }
  }
}
