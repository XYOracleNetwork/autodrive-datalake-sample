import { fileURLToPath } from 'node:url'

import { recommendedConfig } from '@ariestools/eslint-config-react-flat'
import type { Linter } from 'eslint'
import { includeIgnoreFile } from 'eslint/config'

const xylabsConfig = recommendedConfig({ tier: 3, isTypeChecked: true })

const config: Linter.Config[] = [
  globalThis.process.env.XY_LINT_GITIGNORE === 'false'
    ? { ignores: [] }
    : includeIgnoreFile(fileURLToPath(new URL('.gitignore', import.meta.url)), {
        gitignoreResolution: true,
        name: 'XY repository .gitignore',
      }),
  { ignores: ['.yarn/**', 'build', '**/build/**', '**/dist/**', 'dist', 'node_modules/**', '**/node_modules/**', '**/*.md', '.claude/worktrees/*'] },
  ...xylabsConfig,
]

export default config
