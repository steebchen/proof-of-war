export const dojoConfig = {
  toriiUrl: import.meta.env.VITE_TORII_URL || 'http://localhost:8080',
  katanaUrl: import.meta.env.VITE_KATANA_URL || 'http://localhost:5050',
  worldAddress: import.meta.env.VITE_WORLD_ADDRESS || '0x0',
  buildingSystemAddress: import.meta.env.VITE_BUILDING_SYSTEM_ADDRESS || '0x0',
  resourceSystemAddress: import.meta.env.VITE_RESOURCE_SYSTEM_ADDRESS || '0x0',
  villageSystemAddress: import.meta.env.VITE_VILLAGE_SYSTEM_ADDRESS || '0x0',
  combatSystemAddress: import.meta.env.VITE_COMBAT_SYSTEM_ADDRESS || '0x0',
  trainingSystemAddress: import.meta.env.VITE_TRAINING_SYSTEM_ADDRESS || '0x0',
  namespace: 'clash',
}

// Grid constants
export const GRID_SIZE = 40
export const TILE_SIZE = 16

// Building types enum (must match Cairo)
export enum BuildingType {
  TownHall = 0,
  DiamondMine = 1,
  GasCollector = 2,
  DiamondStorage = 3,
  GasStorage = 4,
  Barracks = 5,
  ArmyCamp = 6,
  Cannon = 7,
  ArcherTower = 8,
  Wall = 9,
}

// Building display info
export const BUILDING_INFO: Record<BuildingType, { name: string; color: string; width: number; height: number; cost: { diamond: number; gas: number } }> = {
  [BuildingType.TownHall]: { name: 'Town Hall', color: '#FFD700', width: 4, height: 4, cost: { diamond: 500, gas: 500 } },
  [BuildingType.DiamondMine]: { name: 'Diamond Mine', color: '#FFA500', width: 3, height: 3, cost: { diamond: 150, gas: 0 } },
  [BuildingType.GasCollector]: { name: 'Gas Collector', color: '#9932CC', width: 3, height: 3, cost: { diamond: 150, gas: 0 } },
  [BuildingType.DiamondStorage]: { name: 'Diamond Storage', color: '#DAA520', width: 3, height: 3, cost: { diamond: 300, gas: 0 } },
  [BuildingType.GasStorage]: { name: 'Gas Storage', color: '#8B008B', width: 3, height: 3, cost: { diamond: 300, gas: 0 } },
  [BuildingType.Barracks]: { name: 'Barracks', color: '#8B4513', width: 3, height: 3, cost: { diamond: 0, gas: 200 } },
  [BuildingType.ArmyCamp]: { name: 'Army Camp', color: '#228B22', width: 4, height: 4, cost: { diamond: 0, gas: 250 } },
  [BuildingType.Cannon]: { name: 'Cannon', color: '#696969', width: 3, height: 3, cost: { diamond: 250, gas: 0 } },
  [BuildingType.ArcherTower]: { name: 'Archer Tower', color: '#4682B4', width: 3, height: 3, cost: { diamond: 0, gas: 300 } },
  [BuildingType.Wall]: { name: 'Wall', color: '#808080', width: 1, height: 1, cost: { diamond: 50, gas: 0 } },
}

// Troop types
export enum TroopType {
  Barbarian = 0,
  Archer = 1,
}

export const TROOP_INFO: Record<TroopType, { name: string; color: string; cost: number; space: number }> = {
  [TroopType.Barbarian]: { name: 'Barbarian', color: '#FFA500', cost: 25, space: 1 },
  [TroopType.Archer]: { name: 'Archer', color: '#FF69B4', cost: 50, space: 1 },
}
