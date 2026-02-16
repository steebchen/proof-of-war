import { useCallback } from 'react'
import { useDojo, Building } from '../providers/DojoProvider'
import { useAccount } from '@starknet-react/core'
import { BUILDING_SIZES } from '../utils/constants'
import { dojoConfig } from '../config/dojoConfig'
import { canBuildMore } from '../utils/buildingLimits'

export function useBuildings() {
  const {
    buildings,
    setBuildings,
    isPlacing,
    setIsPlacing,
    selectedBuildingType,
    setSelectedBuildingType,
    player
  } = useDojo()
  const { account } = useAccount()

  const townHallLevel = player?.townHallLevel ?? 1

  const startPlacing = useCallback((buildingType: number) => {
    // Check building limit before allowing placement mode
    if (!canBuildMore(buildings, buildingType, townHallLevel)) {
      console.warn(`Cannot build more of this type. Limit reached.`)
      return
    }

    setSelectedBuildingType(buildingType)
    setIsPlacing(true)
  }, [buildings, townHallLevel, setSelectedBuildingType, setIsPlacing])

  const cancelPlacing = useCallback(() => {
    setSelectedBuildingType(null)
    setIsPlacing(false)
  }, [setSelectedBuildingType, setIsPlacing])

  const checkCollision = useCallback((x: number, y: number, width: number, height: number, excludeId?: number): boolean => {
    for (const building of buildings) {
      if (excludeId !== undefined && building.buildingId === excludeId) continue

      const bSize = BUILDING_SIZES[building.buildingType] || { width: 1, height: 1 }
      const overlapsX = x < building.x + bSize.width && x + width > building.x
      const overlapsY = y < building.y + bSize.height && y + height > building.y

      if (overlapsX && overlapsY) return true
    }
    return false
  }, [buildings])

  const placeBuilding = useCallback(async (x: number, y: number) => {
    if (!account || selectedBuildingType === null) return false

    // Verify building limit again before placing
    if (!canBuildMore(buildings, selectedBuildingType, townHallLevel)) {
      console.error('Building limit reached')
      cancelPlacing()
      return false
    }

    const size = BUILDING_SIZES[selectedBuildingType] || { width: 1, height: 1 }

    // Check bounds
    if (x + size.width > 40 || y + size.height > 40) {
      console.error('Out of bounds')
      return false
    }

    // Check collision
    if (checkCollision(x, y, size.width, size.height)) {
      console.error('Building collision')
      return false
    }

    // Optimistically add building to local state
    const newBuilding: Building = {
      owner: account.address,
      buildingId: buildings.length + 2, // +2 because town hall is 1
      buildingType: selectedBuildingType,
      level: 1,
      x,
      y,
      health: 100,
      isUpgrading: false,
      upgradeFinishTime: BigInt(0),
      lastCollectedAt: BigInt(Math.floor(Date.now() / 1000)),
    }

    setBuildings([...buildings, newBuilding])
    cancelPlacing()

    // Call contract (use building system address, not world address)
    try {
      console.log('Calling place_building contract:', {
        contract: dojoConfig.buildingSystemAddress,
        type: selectedBuildingType,
        x,
        y
      })
      await account.execute([
        {
          contractAddress: dojoConfig.buildingSystemAddress,
          entrypoint: 'place_building',
          calldata: [selectedBuildingType, x, y],
        },
      ])
      console.log('Building placed on-chain successfully')
    } catch (error) {
      console.error('Failed to place building on-chain:', error)
      // Revert optimistic update on failure
      setBuildings(buildings)
      return false
    }

    return true
  }, [account, selectedBuildingType, buildings, townHallLevel, checkCollision, setBuildings, cancelPlacing])

  const getBuildingAt = useCallback((x: number, y: number): Building | undefined => {
    for (const building of buildings) {
      const size = BUILDING_SIZES[building.buildingType] || { width: 1, height: 1 }
      if (x >= building.x && x < building.x + size.width &&
          y >= building.y && y < building.y + size.height) {
        return building
      }
    }
    return undefined
  }, [buildings])

  return {
    buildings,
    isPlacing,
    selectedBuildingType,
    startPlacing,
    cancelPlacing,
    placeBuilding,
    checkCollision,
    getBuildingAt,
  }
}
