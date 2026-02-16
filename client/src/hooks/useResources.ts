import { useDojo } from '../providers/DojoProvider'
import { useCallback, useState, useEffect, useRef } from 'react'
import { useAccount } from '@starknet-react/core'
import { dojoConfig, BuildingType } from '../config/dojoConfig'

// Must match Cairo RESOURCE_PRODUCTION_PER_MIN
const RESOURCE_PRODUCTION_PER_MIN = 10

export interface CollectionResult {
  gold: number
  elixir: number
}

export function useResources() {
  const { player, buildings } = useDojo()
  const { account } = useAccount()
  const [lastCollection, setLastCollection] = useState<CollectionResult | null>(null)
  const [collecting, setCollecting] = useState(false)
  // Track when we last collected locally so estimates reset immediately
  const localCollectTime = useRef<number>(0)

  const gold = player?.gold ?? BigInt(0)
  const elixir = player?.elixir ?? BigInt(0)

  // Estimate pending resources based on building levels and time elapsed
  const estimatePending = useCallback((): CollectionResult => {
    const now = Math.floor(Date.now() / 1000)
    let pendingGold = 0
    let pendingElixir = 0

    for (const b of buildings) {
      if (b.level === 0 || b.lastCollectedAt === BigInt(0)) continue
      // Use the later of: on-chain lastCollectedAt or our local collect time
      const collectedAt = Math.max(Number(b.lastCollectedAt), localCollectTime.current)
      const elapsed = now - collectedAt
      const minutes = Math.floor(elapsed / 60)
      if (minutes <= 0) continue

      const production = RESOURCE_PRODUCTION_PER_MIN * minutes * b.level
      if (b.buildingType === BuildingType.GoldMine) {
        pendingGold += production
      } else if (b.buildingType === BuildingType.ElixirCollector) {
        pendingElixir += production
      }
    }

    return { gold: pendingGold, elixir: pendingElixir }
  }, [buildings])

  const [pending, setPending] = useState<CollectionResult>({ gold: 0, elixir: 0 })

  // Update pending estimate every second
  useEffect(() => {
    setPending(estimatePending())
    const interval = setInterval(() => {
      setPending(estimatePending())
    }, 1000)
    return () => clearInterval(interval)
  }, [estimatePending])

  const hasProducers = buildings.some(
    b => b.buildingType === BuildingType.GoldMine || b.buildingType === BuildingType.ElixirCollector
  )
  const canCollect = hasProducers && (pending.gold > 0 || pending.elixir > 0)

  const collectResources = useCallback(async () => {
    if (!account || collecting) return

    setCollecting(true)
    setLastCollection(null)

    try {
      const est = estimatePending()
      await account.execute([
        {
          contractAddress: dojoConfig.resourceSystemAddress,
          entrypoint: 'collect_all_resources',
          calldata: [],
        },
      ])
      // Mark local collect time so estimates reset immediately
      localCollectTime.current = Math.floor(Date.now() / 1000)
      // Force pending to zero right away
      setPending({ gold: 0, elixir: 0 })
      // Show toast with what was collected
      setLastCollection(est)
      setTimeout(() => setLastCollection(null), 3000)
    } catch (error) {
      console.error('Failed to collect resources:', error)
    } finally {
      setCollecting(false)
    }
  }, [account, collecting, estimatePending])

  const canAfford = useCallback((goldCost: number, elixirCost: number): boolean => {
    return gold >= BigInt(goldCost) && elixir >= BigInt(elixirCost)
  }, [gold, elixir])

  return {
    gold,
    elixir,
    collectResources,
    canAfford,
    canCollect,
    collecting,
    pending,
    lastCollection,
  }
}
