import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  commands: {
    deplint: {
      role: 'service',
      packages: {
        // The launcher resolves this package's CLI entry and spawns it as an owned child.
        '@xyo-network/xl1-cli': { placement: 'dep', presence: 'required' },
      },
    },
  },
  compile: { node: true, entryMode: 'all' },
}

export default config
