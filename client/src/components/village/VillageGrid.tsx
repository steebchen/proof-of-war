import { useRef, useEffect, useState, useCallback } from 'react'
import { useBuildings } from '../../hooks/useBuildings'
import { useResources } from '../../hooks/useResources'
import { useDojo, TrainingQueue } from '../../providers/DojoProvider'
import { useAccount } from '@starknet-react/core'
import { dojoConfig, BuildingType, TroopType, BUILDING_INFO, BUILDING_SPRITES, TROOP_INFO, NO_FEE_DETAILS, BUILD_TIMES } from '../../config/dojoConfig'
import {
  GRID_SIZE,
  HALF_W,
  HALF_H,
  ISO_CANVAS_W,
  ISO_CANVAS_H,
  BUILDING_SIZES,
  BUILDING_COLORS,
  BUILDING_NAMES,
  BUILDING_HEIGHTS,
} from '../../utils/constants'
import {
  gridToScreen,
  screenToGrid,
  darkenColor,
  drawIsoGrid,
  drawIsoBuilding,
} from '../../utils/isoRenderer'

// Max levels must match Cairo config
const MAX_LEVELS: Record<number, number> = {
  [BuildingType.TownHall]: 5,
  [BuildingType.DiamondMine]: 3,
  [BuildingType.GasCollector]: 3,
  [BuildingType.DiamondStorage]: 3,
  [BuildingType.GasStorage]: 3,
  [BuildingType.Barracks]: 3,
  [BuildingType.ArmyCamp]: 3,
  [BuildingType.Cannon]: 3,
  [BuildingType.ArcherTower]: 3,
  [BuildingType.Wall]: 3,
}

// Upgrade costs: base_cost * next_level (must match Cairo)
function getUpgradeCost(buildingType: number, currentLevel: number): { diamond: number; gas: number } {
  const info = BUILDING_INFO[buildingType as BuildingType]
  if (!info) return { diamond: 0, gas: 0 }
  const nextLevel = currentLevel + 1
  return {
    diamond: info.cost.diamond * nextLevel,
    gas: info.cost.gas * nextLevel,
  }
}

// Must match Cairo RESOURCE_PRODUCTION_PER_MIN
const RESOURCE_PRODUCTION_PER_MIN = 10

