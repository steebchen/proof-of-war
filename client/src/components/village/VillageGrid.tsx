import { useRef, useEffect, useState, useCallback } from 'react'
import { useBuildings } from '../../hooks/useBuildings'
import { useResources } from '../../hooks/useResources'
import { useAccount } from '@starknet-react/core'
import { dojoConfig, BuildingType, BUILDING_INFO } from '../../config/dojoConfig'
import {
  GRID_SIZE,
  TILE_SIZE,
  CANVAS_SIZE,
  COLORS,
  BUILDING_SIZES,
  BUILDING_COLORS,
  BUILDING_NAMES,
} from '../../utils/constants'

// Max levels must match Cairo config
const MAX_LEVELS: Record<number, number> = {
  [BuildingType.TownHall]: 5,
  [BuildingType.GoldMine]: 3,
  [BuildingType.ElixirCollector]: 3,
  [BuildingType.GoldStorage]: 3,
  [BuildingType.ElixirStorage]: 3,
  [BuildingType.Barracks]: 3,
  [BuildingType.ArmyCamp]: 3,
  [BuildingType.Cannon]: 3,
  [BuildingType.ArcherTower]: 3,
  [BuildingType.Wall]: 3,
}

// Upgrade costs: base_cost * next_level (must match Cairo)
function getUpgradeCost(buildingType: number, currentLevel: number): { gold: number; elixir: number } {
  const info = BUILDING_INFO[buildingType as BuildingType]
  if (!info) return { gold: 0, elixir: 0 }
  const nextLevel = currentLevel + 1
  return {
    gold: info.cost.gold * nextLevel,
    elixir: info.cost.elixir * nextLevel,
  }
}

// Must match Cairo RESOURCE_PRODUCTION_PER_MIN
const RESOURCE_PRODUCTION_PER_MIN = 10

function getBuildingStats(buildingType: number, level: number): string {
  const perMin = RESOURCE_PRODUCTION_PER_MIN * level
  const perSec = (perMin / 60).toFixed(2)
  switch (buildingType) {
    case BuildingType.GoldMine:
      return `${perSec} gold/sec (${perMin}/min)`
    case BuildingType.ElixirCollector:
      return `${perSec} elixir/sec (${perMin}/min)`
    case BuildingType.GoldStorage:
      return `Stores ${1500 * level} gold`
    case BuildingType.ElixirStorage:
      return `Stores ${1500 * level} elixir`
    case BuildingType.TownHall:
      return `Stores ${1000 * level} each`
    default:
      return ''
  }
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Done!'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function getUpgradeRemaining(upgradeFinishTime: bigint, now: number): number {
  const finish = Number(upgradeFinishTime)
  return Math.max(0, finish - now)
}

