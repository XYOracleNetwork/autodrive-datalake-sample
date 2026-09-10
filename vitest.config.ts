import { defineDappKitVitestConfig } from '@xyo-network/dapp-kit-vitest-config'

export default defineDappKitVitestConfig({
  exclude: ['**/live/**', '**/*.live.ts'],
  installers: {
    localXl1: {
      optInOnly: true,
      hookTimeout: 120_000,
      testTimeout: 120_000,
      test: { exclude: ['**/live/**', '**/*.live.ts'], fileParallelism: false },
    },
  },
})
