import process, { loadEnvFile } from 'node:process'

import { defineDappKitVitestConfig } from '@xyo-network/dapp-kit-vitest-config'

try {
  loadEnvFile('.env')
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}
if ((process.env.AUTODRIVE_API_KEY?.trim() ?? '').length === 0) throw new Error('Configure AUTODRIVE_API_KEY before running pnpm test:live')

export default defineDappKitVitestConfig({
  installers: {
    localXl1: {
      optInOnly: true,
      include: ['src/spec/local-xl1/live/*.live.spec.ts'],
      env: { SAMPLE_LIVE_TEST: '1' },
      hookTimeout: 120_000,
      testTimeout: 180_000,
      test: { retry: 0, fileParallelism: false },
    },
  },
})
