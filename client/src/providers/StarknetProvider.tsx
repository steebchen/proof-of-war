import { ReactNode } from 'react'
import { sepolia } from '@starknet-react/chains'
import { StarknetConfig, publicProvider, argent, braavos } from '@starknet-react/core'

const chains = [sepolia]
const providers = publicProvider()
const connectors = [argent(), braavos()]

export function StarknetProvider({ children }: { children: ReactNode }) {
  return (
    <StarknetConfig
      chains={chains}
      provider={providers}
      connectors={connectors}
      autoConnect
    >
      {children}
    </StarknetConfig>
  )
}
