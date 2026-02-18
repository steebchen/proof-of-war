import { useDojo } from '../providers/DojoProvider'
import { useCallback, useState, useEffect, useRef } from 'react'
import { useAccount } from '@starknet-react/core'
import { dojoConfig, BuildingType, NO_FEE_DETAILS } from '../config/dojoConfig'

// Must match Cairo RESOURCE_PRODUCTION_PER_MIN
const RESOURCE_PRODUCTION_PER_MIN = 10

export interface CollectionResult {
  diamond: number
  gas: number
}

export function useResources() {
  const { player, buildings } = useDojo()
  const { account } = useAccount()
  const [lastCollection, setLastCollection] = useState<CollectionResult | null>(null)
  const [collecting, setCollecting] = useState(false)
  // Track when we last collected locally so estimates reset immediately
  const localCollectTime = useRef<number>(0)

  const diamond = player?.diamond ?? BigInt(0)
  const gas = player?.gas ?? BigInt(0)

  // Estimate pending resources based on building levels and time elapsed
  const estimatePending = useCallback((): CollectionResult => {
    const now = Math.floor(Date.now() / 1000)
    let pendingDiamond = 0
    let pendingGas = 0

    for (const b of buildings) {
      if (b.level === 0 || b.lastCollectedAt === BigInt(0)) continue
      // Use the later of: on-chain lastCollectedAt or our local collect time
      const collectedAt = Math.max(Number(b.lastCollectedAt), localCollectTime.current)
      const elapsed = now - collectedAt
      const minutes = Math.floor(elapsed / 60)
      if (minutes <= 0) continue

      const production = RESOURCE_PRODUCTION_PER_MIN * minutes * b.level
      if (b.buildingType === BuildingType.DiamondMine) {
        pendingDiamond += production
      } else if (b.buildingType === BuildingType.GasCollector) {
        pendingGas += production
      }
    }

    return { diamond: pendingDiamond, gas: pendingGas }
  }, [buildings])

  const [pending, setPending] = useState<CollectionResult>({ diamond: 0, gas: 0 })

  // Update pending estimate every second
  useEffect(() => {
    setPending(estimatePending())
    const interval = setInterval(() => {
      setPending(estimatePending())
    }, 1000)
    return () => clearInterval(interval)
  }, [estimatePending])

  const hasProducers = buildings.some(
    b => b.buildingType === BuildingType.DiamondMine || b.buildingType === BuildingType.GasCollector
  )
  const canCollect = hasProducers && (pending.diamond > 0 || pending.gas > 0)

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
      ], NO_FEE_DETAILS)
      // Mark local collect time so estimates reset immediately
      localCollectTime.current = Math.floor(Date.now() / 1000)
      // Force pending to zero right away
      setPending({ diamond: 0, gas: 0 })
      // Show toast with what was collected
      setLastCollection(est)
      setTimeout(() => setLastCollection(null), 3000)
    } catch (error) {
      console.error('Failed to collect resources:', error)
    } finally {
      setCollecting(false)
    }
  }, [account, collecting, estimatePending])

  const canAfford = useCallback((diamondCost: number, gasCost: number): boolean => {
    return diamond >= BigInt(diamondCost) && gas >= BigInt(gasCost)
  }, [diamond, gas])

  return {
    diamond,
    gas,
    collectResources,
    canAfford,
    canCollect,
    collecting,
    pending,
    lastCollection,
  }
}
