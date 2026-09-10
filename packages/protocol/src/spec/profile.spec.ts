import { validateDappProfile } from '@xyo-network/dapp-kit'
import {
  describe, expect, it,
} from 'vitest'

import { createSampleProfile } from '../index.js'

const chainId = '1'.repeat(40)

describe('sample dapp profile', () => {
  it('requires plaintext datalake storage before broadcast and finalized XL1 consistency', () => {
    const profile = createSampleProfile(chainId, 'local-xl1')

    expect(validateDappProfile(profile.definition, profile.configuration).success).toBe(true)
    expect(profile.configuration.network).toEqual({ expectedChainId: chainId, networkId: 'local-xl1' })
    expect(profile.configuration.datalakePolicy).toMatchObject({
      mode: 'required',
      contentProtection: 'plaintext',
      writeBeforeBroadcast: true,
      unavailableBehavior: 'fail-closed',
    })
    expect(profile.configuration.consistency.read).toBe('finalized')
    expect(Object.isFrozen(profile.configuration.datalakePolicy)).toBe(true)
  })

  it.each(['', 'sequence', '0x' + chainId, 'A'.repeat(40)])('rejects an invalid explicit chain identity: %s', (invalidChainId) => {
    expect(() => createSampleProfile(invalidChainId)).toThrow()
  })

  it.each([
    { mode: 'none' },
    { mode: 'required', writeBeforeBroadcast: false },
    { mode: 'required', readAccess: 'private-read' },
  ])('rejects runtime policies incompatible with required storage: %o', (override) => {
    const { definition, configuration } = createSampleProfile(chainId)
    const incompatible = {
      ...configuration,
      datalakePolicy: { ...configuration.datalakePolicy, ...override },
    }

    expect(validateDappProfile(definition, incompatible).success).toBe(false)
  })
})
