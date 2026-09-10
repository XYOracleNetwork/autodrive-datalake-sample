import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import Path from 'node:path'
import { fileURLToPath } from 'node:url'

import { SampleError } from './errors.js'

export async function withDeadline<T>(operation: Promise<T>, milliseconds: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new SampleError('local-chain-timeout', message)), milliseconds) }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** Check ownership before spawning: an existing service on the requested port must never be adopted. */
export async function reserveLocalPort(port: number): Promise<number> {
  if (!Number.isSafeInteger(port) || port < 0 || port > 65_535) throw new SampleError('local-chain-port', 'Local XL1 port must be an integer from 0 to 65535')
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', () => reject(new SampleError('local-chain-port', `Local XL1 port ${port} is unavailable; stop the existing listener before running pnpm start:local`)))
    server.listen(port, '127.0.0.1', resolve)
  })
  const address = server.address()
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  if (address === null || typeof address === 'string') throw new Error('Local XL1 must bind a loopback TCP port')
  return address.port
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null
}

export function spawnLocalChain(directory: string, configPath: string) {
  const packagePath = fileURLToPath(import.meta.resolve('@xyo-network/xl1-cli/package.json'))
  const child = spawn(process.execPath, [
    Path.join(Path.dirname(packagePath), 'scripts/xl1.mjs'), 'start', '--skip-insecure-confirm', '-c', configPath,
  ], {
    cwd: directory,
    // Do not inherit app credentials or XL1_* settings which could override the isolated dev config.
    env: {
      PATH: process.env.PATH, FORCE_COLOR: '0', OTEL_SDK_DISABLED: 'true',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  })
  const terminal = new Promise<void>((resolve) => {
    child.once('error', () => resolve())
    child.once('exit', () => resolve())
  })
  let stopping: Promise<void> | undefined
  const stop = () => {
    stopping ??= (async () => {
      if (hasExited(child) || child.pid === undefined) return
      child.kill('SIGTERM')
      try {
        await withDeadline(terminal, 5000, 'Local XL1 did not stop after SIGTERM')
      } catch {
        child.kill('SIGKILL')
        await withDeadline(terminal, 5000, 'Local XL1 did not stop after SIGKILL')
      }
    })()
    return stopping
  }
  return {
    hasExited: () => hasExited(child) || child.pid === undefined,
    stop,
    terminal,
  }
}
