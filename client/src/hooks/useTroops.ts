import { useDojo } from '../providers/DojoProvider'
import { useCallback } from 'react'
import { useAccount } from '@starknet-react/core'
import { TroopType, TROOP_INFO } from '../config/dojoConfig'
import { useResources } from './useResources'

export function useTroops() {
  const { army, setArmy } = useDojo()
  const { account } = useAccount()
  const { canAfford } = useResources()

  const barbarians = army?.barbarians ?? 0
  const archers = army?.archers ?? 0
  const totalSpace = army?.totalSpaceUsed ?? 0
  const maxCapacity = army?.maxCapacity ?? 0

  const trainTroops = useCallback(async (troopType: TroopType, quantity: number) => {
    if (!account || !army) return false

    const troopInfo = TROOP_INFO[troopType]
    const totalCost = troopInfo.cost * quantity
    const totalSpace = troopInfo.space * quantity

    // Check if we have capacity
    if (army.totalSpaceUsed + totalSpace > army.maxCapacity) {
      console.error('Not enough army capacity')
      return false
    }

    // Check if we can afford
    if (!canAfford(0, totalCost)) {
      console.error('Not enough gas')
      return false
    }

    // Optimistically update army
    const newArmy = { ...army }
    if (troopType === TroopType.Barbarian) {
      newArmy.barbarians += quantity
    } else {
      newArmy.archers += quantity
    }
    newArmy.totalSpaceUsed += totalSpace
    setArmy(newArmy)

    // TODO: Call contract
    console.log('Training troops:', { troopType, quantity })

    return true
  }, [account, army, canAfford, setArmy])

  const getTroopCount = useCallback((troopType: TroopType): number => {
    if (troopType === TroopType.Barbarian) return barbarians
    return archers
  }, [barbarians, archers])

  return {
    barbarians,
    archers,
    totalSpace,
    maxCapacity,
    trainTroops,
    getTroopCount,
  }
}
