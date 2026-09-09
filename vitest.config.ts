import { defineXyVitestConfig } from '@ariestools/vitest-config'

export default defineXyVitestConfig({
  exclude: ['**/spec/live/**', '**/*.live.ts'],
  test: {
    // This initial repository contains plans and tooling, without app code.
    // Remove this allowance when the first implemented behavior adds its tests.
    passWithNoTests: true,
  },
})
