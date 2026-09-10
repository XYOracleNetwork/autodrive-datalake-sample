import {
  access, mkdtemp, readFile, rm,
} from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import Path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { GatewayBuilder } from '@xyo-network/xl1-sdk'
import {
  describe, expect, it,
} from 'vitest'

import { startLocalChain } from '../../localChain.js'
import { reserveLocalPort } from '../../localChainProcess.js'

async function finalizedHead(rpcUrl: string) {
  const builder = new GatewayBuilder()
  const session = await builder.rpcUrl(rpcUrl).buildSession()
  try {
    const viewer = session.gateway.connection.viewer
    if (viewer === undefined) throw new Error('A real local gateway viewer is required')
    return { chainId: await viewer.chainId(), height: await viewer.finalization.headNumber() }
  } finally {
    await session.stop()
  }
}

describe('owned local XL1 process lifecycle', () => {
  it('preserves its chain and finalized history across restart, refuses another owner, and releases the port', async () => {
    const directory = await mkdtemp(Path.join(tmpdir(), 'autodrive-owned-chain-'))
    let running: Awaited<ReturnType<typeof startLocalChain>> | undefined
    try {
      running = await startLocalChain({ directory, port: 0 })
      const first = await finalizedHead(running.rpcUrl)
      expect(first.chainId).toBe(running.chainId)
      expect(first.height).toBeGreaterThan(0)
      expect(running.networkId).toBe('local')
      await expect(startLocalChain({ directory, port: 0 })).rejects.toThrow('already owned')
      const url = new URL(running.rpcUrl)
      const port = Number(url.port)
      await Promise.all([running.stop(), running.stop()])
      expect(await reserveLocalPort(port)).toBe(port)
      running = await startLocalChain({ directory, port })
      const restarted = await finalizedHead(running.rpcUrl)
      expect(restarted.chainId).toBe(first.chainId)
      expect(restarted.height).toBeGreaterThanOrEqual(first.height)
    } finally {
      await running?.stop()
      await rm(directory, { recursive: true, force: true })
    }
  }, 90_000)

  it('aborts partial startup, removes its ownership lock, and leaves no listening process', async () => {
    const directory = await mkdtemp(Path.join(tmpdir(), 'autodrive-aborted-chain-'))
    const controller = new AbortController()
    const port = await reserveLocalPort(0)
    const starting = startLocalChain({
      directory, port, signal: controller.signal,
    })
    const rejected = expect(starting).rejects.toThrow()
    try {
      const configPath = Path.join(directory, 'xl1.json')
      await expect.poll(async () => await readFile(configPath, 'utf8'), { timeout: 5000 }).toContain('local-store')
      await delay(100)
      controller.abort()
      await rejected
      expect(await reserveLocalPort(port)).toBe(port)
      await expect(access(Path.join(directory, '.owner'))).rejects.toThrow()
    } finally {
      controller.abort()
      try {
        const value = await starting
        await value.stop()
      } catch {
        // Startup is expected to reject on abort, after its owned process is stopped.
      }
      await rm(directory, { recursive: true, force: true })
    }
  }, 15_000)

  it('refuses a foreign listener without stopping it or adopting its endpoint', async () => {
    const directory = await mkdtemp(Path.join(tmpdir(), 'autodrive-port-collision-'))
    const foreign = createServer()
    await new Promise<void>(resolve => foreign.listen(0, '127.0.0.1', resolve))
    try {
      const address = foreign.address()
      if (address === null || typeof address === 'string') throw new Error('Fixture must listen on TCP')
      await expect(startLocalChain({ directory, port: address.port })).rejects.toThrow('unavailable')
      expect(foreign.listening).toBe(true)
      await expect(access(Path.join(directory, '.owner'))).rejects.toThrow()
    } finally {
      await new Promise<void>((resolve, reject) => foreign.close(error => error ? reject(error) : resolve()))
      await rm(directory, { recursive: true, force: true })
    }
  })
})
