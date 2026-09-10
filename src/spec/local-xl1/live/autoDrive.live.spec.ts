import { mkdir, mkdtemp } from 'node:fs/promises'
import Path from 'node:path'

import { AbstractModule } from '@xyo-network/sdk'
import {
  expect, it, vi,
} from 'vitest'

import { createAutoDriveStorage } from '../../../autoDrive.js'
import { storeAndAnchor } from '../../../workflow.js'
import { localWallet } from '../../fixtures/localWallet.js'

it('stores one real Auto Drive message and finalizes using the isolated Aries wallet on local XL1', async () => {
  expect(process.env.SAMPLE_LIVE_TEST).toBe('1')
  AbstractModule.enableLazyLoad = true
  const root = Path.resolve('.sample/live')
  await mkdir(root, { recursive: true })
  const directory = await mkdtemp(Path.join(root, 'cli-'))
  console.log(`Live CLI evidence: ${directory}`)
  const fixture = await localWallet(directory)
  let storage: Awaited<ReturnType<typeof createAutoDriveStorage>> | undefined
  try {
    storage = await createAutoDriveStorage({
      apiKey: process.env.AUTODRIVE_API_KEY ?? '', bucket: process.env.AUTODRIVE_BUCKET ?? 'autodrive-sample', namespace: 'live-test',
    })
    const insert = vi.spyOn(storage, 'insert')
    const broadcast = vi.spyOn(fixture.wallet, 'broadcast')
    const result = await storeAndAnchor('Auto Drive CLI and Aries wallet verification', {
      ...fixture, storage, directory, pollIntervalMs: 250,
    })
    expect(result.payload.byteLength).toBeLessThan(512)
    expect(result.status).toBe('finalized')
    expect(result.inclusion.transactionHash).toBe(result.transactionHash)
    expect(insert).toHaveBeenCalledOnce()
    expect(broadcast).toHaveBeenCalledOnce()
    expect(await storage.get(result.transactionHash)).toBeUndefined()
    expect(result.archivalConfirmed).toBe(false)
  } finally {
    await storage?.close()
    await fixture.close()
  }
}, 180_000)
