import { BuildingType } from '../config/dojoConfig'
import { Building } from '../providers/DojoProvider'

/**
 * Get the maximum number of buildings allowed for a building type at a given town hall level.
 * Matches src/utils/config.cairo get_max_building_count()
 */
export function getMaxBuildingCount(buildingType: BuildingType, townHallLevel: number): number {
  switch (buildingType) {
    case BuildingType.TownHall:
      return 1
    case BuildingType.DiamondMine:
      return townHallLevel + 1
    case BuildingType.GasCollector:
      return townHallLevel + 1
    case BuildingType.DiamondStorage:
      return townHallLevel
    case BuildingType.GasStorage:
      return townHallLevel
    case BuildingType.Barracks:
      return 1 + Math.floor(townHallLevel / 3)
    case BuildingType.ArmyCamp:
      return 1
    case BuildingType.Cannon:
      return townHallLevel
    case BuildingType.ArcherTower:
      return townHallLevel >= 2 ? townHallLevel - 1 : 0
    case BuildingType.Wall:
      return townHallLevel * 25
    default:
      return 0
  }
}

/**
 * Count the number of buildings of a specific type owned by the player.
 */
export function countBuildingsOfType(buildings: Building[], buildingType: BuildingType): number {
  return buildings.filter(b => b.buildingType === buildingType).length
}

/**
 * Check if the player can build more of a specific building type.
 */
export function canBuildMore(
  buildings: Building[],
  buildingType: BuildingType,
  townHallLevel: number
): boolean {
  const current = countBuildingsOfType(buildings, buildingType)
  const max = getMaxBuildingCount(buildingType, townHallLevel)
  return current < max
}

export interface BuildingLimitInfo {
  current: number
  max: number
  canBuild: boolean
}

/**
 * Get building limits for all building types at a given town hall level.
 */
export function getBuildingLimits(
  buildings: Building[],
  townHallLevel: number
): Record<BuildingType, BuildingLimitInfo> {
  const limits = {} as Record<BuildingType, BuildingLimitInfo>

  for (const type of Object.values(BuildingType).filter(v => typeof v === 'number') as BuildingType[]) {
    const current = countBuildingsOfType(buildings, type)
    const max = getMaxBuildingCount(type, townHallLevel)
    limits[type] = {
      current,
      max,
      canBuild: current < max,
    }
  }

  return limits
}
