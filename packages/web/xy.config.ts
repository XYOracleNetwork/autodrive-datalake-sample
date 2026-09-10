import type { XyConfig } from '@ariestools/toolchain'

const config: XyConfig = {
  commands: {
    deplint: {
      role: 'app',
      packages: {
        '@ariestools/eslint-config-react-flat': { placement: 'dev' },
        'eslint': { placement: 'dev' },
        // MUI marks these optional for alternative engines, but its imported default engine and barrel require them.
        '@emotion/react': { placement: 'dep', presence: 'required' },
        '@emotion/styled': { placement: 'dep', presence: 'required' },
        '@mui/material-pigment-css': { placement: 'dep', presence: 'required' },
      },
    },
  },
  compile: { browser: true },
}

export default config
