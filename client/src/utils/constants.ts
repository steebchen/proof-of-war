export const GRID_SIZE = 40
export const TILE_SIZE = 16
export const CANVAS_SIZE = GRID_SIZE * TILE_SIZE // 640px

// Isometric dimensions (2:1 ratio)
export const HALF_W = 12 // tile diamond half-width
export const HALF_H = 6  // tile diamond half-height
export const ISO_CANVAS_W = 1000
export const ISO_CANVAS_H = 500
export const TOP_PADDING = 40

// Building heights (pixels) for isometric 3D boxes
export const BUILDING_HEIGHTS: Record<number, number> = {
  0: 24, // TownHall
  1: 14, // DiamondMine
  2: 14, // GasCollector
  3: 14, // DiamondStorage
  4: 14, // GasStorage
  5: 18, // Barracks
  6: 18, // ArmyCamp
  7: 18, // Cannon
  8: 18, // ArcherTower
  9: 6,  // Wall
}

// Colors
export const COLORS = {
  grass: '#228B22',
  gridLine: 'rgba(255, 255, 255, 0.1)',
  selectionValid: 'rgba(0, 255, 0, 0.3)',
  selectionInvalid: 'rgba(255, 0, 0, 0.3)',
  diamond: '#FFD700',
  gas: '#9932CC',
}

// Building sizes (in tiles)
export const BUILDING_SIZES: Record<number, { width: number; height: number }> = {
  0: { width: 4, height: 4 }, // TownHall
  1: { width: 3, height: 3 }, // DiamondMine
  2: { width: 3, height: 3 }, // GasCollector
  3: { width: 3, height: 3 }, // DiamondStorage
  4: { width: 3, height: 3 }, // GasStorage
  5: { width: 3, height: 3 }, // Barracks
  6: { width: 4, height: 4 }, // ArmyCamp
  7: { width: 3, height: 3 }, // Cannon
  8: { width: 3, height: 3 }, // ArcherTower
  9: { width: 1, height: 1 }, // Wall
}

// Building colors
export const BUILDING_COLORS: Record<number, string> = {
  0: '#FFD700', // TownHall
  1: '#FFA500', // DiamondMine - Orange
  2: '#9932CC', // GasCollector - Purple
  3: '#DAA520', // DiamondStorage - Goldenrod
  4: '#8B008B', // GasStorage - Dark Magenta
  5: '#8B4513', // Barracks - Saddle Brown
  6: '#228B22', // ArmyCamp - Forest Green
  7: '#696969', // Cannon - Dim Gray
  8: '#4682B4', // ArcherTower - Steel Blue
  9: '#808080', // Wall - Gray
}

// Building names
export const BUILDING_NAMES: Record<number, string> = {
  0: 'Town Hall',
  1: 'Diamond Mine',
  2: 'Gas Collector',
  3: 'Diamond Storage',
  4: 'Gas Storage',
  5: 'Barracks',
  6: 'Army Camp',
  7: 'Cannon',
  8: 'Archer Tower',
  9: 'Wall',
}
