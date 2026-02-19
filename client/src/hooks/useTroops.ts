import { useDojo } from '../providers/DojoProvider'
import { useCallback } from 'react'
import { useAccount } from '@starknet-react/core'
import { TroopType, TROOP_INFO, BuildingType, dojoConfig, NO_FEE_DETAILS } from '../config/dojoConfig'
import { useResources } from './useResources'

export function useTroops() {
  const { army, setArmy, buildings, trainingQueues, setTrainingQueues } = useDojo()
  const { account } = useAccount()
  const { canAfford } = useResources()

  const barbarians = army?.barbarians ?? 0
  const archers = army?.archers ?? 0
  const giants = army?.giants ?? 0
  const totalSpace = army?.totalSpaceUsed ?? 0
  const maxCapacity = army?.maxCapacity ?? 0
  const trainTroops = useCallback(async (troopType: TroopType, quantity: number) => {
    if (!account || !army) return false

    const troopInfo = TROOP_INFO[troopType]
    const totalCost = troopInfo.cost * quantity
    const spaceNeeded = troopInfo.space * quantity

    // Check if we have capacity (including reserved space)
    if (army.totalSpaceUsed + (army.reservedSpace ?? 0) + spaceNeeded > army.maxCapacity) {
      console.error('Not enough army capacity')
      return false
    }

    // Check if we can afford
    if (!canAfford(0, totalCost)) {
      console.error('Not enough gas')
      return false
    }

    // Find available barracks: empty queue, finished queue, or same troop type in-progress
    const now = Math.floor(Date.now() / 1000)
    const allBarracks = buildings.filter(b => b.buildingType === BuildingType.Barracks && !b.isUpgrading && b.level > 0)
    let barracks = null
    for (const b of allBarracks) {
      const queue = trainingQueues.find(q => q.barracksId === b.buildingId)
      if (!queue || queue.quantity <= 0) {
        // Empty queue — best option
        barracks = b
        break
      }
      if (Number(queue.finishTime) <= now) {
        // Finished — will auto-collect on-chain
        barracks = b
        break
      }
      if (queue.troopType === troopType) {
        // Same type in-progress — can stack
        barracks = b
        break
      }
    }
    if (!barracks) {
      console.error('No available barracks')
      return false
    }

    // Optimistically update army
    const prevArmy = { ...army }
    const newArmy = { ...army }
    if (troopType === TroopType.Barbarian) {
      newArmy.barbarians += quantity
    } else if (troopType === TroopType.Archer) {
      newArmy.archers += quantity
    } else if (troopType === TroopType.Giant) {
      newArmy.giants += quantity
    }
    newArmy.totalSpaceUsed += spaceNeeded
    setArmy(newArmy)

    // Optimistically update training queue for the barracks
    const troopTimes: Record<number, number> = { [TroopType.Barbarian]: 3, [TroopType.Archer]: 5, [TroopType.Giant]: 10 }
    const timePerUnit = troopTimes[troopType] ?? 3
    const additionalTime = timePerUnit * quantity
    const existingQueue = trainingQueues.find(q => q.barracksId === barracks.buildingId)
    const prevQueues = [...trainingQueues]

    let optimisticQueue
    if (existingQueue && existingQueue.quantity > 0 && Number(existingQueue.finishTime) > now && existingQueue.troopType === troopType) {
      optimisticQueue = {
        owner: account.address,
        barracksId: barracks.buildingId,
        troopType,
        quantity: existingQueue.quantity + quantity,
        finishTime: existingQueue.finishTime + BigInt(additionalTime),
      }
    } else {
      optimisticQueue = {
        owner: account.address,
        barracksId: barracks.buildingId,
        troopType,
        quantity,
        finishTime: BigInt(now + additionalTime),
      }
    }
    setTrainingQueues([...trainingQueues.filter(q => q.barracksId !== barracks.buildingId), optimisticQueue])

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
      setTrainingQueues(prevQueues)
      return false
    }
  }, [account, army, buildings, trainingQueues, canAfford, setArmy, setTrainingQueues])

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
    if (troopType === TroopType.Giant) return giants
    return archers
  }, [barbarians, archers, giants])

  return {
    barbarians,
    archers,
    giants,
    totalSpace,
    maxCapacity,
    trainTroops,
    collectTroops,
    getTroopCount,
  }
}
