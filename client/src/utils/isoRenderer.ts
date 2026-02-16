import {
  GRID_SIZE,
  HALF_W,
  HALF_H,
  ISO_CANVAS_W,
  TOP_PADDING,
  COLORS,
  BUILDING_SIZES,
  BUILDING_COLORS,
  BUILDING_HEIGHTS,
} from './constants'

export function gridToScreen(gx: number, gy: number): { x: number; y: number } {
  return {
    x: (gx - gy) * HALF_W + ISO_CANVAS_W / 2,
    y: (gx + gy) * HALF_H + TOP_PADDING,
  }
}

export function screenToGrid(sx: number, sy: number): { gx: number; gy: number } {
  const dx = sx - ISO_CANVAS_W / 2
  const dy = sy - TOP_PADDING
  return {
    gx: Math.floor((dx / HALF_W + dy / HALF_H) / 2),
    gy: Math.floor((dy / HALF_H - dx / HALF_W) / 2),
  }
}

export function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const dr = Math.round(r * (1 - factor))
  const dg = Math.round(g * (1 - factor))
  const db = Math.round(b * (1 - factor))
  return `rgb(${dr},${dg},${db})`
}

export function drawIsoGrid(ctx: CanvasRenderingContext2D) {
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
}

export interface IsoBuildingData {
  buildingType: number
  x: number
  y: number
  level: number
}

export function drawIsoBuilding(
  ctx: CanvasRenderingContext2D,
  building: IsoBuildingData,
  sprites: Record<number, HTMLImageElement>,
  isSelected: boolean,
  opacity?: number,
  tint?: string
) {
  const size = BUILDING_SIZES[building.buildingType] || { width: 1, height: 1 }
  const baseColor = tint || BUILDING_COLORS[building.buildingType] || '#888'
  const bh = BUILDING_HEIGHTS[building.buildingType] ?? 14

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

  const sprite = sprites[building.buildingType]

  const prevAlpha = ctx.globalAlpha
  if (opacity !== undefined) {
    ctx.globalAlpha = opacity
  }

  // Grid footprint hint
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
    const diamondW = rightG.x - leftG.x
    const spriteScale = 1.0
    const spriteW = diamondW * spriteScale
    const spriteH = spriteW
    const cx = (leftG.x + rightG.x) / 2
    const drawX = cx - spriteW / 2
    const drawY = bottomG.y - spriteH * 0.88

    ctx.drawImage(sprite, drawX, drawY, spriteW, spriteH)
  } else {
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

    // Selection border
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
  ctx.globalAlpha = prevAlpha
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 10px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const topCenter = {
    x: (topR.x + rightR.x + bottomR.x + leftR.x) / 4,
    y: (topR.y + rightR.y + bottomR.y + leftR.y) / 4,
  }
  ctx.fillText(`L${building.level}`, topCenter.x, topCenter.y)

  if (opacity !== undefined) {
    ctx.globalAlpha = prevAlpha
  }
}
