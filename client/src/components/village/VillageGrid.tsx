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

// Buffer (seconds) to account for client clock being ahead of on-chain block timestamp
const UPGRADE_BUFFER = 5

function getUpgradeRemaining(upgradeFinishTime: bigint, now: number): number {
  const finish = Number(upgradeFinishTime) + UPGRADE_BUFFER
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

// Building sprite map (building type → image path in public/)
const BUILDING_SPRITES: Partial<Record<number, string>> = {
  [BuildingType.DiamondMine]: '/buildings/diamond-refinery.png',
  [BuildingType.DiamondStorage]: '/buildings/diamond-storage.png',
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
  const containerRef = useRef<HTMLDivElement>(null)
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
  const [pending, setPending] = useState(false)
  const [now, setNow] = useState(Math.floor(Date.now() / 1000))
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: ISO_CANVAS_W, h: ISO_CANVAS_H })
  const spritesRef = useRef<Record<number, HTMLImageElement>>({})
  const [spritesLoaded, setSpritesLoaded] = useState(false)

  // Camera: zoom + pan
  const MIN_ZOOM = 0.5
  const MAX_ZOOM = 3.0
  const zoomRef = useRef(1.0)
  const panRef = useRef({ x: 0, y: 0 })
  const [camTick, setCamTick] = useState(0) // trigger redraws on camera change
  const isDragging = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const dragPanStart = useRef({ x: 0, y: 0 })
  const pinchStartDist = useRef(0)
  const pinchStartZoom = useRef(1.0)

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

  // Compute scale + offset to fit logical viewport into actual canvas (includes zoom + pan)
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

    // Draw buildings as 3D isometric boxes or sprites
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

      const sprite = spritesRef.current[building.buildingType]

      // Grid footprint hint for all buildings
      ctx.beginPath()
      ctx.moveTo(topG.x, topG.y)
      ctx.lineTo(rightG.x, rightG.y)
      ctx.lineTo(bottomG.x, bottomG.y)
      ctx.lineTo(leftG.x, leftG.y)
      ctx.closePath()
      ctx.fillStyle = isSelected ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.25)'
      ctx.fill()
      ctx.strokeStyle = isSelected ? 'rgba(255, 255, 255, 0.5)' : 'rgba(255, 255, 255, 0.1)'
      ctx.lineWidth = 1
      ctx.stroke()

      if (sprite) {
        // Draw sprite image
        const diamondW = rightG.x - leftG.x
        const spriteScale = 1.0
        const spriteW = diamondW * spriteScale
        const spriteH = spriteW
        const cx = (leftG.x + rightG.x) / 2
        const drawX = cx - spriteW / 2
        const drawY = bottomG.y - spriteH * 0.88

        ctx.drawImage(sprite, drawX, drawY, spriteW, spriteH)
      } else {
        // 3D box rendering

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

          ctx.beginPath()
          ctx.moveTo(leftG.x, leftG.y)
          ctx.lineTo(bottomG.x, bottomG.y)
          ctx.lineTo(bottomR.x, bottomR.y)
          ctx.lineTo(leftR.x, leftR.y)
          ctx.closePath()
          ctx.stroke()

          ctx.beginPath()
          ctx.moveTo(rightG.x, rightG.y)
          ctx.lineTo(bottomG.x, bottomG.y)
          ctx.lineTo(bottomR.x, bottomR.y)
          ctx.lineTo(rightR.x, rightR.y)
          ctx.closePath()
          ctx.stroke()

          ctx.beginPath()
          ctx.moveTo(topR.x, topR.y)
          ctx.lineTo(rightR.x, rightR.y)
          ctx.lineTo(bottomR.x, bottomR.y)
          ctx.lineTo(leftR.x, leftR.y)
          ctx.closePath()
          ctx.stroke()
        }
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
  }, [buildings, isPlacing, mousePos, selectedBuildingType, selectedBuilding, checkCollision, now, canvasSize, getTransform, spritesLoaded, camTick])

  // Handle mouse move (includes drag panning)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDragging.current) {
      panRef.current = {
        x: dragPanStart.current.x + (e.clientX - dragStart.current.x),
        y: dragPanStart.current.y + (e.clientY - dragStart.current.y),
      }
      setCamTick((t) => t + 1)
      return
    }
    const pos = clientToLogical(e.clientX, e.clientY)
    setMousePos(pos)
  }, [clientToLogical])

  // Handle mouse down (start drag)
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Right-click or middle-click always pans; left-click pans only if not placing
    if (e.button === 1 || e.button === 2 || (!isPlacing && e.button === 0)) {
      isDragging.current = true
      dragStart.current = { x: e.clientX, y: e.clientY }
      dragPanStart.current = { ...panRef.current }
    }
  }, [isPlacing])

  // Handle mouse up (end drag, fire click if no drag movement)
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const wasDragging = isDragging.current
    const dx = Math.abs(e.clientX - dragStart.current.x)
    const dy = Math.abs(e.clientY - dragStart.current.y)
    isDragging.current = false

    // Only fire click if mouse barely moved (< 5px)
    if (wasDragging && dx < 5 && dy < 5 && e.button === 0) {
      const pos = clientToLogical(e.clientX, e.clientY)
      const { gx: gridX, gy: gridY } = screenToGrid(pos.x, pos.y)
      if (isPlacing && selectedBuildingType !== null) {
        placeBuilding(gridX, gridY)
      } else {
        const building = getBuildingAt(gridX, gridY)
        setSelectedBuilding(building?.buildingId ?? null)
      }
    }
  }, [isPlacing, selectedBuildingType, placeBuilding, getBuildingAt, clientToLogical])

  // Handle click for placement mode (left-click when placing)
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isPlacing || selectedBuildingType === null) return
    const pos = clientToLogical(e.clientX, e.clientY)
    const { gx: gridX, gy: gridY } = screenToGrid(pos.x, pos.y)
    placeBuilding(gridX, gridY)
  }, [isPlacing, selectedBuildingType, placeBuilding, clientToLogical])

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    setMousePos(null)
    isDragging.current = false
  }, [])

  // Mouse wheel zoom (toward cursor)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorY = e.clientY - rect.top

      const oldZoom = zoomRef.current
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * zoomDelta))
      const ratio = newZoom / oldZoom

      // Zoom toward cursor: adjust pan so the point under cursor stays fixed
      const baseScale = Math.min(canvasSize.w / ISO_CANVAS_W, canvasSize.h / ISO_CANVAS_H)
      const oldCenterX = canvasSize.w / 2 + panRef.current.x
      const oldCenterY = canvasSize.h / 2 + panRef.current.y
      const newCenterX = cursorX + ratio * (oldCenterX - cursorX)
      const newCenterY = cursorY + ratio * (oldCenterY - cursorY)
      // Adjust pan to account for baseScale centering shift between old and new zoom
      const oldBaseTx = (canvasSize.w - ISO_CANVAS_W * baseScale * oldZoom) / 2
      const newBaseTx = (canvasSize.w - ISO_CANVAS_W * baseScale * newZoom) / 2
      const oldBaseTy = (canvasSize.h - ISO_CANVAS_H * baseScale * oldZoom) / 2
      const newBaseTy = (canvasSize.h - ISO_CANVAS_H * baseScale * newZoom) / 2

      panRef.current = {
        x: panRef.current.x + (newCenterX - oldCenterX) - (newBaseTx - oldBaseTx),
        y: panRef.current.y + (newCenterY - oldCenterY) - (newBaseTy - oldBaseTy),
      }
      zoomRef.current = newZoom
      setCamTick((t) => t + 1)
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [canvasSize])

  // Touch handlers for pinch-zoom and drag-pan
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const getTouchDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging.current = true
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        dragPanStart.current = { ...panRef.current }
      } else if (e.touches.length === 2) {
        isDragging.current = false
        pinchStartDist.current = getTouchDist(e.touches[0], e.touches[1])
        pinchStartZoom.current = zoomRef.current
        dragStart.current = {
          x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
          y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
        }
        dragPanStart.current = { ...panRef.current }
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 1 && isDragging.current) {
        panRef.current = {
          x: dragPanStart.current.x + (e.touches[0].clientX - dragStart.current.x),
          y: dragPanStart.current.y + (e.touches[0].clientY - dragStart.current.y),
        }
        setCamTick((t) => t + 1)
      } else if (e.touches.length === 2) {
        const dist = getTouchDist(e.touches[0], e.touches[1])
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM,
          pinchStartZoom.current * (dist / pinchStartDist.current)
        ))
        zoomRef.current = newZoom

        const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2
        const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2
        panRef.current = {
          x: dragPanStart.current.x + (midX - dragStart.current.x),
          y: dragPanStart.current.y + (midY - dragStart.current.y),
        }
        setCamTick((t) => t + 1)
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        isDragging.current = false
      } else if (e.touches.length === 1) {
        // Switched from pinch to single finger
        isDragging.current = true
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        dragPanStart.current = { ...panRef.current }
      }
    }

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd)
    return () => {
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  // Skip fee estimation on Katana dev (block timestamp can be stale)
  const noFeeDetails = {
    resourceBounds: {
      l1_gas: { max_amount: 0n, max_price_per_unit: 0n },
      l2_gas: { max_amount: 0n, max_price_per_unit: 0n },
      l1_data_gas: { max_amount: 0n, max_price_per_unit: 0n },
    },
  }

  // Upgrade building on-chain
  const handleUpgrade = useCallback(async (buildingId: number) => {
    if (!account || pending) return
    setPending(true)
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
    } finally {
      setPending(false)
    }
  }, [account, pending])

  // Finish upgrade on-chain
  const handleFinishUpgrade = useCallback(async (buildingId: number) => {
    if (!account || pending) return
    setPending(true)
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
    } finally {
      setPending(false)
    }
  }, [account, pending])

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
    <div ref={containerRef} style={styles.container}>
      <canvas
        ref={canvasRef}
        style={styles.canvas}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={isPlacing ? handleClick : undefined}
        onMouseLeave={handleMouseLeave}
        onContextMenu={(e) => e.preventDefault()}
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
                  backgroundColor: upgradeReady && !pending ? '#27ae60' : '#555',
                  opacity: upgradeReady && !pending ? 1 : 0.5,
                  cursor: upgradeReady && !pending ? 'pointer' : 'not-allowed',
                }}
                onClick={() => upgradeReady && !pending && handleFinishUpgrade(selectedBuildingData.buildingId)}
                disabled={!upgradeReady || pending}
              >
                {pending ? 'Finishing...' : upgradeReady ? 'Finish Upgrade' : `${formatCountdown(upgradeRemaining)} remaining`}
              </button>
            </div>
          )}

          {/* Upgrade button */}
          {!selectedBuildingData.isUpgrading &&
            selectedBuildingData.level < (MAX_LEVELS[selectedBuildingData.buildingType] ?? 1) && (() => {
              const cost = getUpgradeCost(selectedBuildingData.buildingType, selectedBuildingData.level)
              const affordable = canAfford(cost.diamond, cost.gas)
              const nextStats = getBuildingStats(selectedBuildingData.buildingType, selectedBuildingData.level + 1)

              return (
                <div style={styles.upgradeSection}>
                  <div style={styles.upgradeCost}>
                    {cost.diamond > 0 && <span style={{ color: '#FFD700' }}>{cost.diamond} diamond</span>}
                    {cost.gas > 0 && <span style={{ color: '#DA70D6' }}>{cost.gas} gas</span>}
                  </div>
                  {nextStats && (
                    <p style={{ ...styles.stat, color: '#888', fontSize: '11px' }}>
                      Next: {nextStats}
                    </p>
                  )}
                  <button
                    style={{
                      ...styles.upgradeBtn,
                      opacity: affordable && !pending ? 1 : 0.5,
                      cursor: affordable && !pending ? 'pointer' : 'not-allowed',
                    }}
                    onClick={() => affordable && !pending && handleUpgrade(selectedBuildingData.buildingId)}
                    disabled={!affordable || pending}
                  >
                    {!affordable ? 'Not enough resources' : pending ? 'Sending...' : `Upgrade to L${selectedBuildingData.level + 1}`}
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
}
