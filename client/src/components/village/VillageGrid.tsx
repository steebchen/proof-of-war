import { useRef, useEffect, useState, useCallback } from 'react'
import { useBuildings } from '../../hooks/useBuildings'
import { useResources } from '../../hooks/useResources'
import { useAccount } from '@starknet-react/core'
import { dojoConfig, BuildingType, BUILDING_INFO } from '../../config/dojoConfig'
import {
  GRID_SIZE,
  HALF_W,
  HALF_H,
  ISO_CANVAS_W,
  ISO_CANVAS_H,
  TOP_PADDING,
  COLORS,
  BUILDING_SIZES,
  BUILDING_COLORS,
  BUILDING_NAMES,
  BUILDING_HEIGHTS,
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

// --- Isometric helpers ---

function gridToScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * HALF_W + ISO_CANVAS_W / 2,
    y: (gx + gy) * HALF_H + TOP_PADDING,
  }
}

function screenToGrid(sx: number, sy: number): { gx: number; gy: number } {
  const dx = sx - ISO_CANVAS_W / 2
  const dy = sy - TOP_PADDING
  return {
    gx: Math.floor((dx / HALF_W + dy / HALF_H) / 2),
    gy: Math.floor((dy / HALF_H - dx / HALF_W) / 2),
  }
}

