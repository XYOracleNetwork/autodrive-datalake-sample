import type { DappProfile } from '@xyo-network/dapp-kit'
import {
  DappConfigurationSchema,
  DappConfigurationZod,
  DappDefinitionSchema,
  DappDefinitionZod,
  validateDappConfiguration,
  validateDappDefinition,
  validateDappProfile,
} from '@xyo-network/dapp-kit'

import { freezeJson } from './freeze.js'
import { SAMPLE_SCHEMA } from './payload.js'

/** Validate the shared declaration; app runtime gates enforce these policies operationally. */
export function createSampleProfile(chainId: string, networkId = 'sample'): DappProfile {
  const definition = DappDefinitionZod.parse({
    schema: DappDefinitionSchema,
    schemaVersion: 1,
    dappId: 'network.xyo.autodrive.sample',
    definitionVersion: '1.0.0',
    protocolVersion: '1',
    substrate: { canonicalSource: 'xl1-finalized', relationships: ['consumes-finalized'] },
    schemas: [{ schema: SAMPLE_SCHEMA, version: 1 }],
    actors: [],
    ports: [],
    identityRoles: [],
    coordination: { profile: 'none' },
    externalInteraction: { mode: 'none' },
    durability: {
      contentMode: 'datalake-backed',
      datalake: {
        mode: 'required',
        allowedReadAccess: ['public-read'],
        allowedContentProtection: ['plaintext'],
        minimumCopies: 1,
        minimumRetentionSeconds: 0,
        unavailableBehavior: 'fail-closed',
      },
      projection: { profile: 'none' },
      auxiliaryStores: [],
      consistency: 'finalized',
    },
    compatibility: { minimumHostProtocol: '1', acceptedPriorProtocolVersions: [] },
  })
  const configuration = DappConfigurationZod.parse({
    schema: DappConfigurationSchema,
    schemaVersion: 1,
    dappId: definition.dappId,
    definitionVersion: definition.definitionVersion,
    network: { networkId, expectedChainId: chainId },
    actors: [],
    supervision: { policy: 'parallel' },
    providerBindings: {},
    identityBindings: [],
    sideChannelPolicy: { profile: 'none' },
    externalInteractionPolicy: { mode: 'none' },
    datalakePolicy: {
      mode: 'required',
      readAccess: 'public-read',
      contentProtection: 'plaintext',
      writeBeforeBroadcast: true,
      requiredCopies: 1,
      retentionSeconds: 0,
      unavailableBehavior: 'fail-closed',
    },
    auxiliaryStores: [],
    projectionPolicy: { profile: 'none' },
    consistency: { read: 'finalized', readinessMaxLag: 0 },
  })
  for (const validation of [validateDappDefinition(definition), validateDappConfiguration(configuration)]) {
    if (!validation.success) throw new TypeError(validation.issues.map(issue => issue.message).join('; '))
  }
  const profile = validateDappProfile(definition, configuration)
  if (!profile.success) throw new TypeError(profile.issues.map(issue => issue.message).join('; '))
  return freezeJson(profile.value)
}
