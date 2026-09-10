import { recommendedConfig } from '@ariestools/eslint-config-react-flat'
import type { Linter } from 'eslint'

const config: Linter.Config[] = [
  { ignores: ['dist/**', 'node_modules/**'] },
  ...recommendedConfig({ tier: 3, isTypeChecked: true }),
]

export default config
