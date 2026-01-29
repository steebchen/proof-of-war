import { useRef, useEffect, useState, useCallback } from 'react'
import { useBuildings } from '../../hooks/useBuildings'
import {
  GRID_SIZE,
  TILE_SIZE,
  CANVAS_SIZE,
  COLORS,
  BUILDING_SIZES,
  BUILDING_COLORS,
  BUILDING_NAMES,
} from '../../utils/constants'

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
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null)

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

      // Building fill
      ctx.fillStyle = color
      ctx.fillRect(
        building.x * TILE_SIZE + 1,
        building.y * TILE_SIZE + 1,
        size.width * TILE_SIZE - 2,
        size.height * TILE_SIZE - 2
      )

      // Building border
      ctx.strokeStyle = isSelected ? '#fff' : 'rgba(0,0,0,0.3)'
      ctx.lineWidth = isSelected ? 3 : 1
      ctx.strokeRect(
        building.x * TILE_SIZE + 1,
        building.y * TILE_SIZE + 1,
        size.width * TILE_SIZE - 2,
        size.height * TILE_SIZE - 2
      )

      // Building level text
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(
        `L${building.level}`,
        building.x * TILE_SIZE + (size.width * TILE_SIZE) / 2,
        building.y * TILE_SIZE + (size.height * TILE_SIZE) / 2
      )

      // Upgrading indicator
      if (building.isUpgrading) {
        ctx.fillStyle = 'rgba(255, 165, 0, 0.5)'
        ctx.fillRect(
          building.x * TILE_SIZE + 1,
          building.y * TILE_SIZE + 1,
          size.width * TILE_SIZE - 2,
          size.height * TILE_SIZE - 2
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
  }, [buildings, isPlacing, mousePos, selectedBuildingType, selectedBuilding, checkCollision])

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

      {selectedBuilding !== null && (
        <div style={styles.buildingInfo}>
          {(() => {
            const building = buildings.find((b) => b.buildingId === selectedBuilding)
            if (!building) return null
            return (
              <>
                <h4>{BUILDING_NAMES[building.buildingType] || 'Unknown'}</h4>
                <p>Level: {building.level}</p>
                <p>Health: {building.health}</p>
                {building.isUpgrading && <p style={{ color: '#FFA500' }}>Upgrading...</p>}
              </>
            )
          })()}
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
    minWidth: '150px',
  },
}
