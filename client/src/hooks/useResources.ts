import { useDojo } from '../providers/DojoProvider'
import { useCallback } from 'react'
import { useAccount } from '@starknet-react/core'

export function useResources() {
  const { player, setPlayer } = useDojo()
  const { account } = useAccount()

  const gold = player?.gold ?? BigInt(0)
  const elixir = player?.elixir ?? BigInt(0)

  const collectResources = useCallback(async () => {
    if (!account) return

    // TODO: Call contract to collect resources
    console.log('Collecting resources...')

    // Simulate resource collection
    if (player) {
      setPlayer({
        ...player,
        gold: player.gold + BigInt(100),
        elixir: player.elixir + BigInt(100),
      })
    }
  }, [account, player, setPlayer])

  const canAfford = useCallback((goldCost: number, elixirCost: number): boolean => {
    return gold >= BigInt(goldCost) && elixir >= BigInt(elixirCost)
  }, [gold, elixir])

  const spendResources = useCallback((goldCost: number, elixirCost: number) => {
    if (!player || !canAfford(goldCost, elixirCost)) return false

    setPlayer({
      ...player,
      gold: player.gold - BigInt(goldCost),
      elixir: player.elixir - BigInt(elixirCost),
    })

    return true
  }, [player, canAfford, setPlayer])

  return {
    gold,
    elixir,
    collectResources,
    canAfford,
    spendResources,
  }
}
