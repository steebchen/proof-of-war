import { useDojo } from '../providers/DojoProvider'
import { useCallback } from 'react'
import { useAccount } from '@starknet-react/core'
import { TroopType, TROOP_INFO, BuildingType, dojoConfig, NO_FEE_DETAILS } from '../config/dojoConfig'
import { useResources } from './useResources'

export function useTroops() {
  const { army, setArmy, buildings } = useDojo()
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

    // Find first barracks building
    const barracks = buildings.find(b => b.buildingType === BuildingType.Barracks && !b.isUpgrading)
    if (!barracks) {
      console.error('No available barracks')
      return false
    }

    // Optimistically update army
    const prevArmy = { ...army }
    const newArmy = { ...army }
    if (troopType === TroopType.Barbarian) {
      newArmy.barbarians += quantity
    } else {
      newArmy.archers += quantity
    }
    newArmy.totalSpaceUsed += totalSpace
    setArmy(newArmy)

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.trainingSystemAddress,
          entrypoint: 'train_troops',
          calldata: [barracks.buildingId, troopType, quantity],
        },
      ], NO_FEE_DETAILS)
      console.log('Training started on-chain')
      return true
    } catch (error) {
      console.error('Failed to train troops:', error)
      setArmy(prevArmy)
      return false
    }
  }, [account, army, buildings, canAfford, setArmy])

  const collectTroops = useCallback(async (barracksId: number) => {
    if (!account) return false

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.trainingSystemAddress,
          entrypoint: 'collect_trained_troops',
          calldata: [barracksId],
        },
      ], NO_FEE_DETAILS)
      console.log('Troops collected on-chain')
      return true
    } catch (error) {
      console.error('Failed to collect troops:', error)
      return false
    }
  }, [account])

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
    collectTroops,
    getTroopCount,
  }
}
