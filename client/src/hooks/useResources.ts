import { useDojo } from '../providers/DojoProvider'
import { useCallback } from 'react'
import { useAccount } from '@starknet-react/core'
import { dojoConfig } from '../config/dojoConfig'

export function useResources() {
  const { player } = useDojo()
  const { account } = useAccount()

  const gold = player?.gold ?? BigInt(0)
  const elixir = player?.elixir ?? BigInt(0)

  const collectResources = useCallback(async () => {
    if (!account) return

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.resourceSystemAddress,
          entrypoint: 'collect_all_resources',
          calldata: [],
        },
      ])
      console.log('Resources collected on-chain')
    } catch (error) {
      console.error('Failed to collect resources:', error)
    }
  }, [account])

  const canAfford = useCallback((goldCost: number, elixirCost: number): boolean => {
    return gold >= BigInt(goldCost) && elixir >= BigInt(elixirCost)
  }, [gold, elixir])

  return {
    gold,
    elixir,
    collectResources,
    canAfford,
  }
}