export function VillageGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const {
    buildings,
    isPlacing,
    selectedBuildingType,
    placeBuilding,
    checkCollision,
    getBuildingAt,
  } = useBuildings()
  const { canAfford } = useResources()
  const { account } = useAccount()
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null)
  const [upgrading, setUpgrading] = useState(false)
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))

  // Tick every second for upgrade timers
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Math.floor(Date.now() / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Draw the grid
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = COLORS.grass
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Draw grid lines
    ctx.strokeStyle = COLORS.gridLine
    ctx.lineWidth = 1
    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath()
      ctx.moveTo(i * TILE_SIZE, 0)
      ctx.lineTo(i * TILE_SIZE, CANVAS_SIZE)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(0, i * TILE_SIZE)
      ctx.lineTo(CANVAS_SIZE, i * TILE_SIZE)
      ctx.stroke()
    }

    // Draw buildings
    for (const building of buildings) {
      const size = BUILDING_SIZES[building.buildingType] || { width: 1, height: 1 }
      const color = BUILDING_COLORS[building.buildingType] || '#888'
      const isSelected = selectedBuilding === building.buildingId
      const bx = building.x * TILE_SIZE
      const by = building.y * TILE_SIZE
      const bw = size.width * TILE_SIZE
      const bh = size.height * TILE_SIZE

      // Building fill
      ctx.fillStyle = color
      ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2)

      // Building border
      ctx.strokeStyle = isSelected ? '#fff' : 'rgba(0,0,0,0.3)'
      ctx.lineWidth = isSelected ? 3 : 1
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2)

      // Building level text
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`L${building.level}`, bx + bw / 2, by + bh / 2)

      // Upgrading overlay + countdown
      if (building.isUpgrading) {
        const remaining = getUpgradeRemaining(building.upgradeFinishTime, now)

        // Orange overlay
        ctx.fillStyle = 'rgba(255, 165, 0, 0.5)'
        ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2)

        // Countdown text
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 9px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText(
          remaining > 0 ? formatCountdown(remaining) : 'Ready!',
          bx + bw / 2,
          by + bh - 2
        )
      }
    }

    // Draw placement preview
    if (isPlacing && mousePos && selectedBuildingType !== null) {
      const size = BUILDING_SIZES[selectedBuildingType] || { width: 1, height: 1 }
      const gridX = Math.floor(mousePos.x / TILE_SIZE)
      const gridY = Math.floor(mousePos.y / TILE_SIZE)

      // Check if placement is valid
      const outOfBounds = gridX + size.width > GRID_SIZE || gridY + size.height > GRID_SIZE
      const hasCollision = checkCollision(gridX, gridY, size.width, size.height)
      const isValid = !outOfBounds && !hasCollision

      // Draw ghost
      ctx.fillStyle = isValid ? COLORS.selectionValid : COLORS.selectionInvalid
      ctx.fillRect(
        gridX * TILE_SIZE,
        gridY * TILE_SIZE,
        size.width * TILE_SIZE,
        size.height * TILE_SIZE
      )

      // Draw building preview
      ctx.fillStyle = BUILDING_COLORS[selectedBuildingType] || '#888'
      ctx.globalAlpha = 0.6
      ctx.fillRect(
        gridX * TILE_SIZE + 1,
        gridY * TILE_SIZE + 1,
        size.width * TILE_SIZE - 2,
        size.height * TILE_SIZE - 2
      )
      ctx.globalAlpha = 1
    }
  }, [buildings, isPlacing, mousePos, selectedBuildingType, selectedBuilding, checkCollision, now])

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    setMousePos({ x, y })
  }, [])

  // Handle click
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const gridX = Math.floor(x / TILE_SIZE)
    const gridY = Math.floor(y / TILE_SIZE)

    if (isPlacing && selectedBuildingType !== null) {
      placeBuilding(gridX, gridY)
    } else {
      // Select building at click position
      const building = getBuildingAt(gridX, gridY)
      setSelectedBuilding(building?.buildingId ?? null)
    }
  }, [isPlacing, selectedBuildingType, placeBuilding, getBuildingAt])

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setMousePos(null)
  }, [])

  // Upgrade building on-chain
  const handleUpgrade = useCallback(async (buildingId: number) => {
    if (!account) return
    setUpgrading(true)
    try {
      await account.execute([
        {
          contractAddress: dojoConfig.buildingSystemAddress,
          entrypoint: 'upgrade_building',
          calldata: [buildingId],
        },
      ])
      console.log('Upgrade started on-chain')
    } catch (error) {
      console.error('Failed to upgrade:', error)
    } finally {
      setUpgrading(false)
    }
  }, [account])

  // Finish upgrade on-chain
  const handleFinishUpgrade = useCallback(async (buildingId: number) => {
    if (!account) return
    try {
      await account.execute([
        {
          contractAddress: dojoConfig.buildingSystemAddress,
          entrypoint: 'finish_upgrade',
          calldata: [buildingId],
        },
      ])
      console.log('Upgrade finished on-chain')
    } catch (error) {
      console.error('Failed to finish upgrade:', error)
    }
  }, [account])

  // Redraw when dependencies change
  useEffect(() => {
    draw()
  }, [draw])

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedBuilding(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Get selected building data
  const selectedBuildingData = selectedBuilding !== null
    ? buildings.find((b) => b.buildingId === selectedBuilding)
    : null

  // Compute upgrade remaining for info panel
  const upgradeRemaining = selectedBuildingData?.isUpgrading
    ? getUpgradeRemaining(selectedBuildingData.upgradeFinishTime, now)
    : 0
  const upgradeReady = selectedBuildingData?.isUpgrading && upgradeRemaining <= 0

  return (
    <div style={styles.container}>
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={styles.canvas}
        onMouseMove={handleMouseMove}
        onClick={handleClick}
        onMouseLeave={handleMouseLeave}
      />

      {selectedBuildingData && (
        <div style={styles.buildingInfo}>
          <h4 style={{ margin: '0 0 8px 0' }}>
            {BUILDING_NAMES[selectedBuildingData.buildingType] || 'Unknown'}
          </h4>
          <p style={styles.stat}>Level: {selectedBuildingData.level}/{MAX_LEVELS[selectedBuildingData.buildingType] ?? 1}</p>
          <p style={styles.stat}>Health: {selectedBuildingData.health}</p>

          {/* Building stats */}
          {getBuildingStats(selectedBuildingData.buildingType, selectedBuildingData.level) && (
            <p style={{ ...styles.stat, color: '#4CAF50' }}>
              {getBuildingStats(selectedBuildingData.buildingType, selectedBuildingData.level)}
            </p>
          )}

          {/* Upgrading status with timer */}
          {selectedBuildingData.isUpgrading && (
            <div style={styles.upgradeSection}>
              <p style={{ ...styles.stat, color: '#FFA500', fontWeight: 'bold' }}>
                {upgradeReady ? 'Upgrade complete!' : `Upgrading... ${formatCountdown(upgradeRemaining)}`}
              </p>
              <button
                style={{
                  ...styles.upgradeBtn,
                  backgroundColor: upgradeReady ? '#27ae60' : '#555',
                  opacity: upgradeReady ? 1 : 0.5,
                  cursor: upgradeReady ? 'pointer' : 'not-allowed',
                }}
                onClick={() => upgradeReady && handleFinishUpgrade(selectedBuildingData.buildingId)}
                disabled={!upgradeReady}
              >
                {upgradeReady ? 'Finish Upgrade' : `${formatCountdown(upgradeRemaining)} remaining`}
              </button>
            </div>
          )}

          {/* Upgrade button */}
          {!selectedBuildingData.isUpgrading &&
            selectedBuildingData.level < (MAX_LEVELS[selectedBuildingData.buildingType] ?? 1) && (() => {
              const cost = getUpgradeCost(selectedBuildingData.buildingType, selectedBuildingData.level)
              const affordable = canAfford(cost.gold, cost.elixir)
              const nextStats = getBuildingStats(selectedBuildingData.buildingType, selectedBuildingData.level + 1)

              return (
                <div style={styles.upgradeSection}>
                  <div style={styles.upgradeCost}>
                    {cost.gold > 0 && <span style={{ color: '#FFD700' }}>{cost.gold} gold</span>}
                    {cost.elixir > 0 && <span style={{ color: '#DA70D6' }}>{cost.elixir} elixir</span>}
                  </div>
                  {nextStats && (
                    <p style={{ ...styles.stat, color: '#888', fontSize: '11px' }}>
                      Next: {nextStats}
                    </p>
                  )}
                  <button
                    style={{
                      ...styles.upgradeBtn,
                      opacity: affordable && !upgrading ? 1 : 0.5,
                      cursor: affordable && !upgrading ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => affordable && !upgrading && handleUpgrade(selectedBuildingData.buildingId)}
                    disabled={!affordable || upgrading}
                  >
                    {!affordable ? 'Not enough resources' : upgrading ? 'Upgrading...' : `Upgrade to L${selectedBuildingData.level + 1}`}
                  </button>
                </div>
              )
            })()}

          {/* Max level indicator */}
          {!selectedBuildingData.isUpgrading &&
            selectedBuildingData.level >= (MAX_LEVELS[selectedBuildingData.buildingType] ?? 1) && (
              <p style={{ ...styles.stat, color: '#FFD700', fontWeight: 'bold' }}>Max Level</p>
            )}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: '20px',
  },
  canvas: {
    border: '4px solid #0f3460',
    borderRadius: '8px',
    cursor: 'crosshair',
  },
  buildingInfo: {
    position: 'absolute',
    top: '30px',
    right: '30px',
    backgroundColor: 'rgba(22, 33, 62, 0.95)',
    padding: '16px',
    borderRadius: '8px',
    border: '2px solid #0f3460',
    minWidth: '180px',
  },
  stat: {
    margin: '4px 0',
    fontSize: '13px',
  },
  upgradeSection: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid #0f3460',
  },
  upgradeCost: {
    display: 'flex',
    gap: '8px',
    fontSize: '12px',
    fontWeight: 'bold',
    marginBottom: '4px',
  },
  upgradeBtn: {
    width: '100%',
    padding: '8px',
    backgroundColor: '#27ae60',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '12px',
    marginTop: '4px',
  },
}
