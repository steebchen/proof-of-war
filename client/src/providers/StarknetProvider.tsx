import { ReactNode } from 'react'
import { devnet } from '@starknet-react/chains'
import { StarknetConfig, jsonRpcProvider, Connector } from '@starknet-react/core'
import { ControllerConnector } from '@cartridge/connector'
import { DevConnector } from '../connectors/DevConnector'

// Use devnet chain with custom RPC URL for Katana
const katanaUrl = import.meta.env.VITE_KATANA_URL
const isDevMode = import.meta.env.VITE_DEV_MODE === 'true'

const chains = [devnet]

// Provider configuration
const provider = jsonRpcProvider({
  rpc: () => ({ nodeUrl: katanaUrl }),
})

// Dev mode: use Katana prefunded account directly
const devConnector = new DevConnector(katanaUrl)

// Production: use Cartridge Controller
const cartridgeConnector = new ControllerConnector({
  defaultChainId: `0x${devnet.id.toString(16)}`,
  chains: [
    {
      rpcUrl: katanaUrl,
    },
  ],
  // Session policies for game actions
  policies: {
    contracts: {
      [import.meta.env.VITE_WORLD_ADDRESS]: {
        methods: [
          // Village system
          { name: 'spawn', entrypoint: 'spawn' },
          // Building system
          { name: 'place_building', entrypoint: 'place_building' },
          { name: 'upgrade_building', entrypoint: 'upgrade_building' },
          { name: 'finish_upgrade', entrypoint: 'finish_upgrade' },
          { name: 'move_building', entrypoint: 'move_building' },
          // Resource system
          { name: 'collect_all_resources', entrypoint: 'collect_all_resources' },
          { name: 'collect_from_building', entrypoint: 'collect_from_building' },
          // Training system
          { name: 'train_troops', entrypoint: 'train_troops' },
          { name: 'collect_trained_troops', entrypoint: 'collect_trained_troops' },
          // Combat system
          { name: 'start_attack', entrypoint: 'start_attack' },
          { name: 'deploy_troop', entrypoint: 'deploy_troop' },
          { name: 'process_combat', entrypoint: 'process_combat' },
          { name: 'end_battle', entrypoint: 'end_battle' },
        ],
      },
    },
  },
})

// Use dev connector in dev mode, otherwise use Controller
const connectors = isDevMode ? [devConnector as unknown as Connector] : [cartridgeConnector]

console.log(`Starknet Provider: ${isDevMode ? 'DEV MODE (Katana prefunded account)' : 'PRODUCTION (Controller)'}`)

export function StarknetProvider({ children }: { children: ReactNode }) {
  return (
    <StarknetConfig
      chains={chains}
      provider={provider}
      connectors={connectors}
      autoConnect
    >
      {children}
    </StarknetConfig>
  )
}