function getBuildingStats(buildingType: number, level: number): string {
  const perMin = RESOURCE_PRODUCTION_PER_MIN * level
  const perSec = (perMin / 60).toFixed(2)
  switch (buildingType) {
    case BuildingType.DiamondMine:
      return `${perSec} diamond/sec (${perMin}/min)`
    case BuildingType.GasCollector:
      return `${perSec} gas/sec (${perMin}/min)`
    case BuildingType.DiamondStorage:
      return `Stores ${1500 * level} diamond`
    case BuildingType.GasStorage:
      return `Stores ${1500 * level} gas`
    case BuildingType.TownHall:
      return `Stores ${1000 * level} each`
    case BuildingType.ArmyCamp:
      return `Troop capacity: ${20 * level}`
    case BuildingType.Barracks:
      return `Trains troops`
    case BuildingType.Cannon:
      return `DMG: ${8 + level * 2} | Range: 9 | Rate: 0.8/s`
    case BuildingType.ArcherTower:
      return `DMG: ${6 + level} | Range: 10 | Rate: 1.0/s`
    case BuildingType.Wall:
      return `Blocks troops`
    default:
      return ''
  }
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return 'Done!'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// Upgrade base times in seconds (must match Cairo config)
const UPGRADE_BASE_TIMES: Record<number, number> = {
  [BuildingType.TownHall]: 3600,
  [BuildingType.DiamondMine]: 300,
  [BuildingType.GasCollector]: 300,
  [BuildingType.DiamondStorage]: 600,
  [BuildingType.GasStorage]: 600,
  [BuildingType.Barracks]: 900,
  [BuildingType.ArmyCamp]: 600,
  [BuildingType.Cannon]: 900,
  [BuildingType.ArcherTower]: 900,
  [BuildingType.Wall]: 60,
}

function getUpgradeTime(buildingType: number, nextLevel: number): number {
  return (UPGRADE_BASE_TIMES[buildingType] ?? 300) * nextLevel
}

function getBuildTime(buildingType: number): number {
  return BUILD_TIMES[buildingType as keyof typeof BUILD_TIMES] ?? 3
}

// Worker training times (must match Cairo config)
const WORKER_TRAINING_COST = 150 // gas
function getWorkerTrainingTime(totalWorkers: number): number {
  switch (totalWorkers) {
    case 1: return 60        // 2nd worker: 1 min
    case 2: return 3600      // 3rd worker: 1 hour
    case 3: return 172800    // 4th worker: 2 days
    case 4: return 432000    // 5th worker: 5 days
    default: return 1296000  // fallback: 15 days
  }
}

function drawLabelWithBg(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
) {
  ctx.font = 'bold 9px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const metrics = ctx.measureText(text)
  const pw = metrics.width + 8
  const ph = 13
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
  ctx.beginPath()
  ctx.roundRect(x - pw / 2, y, pw, ph, 3)
  ctx.fill()
  ctx.fillStyle = color
  ctx.fillText(text, x, y + 2)
}

function getUpgradeRemaining(upgradeFinishTime: bigint, now: number): number {
  return Math.max(0, Number(upgradeFinishTime) - now)
}


export function VillageGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const {
    buildings,
    isPlacing,
    selectedBuildingType,
    placeBuilding,
    checkCollision,
    getBuildingAt,
    isMoving,
    movingBuildingId,
    startMoving,
    cancelMoving,
    moveBuilding,
  } = useBuildings()
  const { canAfford } = useResources()
  const { player, setPlayer, setBuildings, builderQueue, setBuilderQueue, trainingQueues, setTrainingQueues } = useDojo()
  const { account } = useAccount()
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null)
  const [selectedBuilding, setSelectedBuilding] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: ISO_CANVAS_W, h: ISO_CANVAS_H })
  const spritesRef = useRef<Record<number, HTMLImageElement>>({})
  const [spritesLoaded, setSpritesLoaded] = useState(false)

  // Camera zoom + pan
  const MIN_ZOOM = 0.5
  const MAX_ZOOM = 3.0
  const zoomRef = useRef(1.0)
  const panRef = useRef({ x: 0, y: 0 })
  const [camTick, setCamTick] = useState(0)
  const isDragging = useRef(false)
  const didDrag = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const dragPanStart = useRef({ x: 0, y: 0 })

  // Gesture tracking for wheel events (mouse wheel vs trackpad detection)
  const lastWheelTimeRef = useRef(0)
  const gestureModeRef = useRef<'zoom' | 'pan' | null>(null)
  const lastTrackpadTimeRef = useRef(0) // remembers when trackpad was last detected

  // Touch tracking for mobile drag/pinch
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const touchPanStartRef = useRef({ x: 0, y: 0 })
  const touchDidDragRef = useRef(false)
  const pinchStartDistRef = useRef(0)
  const pinchStartZoomRef = useRef(1.0)

  // Load building sprites
  useEffect(() => {
    const entries = Object.entries(BUILDING_SPRITES)
    let loaded = 0
    for (const [typeStr, path] of entries) {
      const img = new Image()
      img.src = path!
      img.onload = () => {
        spritesRef.current[Number(typeStr)] = img
        loaded++
        if (loaded === entries.length) setSpritesLoaded(true)
      }
    }
  }, [])

  // Track container size with ResizeObserver
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        setCanvasSize({ w: Math.round(width), h: Math.round(height) })
      }
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Compute scale + offset to fit logical viewport into actual canvas
  const getTransform = useCallback(() => {
    const baseScale = Math.min(canvasSize.w / ISO_CANVAS_W, canvasSize.h / ISO_CANVAS_H)
    const scale = baseScale * zoomRef.current
    const tx = (canvasSize.w - ISO_CANVAS_W * scale) / 2 + panRef.current.x
    const ty = (canvasSize.h - ISO_CANVAS_H * scale) / 2 + panRef.current.y
    return { scale, tx, ty }
  }, [canvasSize, camTick])

  // Convert client mouse coords to logical coords
  const clientToLogical = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    // Map CSS pixels to canvas pixels, then invert the transform
    const canvasX = (clientX - rect.left) * (canvas.width / rect.width) / dpr
    const canvasY = (clientY - rect.top) * (canvas.height / rect.height) / dpr
    const { scale, tx, ty } = getTransform()
    return {
      x: (canvasX - tx) / scale,
      y: (canvasY - ty) / scale,
    }
  }, [getTransform])

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

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasSize.w * dpr
    canvas.height = canvasSize.h * dpr

    // Clear
    ctx.resetTransform()
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Apply DPR scaling + fit transform
    const { scale, tx, ty } = getTransform()
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, tx * dpr, ty * dpr)

    // Fill logical viewport background (matches app background)
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, ISO_CANVAS_W, ISO_CANVAS_H)

    // Draw diamond grid
    drawIsoGrid(ctx)

    // Sort buildings back-to-front for painter's algorithm
    const sorted = [...buildings].sort((a, b) => (a.x + a.y) - (b.x + b.y))

    // Draw defense range circle for selected or placing defense buildings
    const DEFENSE_RANGES: Partial<Record<number, number>> = {
      [BuildingType.Cannon]: 9,
      [BuildingType.ArcherTower]: 10,
    }

    // Range for selected building
    if (selectedBuilding !== null) {
      const selB = buildings.find(b => b.buildingId === selectedBuilding)
      if (selB && DEFENSE_RANGES[selB.buildingType]) {
        const range = DEFENSE_RANGES[selB.buildingType]!
        const size = BUILDING_SIZES[selB.buildingType] || { width: 3, height: 3 }
        const centerX = selB.x + size.width / 2
        const centerY = selB.y + size.height / 2
        const center = gridToScreen(centerX, centerY)
        const radiusX = range * HALF_W
        const radiusY = range * HALF_H
        ctx.beginPath()
        ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(231, 76, 60, 0.08)'
        ctx.fill()
        ctx.strokeStyle = 'rgba(231, 76, 60, 0.4)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([6, 4])
        ctx.stroke()
        ctx.setLineDash([])
      }
    }

    // Range for building being placed
    if (isPlacing && mousePos && selectedBuildingType !== null && DEFENSE_RANGES[selectedBuildingType]) {
      const range = DEFENSE_RANGES[selectedBuildingType]!
      const size = BUILDING_SIZES[selectedBuildingType] || { width: 3, height: 3 }
      const { gx, gy } = screenToGrid(mousePos.x, mousePos.y)
      const snappedX = Math.round(gx)
      const snappedY = Math.round(gy)
      const centerX = snappedX + size.width / 2
      const centerY = snappedY + size.height / 2
      const center = gridToScreen(centerX, centerY)
      const radiusX = range * HALF_W
      const radiusY = range * HALF_H
      ctx.beginPath()
      ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(52, 152, 219, 0.08)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(52, 152, 219, 0.4)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([6, 4])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Draw buildings
    for (const building of sorted) {
      const isSelected = selectedBuilding === building.buildingId

      drawIsoBuilding(ctx, building, spritesRef.current, isSelected)

      // Upgrading overlay + countdown (village-specific)
      if (building.isUpgrading) {
        const size = BUILDING_SIZES[building.buildingType] || { width: 1, height: 1 }
        const bh = BUILDING_HEIGHTS[building.buildingType] ?? 14
        const topG = gridToScreen(building.x, building.y)
        const rightG = gridToScreen(building.x + size.width, building.y)
        const bottomG = gridToScreen(building.x + size.width, building.y + size.height)
        const leftG = gridToScreen(building.x, building.y + size.height)
        const topR = { x: topG.x, y: topG.y - bh }
        const rightR = { x: rightG.x, y: rightG.y - bh }
        const bottomR = { x: bottomG.x, y: bottomG.y - bh }
        const leftR = { x: leftG.x, y: leftG.y - bh }
        const topCenter = {
          x: (topR.x + rightR.x + bottomR.x + leftR.x) / 4,
          y: (topR.y + rightR.y + bottomR.y + leftR.y) / 4,
        }

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

        if (remaining > 0) {
          // Countdown text on top face
          drawLabelWithBg(ctx, formatCountdown(remaining), topCenter.x, topCenter.y + 6, '#fff')
        } else {
          // Ready indicator - green pulsing circle with checkmark above building
          const indicatorX = topCenter.x
          const indicatorY = topR.y - 12
          const pulse = 0.8 + 0.2 * Math.sin(now * 3) // pulsing effect
          const radius = 10 * pulse

          // Green circle background
          ctx.beginPath()
          ctx.arc(indicatorX, indicatorY, radius, 0, Math.PI * 2)
          ctx.fillStyle = '#27ae60'
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1.5
          ctx.stroke()

          // Checkmark
          ctx.beginPath()
          ctx.moveTo(indicatorX - 4, indicatorY)
          ctx.lineTo(indicatorX - 1, indicatorY + 3)
          ctx.lineTo(indicatorX + 5, indicatorY - 3)
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 2
          ctx.stroke()

          // "Ready!" text below the circle
          drawLabelWithBg(ctx, 'Ready!', topCenter.x, topCenter.y + 6, '#27ae60')
        }
      }
    }

    // Worker training indicator on Command Center (Town Hall)
    if (builderQueue?.isTraining) {
      const townHall = buildings.find(b => b.buildingType === BuildingType.TownHall)
      if (townHall) {
        const workerRemaining = getUpgradeRemaining(builderQueue.finishTime, now)
        const size = BUILDING_SIZES[BuildingType.TownHall] || { width: 4, height: 4 }
        const bh = BUILDING_HEIGHTS[BuildingType.TownHall] ?? 14
        const topG = gridToScreen(townHall.x, townHall.y)
        const rightG = gridToScreen(townHall.x + size.width, townHall.y)
        const bottomG = gridToScreen(townHall.x + size.width, townHall.y + size.height)
        const leftG = gridToScreen(townHall.x, townHall.y + size.height)
        const topR = { x: topG.x, y: topG.y - bh }
        const topCenter = {
          x: (topR.x + rightG.x - bh + bottomG.x - bh + leftG.x - bh) / 4,
          y: ((topG.y - bh) + (rightG.y - bh) + (bottomG.y - bh) + (leftG.y - bh)) / 4,
        }
        const indicatorX = topCenter.x
        const indicatorY = topR.y - 12

        if (workerRemaining <= 0) {
          // Ready - pulsing blue circle
          const pulse = 0.8 + 0.2 * Math.sin(now * 3)
          const radius = 10 * pulse

          ctx.beginPath()
          ctx.arc(indicatorX, indicatorY, radius, 0, Math.PI * 2)
          ctx.fillStyle = '#3498db'
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1.5
          ctx.stroke()

          ctx.fillStyle = '#fff'
          ctx.font = 'bold 10px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('W', indicatorX, indicatorY)

          drawLabelWithBg(ctx, 'Worker!', topCenter.x, topCenter.y + 6, '#3498db')
        } else {
          // In progress - orange circle with countdown
          const radius = 10

          ctx.beginPath()
          ctx.arc(indicatorX, indicatorY, radius, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255, 165, 0, 0.8)'
          ctx.fill()
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 1.5
          ctx.stroke()

          ctx.fillStyle = '#fff'
          ctx.font = 'bold 10px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('W', indicatorX, indicatorY)

          drawLabelWithBg(ctx, formatCountdown(workerRemaining), topCenter.x, topCenter.y + 6, '#FFA500')
        }
      }
    }

    // Troop training indicator on Barracks buildings
    for (const queue of trainingQueues) {
      if (queue.quantity <= 0) continue
      const barracks = buildings.find(b => b.buildingId === queue.barracksId && b.buildingType === BuildingType.Barracks)
      if (!barracks) continue

      const troopRemaining = getUpgradeRemaining(queue.finishTime, now)
      const size = BUILDING_SIZES[BuildingType.Barracks] || { width: 3, height: 3 }
      const bh = BUILDING_HEIGHTS[BuildingType.Barracks] ?? 14
      const topG = gridToScreen(barracks.x, barracks.y)
      const rightG = gridToScreen(barracks.x + size.width, barracks.y)
      const bottomG = gridToScreen(barracks.x + size.width, barracks.y + size.height)
      const leftG = gridToScreen(barracks.x, barracks.y + size.height)
      const topR = { x: topG.x, y: topG.y - bh }
      const topCenter = {
        x: (topR.x + rightG.x - bh + bottomG.x - bh + leftG.x - bh) / 4,
        y: ((topG.y - bh) + (rightG.y - bh) + (bottomG.y - bh) + (leftG.y - bh)) / 4,
      }
      const indicatorX = topCenter.x
      const indicatorY = topR.y - 12

      if (troopRemaining <= 0) {
        const pulse = 0.8 + 0.2 * Math.sin(now * 3)
        const radius = 10 * pulse
        ctx.beginPath()
        ctx.arc(indicatorX, indicatorY, radius, 0, Math.PI * 2)
        ctx.fillStyle = '#27ae60'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('T', indicatorX, indicatorY)
        drawLabelWithBg(ctx, `${queue.quantity}x Ready!`, topCenter.x, topCenter.y + 6, '#27ae60')
      } else {
        const radius = 10
        ctx.beginPath()
        ctx.arc(indicatorX, indicatorY, radius, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 165, 0, 0.8)'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.fillStyle = '#fff'
        ctx.font = 'bold 10px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('T', indicatorX, indicatorY)
        drawLabelWithBg(ctx, formatCountdown(troopRemaining), topCenter.x, topCenter.y + 6, '#FFA500')
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

      // Semi-transparent building sprite or box preview
      const sprite = spritesRef.current[selectedBuildingType]
      ctx.globalAlpha = 0.6

      if (sprite) {
        const diamondW = rightG.x - leftG.x
        const spriteW = diamondW
        const spriteH = spriteW
        const cx = (leftG.x + rightG.x) / 2
        const drawX = cx - spriteW / 2
        const drawY = bottomG.y - spriteH * 0.88
        ctx.drawImage(sprite, drawX, drawY, spriteW, spriteH)
      } else {
        const baseColor = BUILDING_COLORS[selectedBuildingType] || '#888'
        const bh = BUILDING_HEIGHTS[selectedBuildingType] ?? 14
        const topR = { x: topG.x, y: topG.y - bh }
        const rightR = { x: rightG.x, y: rightG.y - bh }
        const bottomR = { x: bottomG.x, y: bottomG.y - bh }
        const leftR = { x: leftG.x, y: leftG.y - bh }

        ctx.beginPath()
        ctx.moveTo(leftG.x, leftG.y)
        ctx.lineTo(bottomG.x, bottomG.y)
        ctx.lineTo(bottomR.x, bottomR.y)
        ctx.lineTo(leftR.x, leftR.y)
        ctx.closePath()
        ctx.fillStyle = darkenColor(baseColor, 0.3)
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(rightG.x, rightG.y)
        ctx.lineTo(bottomG.x, bottomG.y)
        ctx.lineTo(bottomR.x, bottomR.y)
        ctx.lineTo(rightR.x, rightR.y)
        ctx.closePath()
        ctx.fillStyle = darkenColor(baseColor, 0.5)
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(topR.x, topR.y)
        ctx.lineTo(rightR.x, rightR.y)
        ctx.lineTo(bottomR.x, bottomR.y)
        ctx.lineTo(leftR.x, leftR.y)
        ctx.closePath()
        ctx.fillStyle = baseColor
        ctx.fill()
      }

      ctx.globalAlpha = 1
    }

    // Draw move preview
    if (isMoving && movingBuildingId !== null && mousePos) {
      const movingBuilding = buildings.find(b => b.buildingId === movingBuildingId)
      if (movingBuilding) {
        const size = BUILDING_SIZES[movingBuilding.buildingType] || { width: 1, height: 1 }
        const { gx: gridX, gy: gridY } = screenToGrid(mousePos.x, mousePos.y)

        const outOfBounds = gridX < 0 || gridY < 0 ||
          gridX + size.width > GRID_SIZE || gridY + size.height > GRID_SIZE
        const hasCollision = checkCollision(gridX, gridY, size.width, size.height, movingBuildingId)
        const isValid = !outOfBounds && !hasCollision

        const previewColor = isValid ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)'

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

        const sprite = spritesRef.current[movingBuilding.buildingType]
        ctx.globalAlpha = 0.6

        if (sprite) {
          const diamondW = rightG.x - leftG.x
          const spriteW = diamondW
          const spriteH = spriteW
          const cx = (leftG.x + rightG.x) / 2
          const drawX = cx - spriteW / 2
          const drawY = bottomG.y - spriteH * 0.88
          ctx.drawImage(sprite, drawX, drawY, spriteW, spriteH)
        } else {
          const baseColor = BUILDING_COLORS[movingBuilding.buildingType] || '#888'
          const bh = BUILDING_HEIGHTS[movingBuilding.buildingType] ?? 14
          const topR = { x: topG.x, y: topG.y - bh }
          const rightR = { x: rightG.x, y: rightG.y - bh }
          const bottomR = { x: bottomG.x, y: bottomG.y - bh }
          const leftR = { x: leftG.x, y: leftG.y - bh }

          ctx.beginPath()
          ctx.moveTo(leftG.x, leftG.y)
          ctx.lineTo(bottomG.x, bottomG.y)
          ctx.lineTo(bottomR.x, bottomR.y)
          ctx.lineTo(leftR.x, leftR.y)
          ctx.closePath()
          ctx.fillStyle = darkenColor(baseColor, 0.3)
          ctx.fill()

          ctx.beginPath()
          ctx.moveTo(rightG.x, rightG.y)
          ctx.lineTo(bottomG.x, bottomG.y)
          ctx.lineTo(bottomR.x, bottomR.y)
          ctx.lineTo(rightR.x, rightR.y)
          ctx.closePath()
          ctx.fillStyle = darkenColor(baseColor, 0.5)
          ctx.fill()

          ctx.beginPath()
          ctx.moveTo(topR.x, topR.y)
          ctx.lineTo(rightR.x, rightR.y)
          ctx.lineTo(bottomR.x, bottomR.y)
          ctx.lineTo(leftR.x, leftR.y)
          ctx.closePath()
          ctx.fillStyle = baseColor
          ctx.fill()
        }

        ctx.globalAlpha = 1
      }
    }
  }, [buildings, isPlacing, isMoving, movingBuildingId, mousePos, selectedBuildingType, selectedBuilding, checkCollision, now, canvasSize, getTransform, spritesLoaded, camTick, builderQueue, trainingQueues])

  // Handle mouse down (start potential drag)
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true
    didDrag.current = false
    dragStart.current = { x: e.clientX, y: e.clientY }
    dragPanStart.current = { ...panRef.current }
  }, [])

  // Handle mouse move (drag to pan, or update placement preview)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging.current) {
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
        didDrag.current = true
        panRef.current = {
          x: dragPanStart.current.x + dx,
          y: dragPanStart.current.y + dy,
        }
        setCamTick((t) => t + 1)
      }
    }
    const pos = clientToLogical(e.clientX, e.clientY)
    setMousePos(pos)
  }, [clientToLogical])

  // Handle mouse up (end drag, fire click if didn't drag)
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = false
    if (!didDrag.current) {
      const pos = clientToLogical(e.clientX, e.clientY)
      const { gx: gridX, gy: gridY } = screenToGrid(pos.x, pos.y)
      if (isMoving && movingBuildingId !== null) {
        moveBuilding(gridX, gridY)
      } else if (isPlacing && selectedBuildingType !== null) {
        placeBuilding(gridX, gridY)
      } else {
        const building = getBuildingAt(gridX, gridY)
        setSelectedBuilding(building?.buildingId ?? null)
      }
    }
  }, [isPlacing, selectedBuildingType, placeBuilding, isMoving, movingBuildingId, moveBuilding, getBuildingAt, clientToLogical])

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setMousePos(null)
    isDragging.current = false
  }, [])

  const noFeeDetails = NO_FEE_DETAILS

  // Upgrade building on-chain with optimistic update
  const handleUpgrade = useCallback(async (buildingId: number) => {
    if (!account || pending) return
    setPending(true)

    // Optimistically mark the building as upgrading and consume a builder
    const prevBuildings = buildings
    const prevPlayer = player
    const building = buildings.find(b => b.buildingId === buildingId)
    if (building) {
      const nextLevel = building.level + 1
      const upgradeTime = getUpgradeTime(building.buildingType, nextLevel)
      const finishTime = BigInt(Math.floor(Date.now() / 1000) + upgradeTime)
      setBuildings(buildings.map(b =>
        b.buildingId === buildingId
          ? { ...b, isUpgrading: true, upgradeFinishTime: finishTime }
          : b
      ))
    }
    if (player && player.freeBuilders > 0) {
      setPlayer({ ...player, freeBuilders: player.freeBuilders - 1 })
    }

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.buildingSystemAddress,
          entrypoint: 'upgrade_building',
          calldata: [buildingId],
        },
      ], noFeeDetails)
      console.log('Upgrade started on-chain')
    } catch (error) {
      console.error('Failed to upgrade:', error)
      // Revert optimistic updates on failure
      setBuildings(prevBuildings)
      if (prevPlayer) setPlayer(prevPlayer)
    } finally {
      setPending(false)
    }
  }, [account, pending, buildings, player, setBuildings, setPlayer])

  // Finish upgrade on-chain with optimistic update
  const handleFinishUpgrade = useCallback(async (buildingId: number) => {
    if (!account || pending) return
    setPending(true)

    // Optimistically complete the upgrade and free the builder
    const prevBuildings = buildings
    const prevPlayer = player
    const building = buildings.find(b => b.buildingId === buildingId)
    if (building) {
      setBuildings(buildings.map(b =>
        b.buildingId === buildingId
          ? { ...b, isUpgrading: false, upgradeFinishTime: BigInt(0), level: b.level + 1 }
          : b
      ))
    }
    if (player) {
      setPlayer({ ...player, freeBuilders: player.freeBuilders + 1 })
    }

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.buildingSystemAddress,
          entrypoint: 'finish_upgrade',
          calldata: [buildingId],
        },
      ], noFeeDetails)
      console.log('Upgrade finished on-chain')
    } catch (error) {
      console.error('Failed to finish upgrade:', error)
      // Revert optimistic updates on failure
      setBuildings(prevBuildings)
      if (prevPlayer) setPlayer(prevPlayer)
    } finally {
      setPending(false)
    }
  }, [account, pending, buildings, player, setBuildings, setPlayer])

  // Train worker on-chain (at Command Center)
  const handleTrainWorker = useCallback(async () => {
    if (!account || pending || !player) return
    setPending(true)

    const trainingTime = getWorkerTrainingTime(player.totalBuilders)
    setBuilderQueue({ owner: account.address, isTraining: true, finishTime: BigInt(Math.floor(Date.now() / 1000) + trainingTime) })

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.trainingSystemAddress,
          entrypoint: 'train_worker',
          calldata: [],
        },
      ], noFeeDetails)
      console.log('Worker training started on-chain')
    } catch (error) {
      console.error('Failed to train worker:', error)
      setBuilderQueue(null)
    } finally {
      setPending(false)
    }
  }, [account, pending, player, setBuilderQueue])

  // Collect worker on-chain
  const handleCollectWorker = useCallback(async () => {
    if (!account || pending) return
    setPending(true)

    setBuilderQueue({ owner: account.address, isTraining: false, finishTime: BigInt(0) })

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.trainingSystemAddress,
          entrypoint: 'collect_worker',
          calldata: [],
        },
      ], noFeeDetails)
      console.log('Worker collected on-chain')
    } catch (error) {
      console.error('Failed to collect worker:', error)
    } finally {
      setPending(false)
    }
  }, [account, pending, setBuilderQueue])

  // Train troops on-chain (at Barracks)
  const handleTrainTroops = useCallback(async (barracksId: number, troopType: TroopType, quantity: number) => {
    if (!account || pending || !player) return
    setPending(true)

    const troopConfig = troopType === TroopType.Barbarian ? { time: 20 } : { time: 25 }
    const totalTime = troopConfig.time * quantity
    const optimisticQueue: TrainingQueue = {
      owner: account.address,
      barracksId,
      troopType,
      quantity,
      finishTime: BigInt(Math.floor(Date.now() / 1000) + totalTime),
    }
    setTrainingQueues([...trainingQueues.filter(q => q.barracksId !== barracksId), optimisticQueue])

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.trainingSystemAddress,
          entrypoint: 'train_troops',
          calldata: [barracksId, troopType, quantity],
        },
      ], noFeeDetails)
      console.log('Troop training started on-chain')
    } catch (error) {
      console.error('Failed to train troops:', error)
      setTrainingQueues(trainingQueues.filter(q => q.barracksId !== barracksId))
    } finally {
      setPending(false)
    }
  }, [account, pending, player, trainingQueues, setTrainingQueues])

  // Collect trained troops on-chain
  const handleCollectTroops = useCallback(async (barracksId: number) => {
    if (!account || pending) return
    setPending(true)

    setTrainingQueues(trainingQueues.filter(q => q.barracksId !== barracksId))

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.trainingSystemAddress,
          entrypoint: 'collect_trained_troops',
          calldata: [barracksId],
        },
      ], noFeeDetails)
      console.log('Troops collected on-chain')
    } catch (error) {
      console.error('Failed to collect troops:', error)
    } finally {
      setPending(false)
    }
  }, [account, pending, trainingQueues, setTrainingQueues])

  // Redraw when dependencies change
  useEffect(() => {
    draw()
  }, [draw])

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isMoving) {
          cancelMoving()
        }
        setSelectedBuilding(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMoving, cancelMoving])

  // Wheel handler: mouse wheel → zoom, trackpad two-finger → pan, trackpad pinch → zoom
  // Detection: default to zoom (preserves mouse wheel). If any event in a gesture
  // has deltaX≠0, lock to pan (mouse wheel never has horizontal delta, trackpad
  // almost always does). ctrlKey = trackpad pinch → zoom. Gesture resets after 200ms.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      const now = performance.now()
      const timeSinceLastEvent = now - lastWheelTimeRef.current
      lastWheelTimeRef.current = now

      // New gesture after 200ms gap
      if (timeSinceLastEvent > 200) {
        gestureModeRef.current = null
      }

      // Determine action for this event
      let action: 'zoom' | 'pan'

      if (e.ctrlKey) {
        // Trackpad pinch-to-zoom (all browsers set ctrlKey for pinch)
        action = 'zoom'
      } else if (e.deltaMode === 1) {
        // Firefox mouse wheel (DOM_DELTA_LINE)
        action = 'zoom'
      } else if (e.deltaX !== 0) {
        // Has horizontal component → trackpad; lock gesture to pan
        gestureModeRef.current = 'pan'
        lastTrackpadTimeRef.current = now
        action = 'pan'
      } else if (gestureModeRef.current === 'pan') {
        // Already identified as trackpad gesture from earlier deltaX
        action = 'pan'
      } else if (now - lastTrackpadTimeRef.current < 5000) {
        // Recently used trackpad — assume still on trackpad (catches pure-vertical scrolls)
        gestureModeRef.current = 'pan'
        action = 'pan'
      } else {
        // Default: zoom (mouse wheel or purely vertical input)
        action = 'zoom'
      }

      if (action === 'zoom') {
        // Zoom toward cursor
        const rect = canvas.getBoundingClientRect()
        const cursorX = e.clientX - rect.left
        const cursorY = e.clientY - rect.top

        const baseScale = Math.min(canvasSize.w / ISO_CANVAS_W, canvasSize.h / ISO_CANVAS_H)
        const oldZoom = zoomRef.current
        const oldScale = baseScale * oldZoom
        const oldTx = (canvasSize.w - ISO_CANVAS_W * oldScale) / 2 + panRef.current.x
        const oldTy = (canvasSize.h - ISO_CANVAS_H * oldScale) / 2 + panRef.current.y

        const logX = (cursorX - oldTx) / oldScale
        const logY = (cursorY - oldTy) / oldScale

        // Pinch: proportional for smooth feel; mouse wheel: fixed step per notch
        const zoomFactor = e.ctrlKey
          ? 1 - e.deltaY * 0.01
          : e.deltaY > 0 ? 0.9 : 1.1
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * zoomFactor))
        const newScale = baseScale * newZoom

        panRef.current = {
          x: cursorX - logX * newScale - (canvasSize.w - ISO_CANVAS_W * newScale) / 2,
          y: cursorY - logY * newScale - (canvasSize.h - ISO_CANVAS_H * newScale) / 2,
        }
        zoomRef.current = newZoom
        setCamTick((t) => t + 1)
      } else {
        // Pan using scroll deltas
        panRef.current = {
          x: panRef.current.x - e.deltaX,
          y: panRef.current.y - e.deltaY,
        }
        setCamTick((t) => t + 1)
      }
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [canvasSize])

  // Touch handlers for mobile drag-to-pan and pinch-to-zoom
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const getTouchDistance = (t1: Touch, t2: Touch) => {
      const dx = t1.clientX - t2.clientX
      const dy = t1.clientY - t2.clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const getTouchCenter = (t1: Touch, t2: Touch) => ({
      x: (t1.clientX + t2.clientX) / 2,
      y: (t1.clientY + t2.clientY) / 2,
    })

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1) {
        const t = e.touches[0]
        touchStartRef.current = { x: t.clientX, y: t.clientY }
        touchPanStartRef.current = { ...panRef.current }
        touchDidDragRef.current = false
      } else if (e.touches.length === 2) {
        // Pinch start
        pinchStartDistRef.current = getTouchDistance(e.touches[0], e.touches[1])
        pinchStartZoomRef.current = zoomRef.current
        touchDidDragRef.current = true // prevent tap on release
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && touchStartRef.current) {
        const t = e.touches[0]
        const dx = t.clientX - touchStartRef.current.x
        const dy = t.clientY - touchStartRef.current.y
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
          touchDidDragRef.current = true
          panRef.current = {
            x: touchPanStartRef.current.x + dx,
            y: touchPanStartRef.current.y + dy,
          }
          setCamTick((t) => t + 1)
        }
      } else if (e.touches.length === 2) {
        // Pinch zoom
        const dist = getTouchDistance(e.touches[0], e.touches[1])
        const center = getTouchCenter(e.touches[0], e.touches[1])
        const rect = canvas.getBoundingClientRect()
        const cursorX = center.x - rect.left
        const cursorY = center.y - rect.top

        const baseScale = Math.min(canvasSize.w / ISO_CANVAS_W, canvasSize.h / ISO_CANVAS_H)
        const oldZoom = zoomRef.current
        const oldScale = baseScale * oldZoom
        const oldTx = (canvasSize.w - ISO_CANVAS_W * oldScale) / 2 + panRef.current.x
        const oldTy = (canvasSize.h - ISO_CANVAS_H * oldScale) / 2 + panRef.current.y

        const logX = (cursorX - oldTx) / oldScale
        const logY = (cursorY - oldTy) / oldScale

        const scale = dist / pinchStartDistRef.current
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchStartZoomRef.current * scale))
        const newScale = baseScale * newZoom

        panRef.current = {
          x: cursorX - logX * newScale - (canvasSize.w - ISO_CANVAS_W * newScale) / 2,
          y: cursorY - logY * newScale - (canvasSize.h - ISO_CANVAS_H * newScale) / 2,
        }
        zoomRef.current = newZoom
        setCamTick((t) => t + 1)
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0 && !touchDidDragRef.current && touchStartRef.current) {
        // Single tap — treat as click
        const pos = clientToLogical(touchStartRef.current.x, touchStartRef.current.y)
        const { gx: gridX, gy: gridY } = screenToGrid(pos.x, pos.y)
        if (isMoving && movingBuildingId !== null) {
          moveBuilding(gridX, gridY)
        } else if (isPlacing && selectedBuildingType !== null) {
          placeBuilding(gridX, gridY)
        } else {
          const building = getBuildingAt(gridX, gridY)
          setSelectedBuilding(building?.buildingId ?? null)
        }
      }
      touchStartRef.current = null
    }

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd)

    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
    }
  }, [canvasSize, isPlacing, selectedBuildingType, placeBuilding, getBuildingAt, clientToLogical])

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
    <div ref={containerRef} style={styles.container}>
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      />

      {selectedBuildingData && (
        <div style={styles.buildingInfo}>
          <h4 style={{ margin: '0 0 8px 0' }}>
            {BUILDING_NAMES[selectedBuildingData.buildingType] || 'Unknown'}
          </h4>
          <p style={styles.stat}>Level: {selectedBuildingData.level}/{MAX_LEVELS[selectedBuildingData.buildingType] ?? 1}</p>
          <p style={styles.stat}>Health: {selectedBuildingData.health}</p>
          {player && (
            <p style={{ ...styles.stat, color: (player.freeBuilders > 0) ? '#4CAF50' : '#FF5722' }}>
              Workers: {player.freeBuilders}/{player.totalBuilders}
            </p>
          )}

          {/* Building stats */}
          {getBuildingStats(selectedBuildingData.buildingType, selectedBuildingData.level) && (
            <p style={{ ...styles.stat, color: '#4CAF50' }}>
              {getBuildingStats(selectedBuildingData.buildingType, selectedBuildingData.level)}
            </p>
          )}

          {/* Upgrading/Building status with timer */}
          {selectedBuildingData.isUpgrading && (() => {
            const isConstruction = selectedBuildingData.level === 0
            const totalTime = isConstruction
              ? getBuildTime(selectedBuildingData.buildingType)
              : getUpgradeTime(selectedBuildingData.buildingType, selectedBuildingData.level + 1)
            const upgradeProgress = totalTime > 0 ? Math.min(1, Math.max(0, (totalTime - upgradeRemaining) / totalTime)) : 0
            const statusText = isConstruction ? 'Building' : 'Upgrading'
            return (
            <div style={styles.upgradeSection}>
              <p style={{ ...styles.stat, color: '#FFA500', fontWeight: 'bold' }}>
                {upgradeReady ? (isConstruction ? 'Construction complete!' : 'Upgrade complete!') : `${statusText}... ${formatCountdown(upgradeRemaining)}`}
              </p>
              {!upgradeReady && (
                <div style={styles.progressBarBg}>
                  <div style={{ ...styles.progressBarFill, width: `${upgradeProgress * 100}%` }} />
                </div>
              )}
              <button
                style={{
                  ...styles.upgradeBtn,
                  backgroundColor: upgradeReady && !pending ? '#27ae60' : '#555',
                  opacity: upgradeReady && !pending ? 1 : 0.5,
                  cursor: upgradeReady && !pending ? 'pointer' : 'not-allowed',
                }}
                onClick={() => upgradeReady && !pending && handleFinishUpgrade(selectedBuildingData.buildingId)}
                disabled={!upgradeReady || pending}
              >
                {pending ? 'Finishing...' : upgradeReady ? (isConstruction ? 'Finish Building' : 'Finish Upgrade') : `${formatCountdown(upgradeRemaining)} remaining`}
              </button>
            </div>
            )
          })()}

          {/* Upgrade button */}
          {!selectedBuildingData.isUpgrading &&
            selectedBuildingData.level < (MAX_LEVELS[selectedBuildingData.buildingType] ?? 1) && (() => {
              const cost = getUpgradeCost(selectedBuildingData.buildingType, selectedBuildingData.level)
              const affordable = canAfford(cost.diamond, cost.gas)
              const hasBuilder = (player?.freeBuilders ?? 0) > 0
              const canUpgrade = affordable && hasBuilder
              const nextStats = getBuildingStats(selectedBuildingData.buildingType, selectedBuildingData.level + 1)
              const upgradeDuration = getUpgradeTime(selectedBuildingData.buildingType, selectedBuildingData.level + 1)

              return (
                <div style={styles.upgradeSection}>
                  <div style={styles.upgradeCost}>
                    {cost.diamond > 0 && <span style={{ color: '#FFD700' }}>{cost.diamond} diamond</span>}
                    {cost.gas > 0 && <span style={{ color: '#DA70D6' }}>{cost.gas} gas</span>}
                  </div>
                  <p style={{ ...styles.stat, color: '#888', fontSize: '11px' }}>
                    Duration: {formatCountdown(upgradeDuration)}
                  </p>
                  {nextStats && (
                    <p style={{ ...styles.stat, color: '#888', fontSize: '11px' }}>
                      Next: {nextStats}
                    </p>
                  )}
                  <button
                    style={{
                      ...styles.upgradeBtn,
                      opacity: canUpgrade && !pending ? 1 : 0.5,
                      cursor: canUpgrade && !pending ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => canUpgrade && !pending && handleUpgrade(selectedBuildingData.buildingId)}
                    disabled={!canUpgrade || pending}
                  >
                    {!hasBuilder ? 'No free workers' : !affordable ? 'Not enough resources' : pending ? 'Sending...' : `Upgrade to L${selectedBuildingData.level + 1}`}
                  </button>
                </div>
              )
            })()}

          {/* Max level indicator */}
          {!selectedBuildingData.isUpgrading &&
            selectedBuildingData.level >= (MAX_LEVELS[selectedBuildingData.buildingType] ?? 1) && (
              <p style={{ ...styles.stat, color: '#FFD700', fontWeight: 'bold' }}>Max Level</p>
            )}

          {/* Command Center worker training UI */}
          {selectedBuildingData.buildingType === BuildingType.TownHall &&
            !selectedBuildingData.isUpgrading && player && (() => {
              const maxWorkers = 5
              const canTrain = player.totalBuilders < maxWorkers
              const isTraining = builderQueue?.isTraining ?? false
              const trainingFinishTime = builderQueue?.finishTime ?? BigInt(0)
              const trainingRemaining = isTraining ? getUpgradeRemaining(trainingFinishTime, now) : 0
              const trainingReady = isTraining && trainingRemaining <= 0
              const canAffordWorker = (player.gas ?? BigInt(0)) >= BigInt(WORKER_TRAINING_COST)
              const nextTrainingTime = getWorkerTrainingTime(player.totalBuilders)

              return (
                <div style={styles.upgradeSection}>
                  <p style={{ ...styles.stat, fontWeight: 'bold' }}>
                    Workers: {player.totalBuilders}/{maxWorkers}
                  </p>

                  {isTraining && !trainingReady && (() => {
                    const totalTime = getWorkerTrainingTime(player.totalBuilders - 1)
                    const progress = totalTime > 0 ? Math.min(1, Math.max(0, (totalTime - trainingRemaining) / totalTime)) : 0
                    return (
                      <div>
                        <p style={{ ...styles.stat, color: '#FFA500' }}>
                          Training worker... {formatCountdown(trainingRemaining)}
                        </p>
                        <div style={styles.progressBarBg}>
                          <div style={{ ...styles.progressBarFill, width: `${progress * 100}%` }} />
                        </div>
                      </div>
                    )
                  })()}

                  {trainingReady && (
                    <button
                      style={{ ...styles.upgradeBtn, backgroundColor: '#27ae60' }}
                      onClick={() => handleCollectWorker()}
                      disabled={pending}
                    >
                      {pending ? 'Collecting...' : 'Collect Worker'}
                    </button>
                  )}

                  {!isTraining && canTrain && (
                    <button
                      style={{
                        ...styles.upgradeBtn,
                        opacity: canAffordWorker && !pending ? 1 : 0.5,
                        cursor: canAffordWorker && !pending ? 'pointer' : 'not-allowed',
                      }}
                      onClick={() => canAffordWorker && !pending && handleTrainWorker()}
                      disabled={!canAffordWorker || pending}
                    >
                      {!canAffordWorker ? 'Not enough gas' : pending ? 'Sending...' : `Train Worker (${WORKER_TRAINING_COST} gas, ${formatCountdown(nextTrainingTime)})`}
                    </button>
                  )}

                  {!isTraining && !canTrain && (
                    <p style={{ ...styles.stat, color: '#FFD700' }}>All worker slots filled</p>
                  )}
                </div>
              )
            })()}

          {/* Barracks troop training UI */}
          {selectedBuildingData.buildingType === BuildingType.Barracks &&
            selectedBuildingData.level > 0 &&
            !selectedBuildingData.isUpgrading && player && (() => {
              const barracksId = selectedBuildingData.buildingId
              const queue = trainingQueues.find(q => q.barracksId === barracksId)
              const isTraining = queue && queue.quantity > 0
              const trainingRemaining = isTraining ? getUpgradeRemaining(queue.finishTime, now) : 0
              const trainingReady = isTraining && trainingRemaining <= 0

              return (
                <div style={styles.upgradeSection}>
                  <p style={{ ...styles.stat, fontWeight: 'bold' }}>Troop Training</p>

                  {isTraining && !trainingReady && (() => {
                    const troopName = TROOP_INFO[queue.troopType as TroopType]?.name || 'Troops'
                    const troopTime = queue.troopType === TroopType.Barbarian ? 20 : 25
                    const totalTime = troopTime * queue.quantity
                    const progress = totalTime > 0 ? Math.min(1, Math.max(0, (totalTime - trainingRemaining) / totalTime)) : 0
                    return (
                      <div>
                        <p style={{ ...styles.stat, color: '#FFA500' }}>
                          Training {queue.quantity}x {troopName}... {formatCountdown(trainingRemaining)}
                        </p>
                        <div style={styles.progressBarBg}>
                          <div style={{ ...styles.progressBarFill, width: `${progress * 100}%` }} />
                        </div>
                      </div>
                    )
                  })()}

                  {trainingReady && queue && (
                    <div>
                      <p style={{ ...styles.stat, color: '#27ae60' }}>
                        {queue.quantity}x {TROOP_INFO[queue.troopType as TroopType]?.name || 'Troops'} ready!
                      </p>
                      <button
                        style={{ ...styles.upgradeBtn, backgroundColor: '#27ae60' }}
                        onClick={() => handleCollectTroops(barracksId)}
                        disabled={pending}
                      >
                        {pending ? 'Collecting...' : 'Collect Troops'}
                      </button>
                    </div>
                  )}

                  {!isTraining && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {Object.entries(TROOP_INFO).map(([typeStr, info]) => {
                        const troopType = Number(typeStr) as TroopType
                        const costPerUnit = info.cost
                        const quantity = 5
                        const totalCost = costPerUnit * quantity
                        const canAfford = Number(player.gas) >= totalCost
                        return (
                          <button
                            key={typeStr}
                            style={{
                              ...styles.upgradeBtn,
                              opacity: canAfford && !pending ? 1 : 0.5,
                              cursor: canAfford && !pending ? 'pointer' : 'not-allowed',
                            }}
                            onClick={() => canAfford && !pending && handleTrainTroops(barracksId, troopType, quantity)}
                            disabled={!canAfford || pending}
                          >
                            {!canAfford ? `Not enough gas` : pending ? 'Sending...' : `Train 5x ${info.name} (${totalCost} gas)`}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })()}

          {/* Move button - only for fully built, non-upgrading buildings (except TownHall) */}
          {selectedBuildingData.level > 0 && !selectedBuildingData.isUpgrading &&
            selectedBuildingData.buildingType !== BuildingType.TownHall && (
              <button
                style={styles.moveBtn}
                onClick={() => {
                  startMoving(selectedBuildingData.buildingId)
                  setSelectedBuilding(null)
                }}
              >
                Move Building
              </button>
            )}
        </div>
      )}

      {/* Moving indicator */}
      {isMoving && (
        <div style={styles.movingIndicator}>
          <span>Moving building — click to place</span>
          <button style={styles.cancelMoveBtn} onClick={cancelMoving}>
            Cancel (ESC)
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
    cursor: 'crosshair',
  },
  buildingInfo: {
    position: 'absolute',
    top: '16px',
    right: '16px',
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
  progressBarBg: {
    width: '100%',
    height: '6px',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: '3px',
    marginTop: '4px',
    marginBottom: '4px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFA500',
    borderRadius: '3px',
    transition: 'width 1s linear',
  },
  moveBtn: {
    width: '100%',
    padding: '8px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '12px',
    marginTop: '8px',
  },
  movingIndicator: {
    position: 'absolute',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#3498db',
    padding: '8px 16px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    color: '#fff',
    fontWeight: 'bold',
    zIndex: 10,
  },
  cancelMoveBtn: {
    padding: '4px 8px',
    backgroundColor: 'rgba(255,255,255,0.2)',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
  },
}
