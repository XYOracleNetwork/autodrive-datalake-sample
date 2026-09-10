import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  commands: { deplint: { role: 'cli' } },
  compile: { node: true, entryMode: 'all' },
}

export default config
