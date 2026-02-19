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

// Building sprite map (building type → image path in public/)
export const BUILDING_SPRITES: Partial<Record<BuildingType, string>> = {
  [BuildingType.TownHall]: '/buildings/command-center.png',
  [BuildingType.DiamondMine]: '/buildings/diamond-refinery.png',
  [BuildingType.DiamondStorage]: '/buildings/diamond-storage.png',
  [BuildingType.GasCollector]: '/buildings/gas-extractor.png',
  [BuildingType.GasStorage]: '/buildings/gas-storage.png',
  [BuildingType.Cannon]: '/buildings/cannon.png',
  [BuildingType.ArmyCamp]: '/buildings/camp.png',
  [BuildingType.Barracks]: '/buildings/barracks.png',
}

// Skip fee estimation on Katana dev (block timestamp can be stale)
export const NO_FEE_DETAILS = {
  resourceBounds: {
    l1_gas: { max_amount: 0n, max_price_per_unit: 0n },
    l2_gas: { max_amount: 0n, max_price_per_unit: 0n },
    l1_data_gas: { max_amount: 0n, max_price_per_unit: 0n },
  },
}

// Initial construction times in seconds (must match Cairo config)
export const BUILD_TIMES: Record<BuildingType, number> = {
  [BuildingType.TownHall]: 0,
  [BuildingType.DiamondMine]: 3,
  [BuildingType.GasCollector]: 3,
  [BuildingType.DiamondStorage]: 5,
  [BuildingType.GasStorage]: 5,
  [BuildingType.Barracks]: 10,
  [BuildingType.ArmyCamp]: 10,
  [BuildingType.Cannon]: 30,
  [BuildingType.ArcherTower]: 30,
  [BuildingType.Wall]: 1,
}

// Building health by type/level (must match Cairo config)
export function getBuildingMaxHealth(buildingType: BuildingType, level: number): number {
  if (level <= 0) return 0
  const baseHealth: Record<BuildingType, number> = {
    [BuildingType.TownHall]: 1500,
    [BuildingType.DiamondMine]: 400,
    [BuildingType.GasCollector]: 400,
    [BuildingType.DiamondStorage]: 500,
    [BuildingType.GasStorage]: 500,
    [BuildingType.Barracks]: 350,
    [BuildingType.ArmyCamp]: 300,
    [BuildingType.Cannon]: 420,
    [BuildingType.ArcherTower]: 380,
    [BuildingType.Wall]: 300,
  }
  const base = baseHealth[buildingType] ?? 400
  return base + Math.floor(base * (level - 1) / 4)
}

// Troop types
export enum TroopType {
  Barbarian = 0,
  Archer = 1,
  Giant = 2,
}

export const TROOP_INFO: Record<TroopType, { name: string; color: string; cost: number; space: number }> = {
  [TroopType.Barbarian]: { name: 'Barbarian', color: '#FFA500', cost: 25, space: 1 },
  [TroopType.Archer]: { name: 'Archer', color: '#FF69B4', cost: 50, space: 1 },
  [TroopType.Giant]: { name: 'Giant', color: '#8B4513', cost: 150, space: 5 },
}

// Spell types (must match Cairo)
export enum SpellType {
  Lightning = 0,
  Heal = 1,
  Rage = 2,
}

export const SPELL_INFO: Record<SpellType, { name: string; color: string; cost: number; description: string }> = {
  [SpellType.Lightning]: { name: 'Lightning', color: '#FFD700', cost: 100, description: 'Deals 200 damage to buildings in area' },
  [SpellType.Heal]: { name: 'Heal', color: '#2ECC71', cost: 75, description: 'Heals troops in area by 150 HP' },
  [SpellType.Rage]: { name: 'Rage', color: '#E74C3C', cost: 150, description: 'Doubles troop damage in area' },
}

export const SPELL_UNLOCK_TH_LEVEL = 3
export const MAX_SPELLS_PER_BATTLE = 3

// Trophy leagues
export interface LeagueInfo {
  name: string
  color: string
  minTrophies: number
}

export const LEAGUES: LeagueInfo[] = [
  { name: 'Diamond', color: '#B9F2FF', minTrophies: 1200 },
  { name: 'Gold', color: '#FFD700', minTrophies: 800 },
  { name: 'Silver', color: '#C0C0C0', minTrophies: 400 },
  { name: 'Bronze', color: '#CD7F32', minTrophies: 0 },
]

export function getLeague(trophies: number): LeagueInfo {
  for (const league of LEAGUES) {
    if (trophies >= league.minTrophies) return league
  }
  return LEAGUES[LEAGUES.length - 1]
}