function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const dr = Math.round(r * (1 - factor))
  const dg = Math.round(g * (1 - factor))
  const db = Math.round(b * (1 - factor))
  return `rgb(${dr},${dg},${db})`
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

  // Draw the isometric grid
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear canvas
    ctx.fillStyle = '#1a3a1a'
    ctx.fillRect(0, 0, ISO_CANVAS_W, ISO_CANVAS_H)

    // Draw diamond grid
    ctx.strokeStyle = COLORS.gridLine
    ctx.lineWidth = 0.5
    for (let gy = 0; gy <= GRID_SIZE; gy++) {
      const start = gridToScreen(0, gy)
      const end = gridToScreen(GRID_SIZE, gy)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
    }
    for (let gx = 0; gx <= GRID_SIZE; gx++) {
      const start = gridToScreen(gx, 0)
      const end = gridToScreen(gx, GRID_SIZE)
      ctx.beginPath()
      ctx.moveTo(start.x, start.y)
      ctx.lineTo(end.x, end.y)
      ctx.stroke()
    }

    // Sort buildings back-to-front for painter's algorithm
    const sorted = [...buildings].sort((a, b) => (a.x + a.y) - (b.x + b.y))

    // Draw buildings as 3D isometric boxes
    for (const building of sorted) {
      const size = BUILDING_SIZES[building.buildingType] || { width: 1, height: 1 }
      const baseColor = BUILDING_COLORS[building.buildingType] || '#888'
      const bh = BUILDING_HEIGHTS[building.buildingType] ?? 14
      const isSelected = selectedBuilding === building.buildingId

      const gx = building.x
      const gy = building.y
      const w = size.width
      const h = size.height

      // Ground-plane corners
      const topG = gridToScreen(gx, gy)
      const rightG = gridToScreen(gx + w, gy)
      const bottomG = gridToScreen(gx + w, gy + h)
      const leftG = gridToScreen(gx, gy + h)

      // Roof corners (shifted up by building height)
      const topR = { x: topG.x, y: topG.y - bh }
      const rightR = { x: rightG.x, y: rightG.y - bh }
      const bottomR = { x: bottomG.x, y: bottomG.y - bh }
      const leftR = { x: leftG.x, y: leftG.y - bh }

      // Left face (medium shade - 30% darker)
      ctx.beginPath()
      ctx.moveTo(leftG.x, leftG.y)
      ctx.lineTo(bottomG.x, bottomG.y)
      ctx.lineTo(bottomR.x, bottomR.y)
      ctx.lineTo(leftR.x, leftR.y)
      ctx.closePath()
      ctx.fillStyle = darkenColor(baseColor, 0.3)
      ctx.fill()

      // Right face (dark shade - 50% darker)
      ctx.beginPath()
      ctx.moveTo(rightG.x, rightG.y)
      ctx.lineTo(bottomG.x, bottomG.y)
      ctx.lineTo(bottomR.x, bottomR.y)
      ctx.lineTo(rightR.x, rightR.y)
      ctx.closePath()
      ctx.fillStyle = darkenColor(baseColor, 0.5)
      ctx.fill()

      // Top face (base color)
      ctx.beginPath()
      ctx.moveTo(topR.x, topR.y)
      ctx.lineTo(rightR.x, rightR.y)
      ctx.lineTo(bottomR.x, bottomR.y)
      ctx.lineTo(leftR.x, leftR.y)
      ctx.closePath()
      ctx.fillStyle = baseColor
      ctx.fill()

      // Selection border on all 3 faces
      if (isSelected) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2

        // Left face outline
        ctx.beginPath()
        ctx.moveTo(leftG.x, leftG.y)
        ctx.lineTo(bottomG.x, bottomG.y)
        ctx.lineTo(bottomR.x, bottomR.y)
        ctx.lineTo(leftR.x, leftR.y)
        ctx.closePath()
        ctx.stroke()

        // Right face outline
        ctx.beginPath()
        ctx.moveTo(rightG.x, rightG.y)
        ctx.lineTo(bottomG.x, bottomG.y)
        ctx.lineTo(bottomR.x, bottomR.y)
        ctx.lineTo(rightR.x, rightR.y)
        ctx.closePath()
        ctx.stroke()

        // Top face outline
        ctx.beginPath()
        ctx.moveTo(topR.x, topR.y)
        ctx.lineTo(rightR.x, rightR.y)
        ctx.lineTo(bottomR.x, bottomR.y)
        ctx.lineTo(leftR.x, leftR.y)
        ctx.closePath()
        ctx.stroke()
      }

      // Level text on top face
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const topCenter = {
        x: (topR.x + rightR.x + bottomR.x + leftR.x) / 4,
        y: (topR.y + rightR.y + bottomR.y + leftR.y) / 4,
      }
      ctx.fillText(`L${building.level}`, topCenter.x, topCenter.y)

      // Upgrading overlay + countdown
      if (building.isUpgrading) {
        const remaining = getUpgradeRemaining(building.upgradeFinishTime, now)

        // Orange overlay on top face
        ctx.beginPath()
        ctx.moveTo(topR.x, topR.y)
        ctx.lineTo(rightR.x, rightR.y)
        ctx.lineTo(bottomR.x, bottomR.y)
        ctx.lineTo(leftR.x, leftR.y)
        ctx.closePath()
        ctx.fillStyle = 'rgba(255, 165, 0, 0.5)'
        ctx.fill()

        // Countdown text on top face
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 9px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(
          remaining > 0 ? formatCountdown(remaining) : 'Ready!',
          topCenter.x,
          topCenter.y + 10
        )
      }
    }

    // Draw placement preview
    if (isPlacing && mousePos && selectedBuildingType !== null) {
      const size = BUILDING_SIZES[selectedBuildingType] || { width: 1, height: 1 }
      const { gx: gridX, gy: gridY } = screenToGrid(mousePos.x, mousePos.y)

      // Check if placement is valid
      const outOfBounds = gridX < 0 || gridY < 0 ||
        gridX + size.width > GRID_SIZE || gridY + size.height > GRID_SIZE
      const hasCollision = checkCollision(gridX, gridY, size.width, size.height)
      const isValid = !outOfBounds && !hasCollision

      const previewColor = isValid ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)'

      // Ghost diamond footprint
      const topG = gridToScreen(gridX, gridY)
      const rightG = gridToScreen(gridX + size.width, gridY)
      const bottomG = gridToScreen(gridX + size.width, gridY + size.height)
      const leftG = gridToScreen(gridX, gridY + size.height)

      ctx.beginPath()
      ctx.moveTo(topG.x, topG.y)
      ctx.lineTo(rightG.x, rightG.y)
      ctx.lineTo(bottomG.x, bottomG.y)
      ctx.lineTo(leftG.x, leftG.y)
      ctx.closePath()
      ctx.fillStyle = previewColor
      ctx.fill()

      // Semi-transparent building box preview
      const baseColor = BUILDING_COLORS[selectedBuildingType] || '#888'
      const bh = BUILDING_HEIGHTS[selectedBuildingType] ?? 14

      const topR = { x: topG.x, y: topG.y - bh }
      const rightR = { x: rightG.x, y: rightG.y - bh }
      const bottomR = { x: bottomG.x, y: bottomG.y - bh }
      const leftR = { x: leftG.x, y: leftG.y - bh }

      ctx.globalAlpha = 0.5

      // Left face
      ctx.beginPath()
      ctx.moveTo(leftG.x, leftG.y)
      ctx.lineTo(bottomG.x, bottomG.y)
      ctx.lineTo(bottomR.x, bottomR.y)
      ctx.lineTo(leftR.x, leftR.y)
      ctx.closePath()
      ctx.fillStyle = darkenColor(baseColor, 0.3)
      ctx.fill()

      // Right face
      ctx.beginPath()
      ctx.moveTo(rightG.x, rightG.y)
      ctx.lineTo(bottomG.x, bottomG.y)
      ctx.lineTo(bottomR.x, bottomR.y)
      ctx.lineTo(rightR.x, rightR.y)
      ctx.closePath()
      ctx.fillStyle = darkenColor(baseColor, 0.5)
      ctx.fill()

      // Top face
      ctx.beginPath()
      ctx.moveTo(topR.x, topR.y)
      ctx.lineTo(rightR.x, rightR.y)
      ctx.lineTo(bottomR.x, bottomR.y)
      ctx.lineTo(leftR.x, leftR.y)
      ctx.closePath()
      ctx.fillStyle = baseColor
      ctx.fill()

      ctx.globalAlpha = 1
    }
  }, [buildings, isPlacing, mousePos, selectedBuildingType, selectedBuilding, checkCollision, now])

  // Handle mouse move
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = ISO_CANVAS_W / rect.width
    const scaleY = ISO_CANVAS_H / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY

    setMousePos({ x, y })
  }, [])

  // Handle click
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const scaleX = ISO_CANVAS_W / rect.width
    const scaleY = ISO_CANVAS_H / rect.height
    const x = (e.clientX - rect.left) * scaleX
    const y = (e.clientY - rect.top) * scaleY
    const { gx: gridX, gy: gridY } = screenToGrid(x, y)

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
        width={ISO_CANVAS_W}
        height={ISO_CANVAS_H}
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
    maxWidth: '100%',
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
