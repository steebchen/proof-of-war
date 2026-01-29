import { useState, useCallback } from 'react'
import { useDojo, Building } from '../providers/DojoProvider'
import { useAccount } from '@starknet-react/core'
import { BUILDING_SIZES } from '../utils/constants'

export function useBuildings() {
  const { buildings, setBuildings } = useDojo()
  const { account } = useAccount()
  const [isPlacing, setIsPlacing] = useState(false)
  const [selectedBuildingType, setSelectedBuildingType] = useState<number | null>(null)

  const startPlacing = useCallback((buildingType: number) => {
    setSelectedBuildingType(buildingType)
    setIsPlacing(true)
  }, [])

  const cancelPlacing = useCallback(() => {
    setSelectedBuildingType(null)
    setIsPlacing(false)
  }, [])

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
    }

    setBuildings([...buildings, newBuilding])
    cancelPlacing()

    // TODO: Call contract
    console.log('Place building:', { type: selectedBuildingType, x, y })

    return true
  }, [account, selectedBuildingType, buildings, checkCollision, setBuildings, cancelPlacing])

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
