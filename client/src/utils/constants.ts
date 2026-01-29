export const GRID_SIZE = 40
export const TILE_SIZE = 16
export const CANVAS_SIZE = GRID_SIZE * TILE_SIZE // 640px

// Colors
export const COLORS = {
  grass: '#228B22',
  gridLine: 'rgba(255, 255, 255, 0.1)',
  selectionValid: 'rgba(0, 255, 0, 0.3)',
  selectionInvalid: 'rgba(255, 0, 0, 0.3)',
  gold: '#FFD700',
  elixir: '#9932CC',
}

// Building sizes (in tiles)
export const BUILDING_SIZES: Record<number, { width: number; height: number }> = {
  0: { width: 4, height: 4 }, // TownHall
  1: { width: 3, height: 3 }, // GoldMine
  2: { width: 3, height: 3 }, // ElixirCollector
  3: { width: 3, height: 3 }, // GoldStorage
  4: { width: 3, height: 3 }, // ElixirStorage
  5: { width: 3, height: 3 }, // Barracks
  6: { width: 4, height: 4 }, // ArmyCamp
  7: { width: 3, height: 3 }, // Cannon
  8: { width: 3, height: 3 }, // ArcherTower
  9: { width: 1, height: 1 }, // Wall
}

// Building colors
export const BUILDING_COLORS: Record<number, string> = {
  0: '#FFD700', // TownHall - Gold
  1: '#FFA500', // GoldMine - Orange
  2: '#9932CC', // ElixirCollector - Purple
  3: '#DAA520', // GoldStorage - Goldenrod
  4: '#8B008B', // ElixirStorage - Dark Magenta
  5: '#8B4513', // Barracks - Saddle Brown
  6: '#228B22', // ArmyCamp - Forest Green
  7: '#696969', // Cannon - Dim Gray
  8: '#4682B4', // ArcherTower - Steel Blue
  9: '#808080', // Wall - Gray
}

// Building names
export const BUILDING_NAMES: Record<number, string> = {
  0: 'Town Hall',
  1: 'Gold Mine',
  2: 'Elixir Collector',
  3: 'Gold Storage',
  4: 'Elixir Storage',
  5: 'Barracks',
  6: 'Army Camp',
  7: 'Cannon',
  8: 'Archer Tower',
  9: 'Wall',
}
