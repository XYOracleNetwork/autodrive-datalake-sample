import { MainNetwork, SequenceNetwork } from '@xyo-network/xl1-sdk'

import { requireCondition } from './errors.js'

const startupProfiles = ['local', 'sequence', 'mainnet'] as const
export type StartupProfile = typeof startupProfiles[number]

export interface SampleNetworkConfiguration {
  chainId: string
  networkId: StartupProfile
  rpcUrl: string
}

/** An explicit command selects the network; legacy environment values cannot redirect it. */
export function startupProfileFromArguments(args: readonly string[]): StartupProfile {
  if (args.length === 0) return 'sequence'
  requireCondition(args.length === 2 && args[0] === '--network', 'configuration', 'Use --network local, sequence, or mainnet')
  const profile = startupProfiles.find(value => value === args[1])
  requireCondition(profile !== undefined, 'configuration', 'Use --network local, sequence, or mainnet')
  return profile
}

export function publicNetworkConfiguration(profile: Exclude<StartupProfile, 'local'>): SampleNetworkConfiguration {
  const network = profile === 'mainnet' ? MainNetwork : SequenceNetwork
  requireCondition(network.chain !== undefined, 'configuration', 'The selected public SDK network must declare its expected chain identity')
  const rpcUrl = new URL('rpc', `${network.url}/`)
  return {
    chainId: network.chain,
    networkId: profile,
    rpcUrl: rpcUrl.href,
  }
}
