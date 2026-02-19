import { useState, useRef, useEffect, useCallback } from 'react'
import { useAccount } from '@starknet-react/core'
import { useAttack, BattleState } from '../../hooks/useAttack'
import { useTroops } from '../../hooks/useTroops'
import { useDojo, Building, Player } from '../../providers/DojoProvider'
import { TroopType, TROOP_INFO, BuildingType, SpellType, SPELL_INFO, SPELL_UNLOCK_TH_LEVEL, MAX_SPELLS_PER_BATTLE, getLeague } from '../../config/dojoConfig'
import {
  GRID_SIZE,
  ISO_CANVAS_W,
  ISO_CANVAS_H,
  BUILDING_SIZES,
  BUILDING_HEIGHTS,
} from '../../utils/constants'
import {
  gridToScreen,
  screenToGrid,
  drawIsoGrid,
  drawIsoBuilding,
} from '../../utils/isoRenderer'

// Troop config matching Cairo (for replay simulation)
const TROOP_CONFIG: Record<number, { health: number; damage: number; attackRange: number; movementSpeed: number }> = {
  [TroopType.Barbarian]: { health: 45, damage: 8, attackRange: 1, movementSpeed: 2 },
  [TroopType.Archer]: { health: 20, damage: 7, attackRange: 4, movementSpeed: 2 },
  [TroopType.Giant]: { health: 300, damage: 12, attackRange: 1, movementSpeed: 1 },
}

// Defense stats matching Cairo config
const DEFENSE_STATS: Record<number, { damage: (level: number) => number; range: number }> = {
  [BuildingType.Cannon]: { damage: (level: number) => 8 + level * 2, range: 9 },
  [BuildingType.ArcherTower]: { damage: (level: number) => 6 + level * 1, range: 10 },
}

const TICKS_PER_BATTLE = 60
const DEPLOY_ZONE_DEPTH = 3 // tiles from edge

interface DeployedTroopLocal {
  id: number
  type: TroopType
  x: number // pixel coords 0-399
  y: number
}

// Replay simulation state
interface SimTroop {
  id: number
  type: TroopType
  x: number
  y: number
  health: number
  alive: boolean
  targetBuildingId: number
}

interface SimBuilding {
  buildingId: number
  buildingType: number
  level: number
  x: number // grid coords
  y: number
  maxHealth: number
  currentHealth: number
  destroyed: boolean
}

interface TickSnapshot {
  troops: { id: number; x: number; y: number; alive: boolean; health: number }[]
  buildings: { buildingId: number; currentHealth: number; destroyed: boolean }[]
  destructionPercent: number
}

interface AttackScreenProps {
  onClose: () => void
}

// Building sprite map
const BUILDING_SPRITES: Partial<Record<number, string>> = {
  [BuildingType.TownHall]: '/buildings/command-center.png',
  [BuildingType.DiamondMine]: '/buildings/diamond-refinery.png',
  [BuildingType.DiamondStorage]: '/buildings/diamond-storage.png',
  [BuildingType.GasCollector]: '/buildings/gas-extractor.png',
  [BuildingType.GasStorage]: '/buildings/gas-storage.png',
}

function runReplaySimulation(
  initialTroops: SimTroop[],
  initialBuildings: SimBuilding[],
): TickSnapshot[] {
  const snapshots: TickSnapshot[] = []
  const troops = initialTroops.map(t => ({ ...t }))
  const buildings = initialBuildings.map(b => ({ ...b }))

  // Record initial state
  snapshots.push(captureSnapshot(troops, buildings))

  for (let tick = 0; tick < TICKS_PER_BATTLE; tick++) {
    // 1. Move troops toward targets and attack
    for (const troop of troops) {
      if (!troop.alive) continue

      const config = TROOP_CONFIG[troop.type]

      // Check if current target is still valid
      if (troop.targetBuildingId > 0) {
        const target = buildings.find(b => b.buildingId === troop.targetBuildingId)
        if (!target || target.destroyed) {
          troop.targetBuildingId = 0
        }
      }

      // Find nearest building if no target
      if (troop.targetBuildingId === 0) {
        troop.targetBuildingId = findNearestBuilding(troop.x, troop.y, buildings)
      }

      if (troop.targetBuildingId > 0) {
        const target = buildings.find(b => b.buildingId === troop.targetBuildingId)
        if (target && !target.destroyed) {
          const targetX = target.x * 10
          const targetY = target.y * 10
          const dx = targetX - troop.x
          const dy = targetY - troop.y
          const distSq = dx * dx + dy * dy
          const rangePx = config.attackRange * 10
          const rangeSq = rangePx * rangePx

          if (distSq <= rangeSq) {
            // Attack
            target.currentHealth -= config.damage
            if (target.currentHealth <= 0) {
              target.currentHealth = 0
              target.destroyed = true
              troop.targetBuildingId = 0
            }
          } else {
            // Move toward target
            const absDx = Math.abs(dx)
            const absDy = Math.abs(dy)
            const speed = config.movementSpeed

            let xMove: number, yMove: number
            if (absDx >= absDy) {
              xMove = Math.min(speed, absDx)
              yMove = Math.min(speed - xMove, absDy)
            } else {
              yMove = Math.min(speed, absDy)
              xMove = Math.min(speed - yMove, absDx)
            }

            troop.x += dx > 0 ? xMove : -xMove
            troop.y += dy > 0 ? yMove : -yMove
          }
        }
      }
    }

    // 2. Defenses counter-attack
    for (const building of buildings) {
      if (building.destroyed) continue
      const defenseConfig = DEFENSE_STATS[building.buildingType]
      if (!defenseConfig) continue

      const bx = building.x * 10
      const by = building.y * 10
      const rangePx = defenseConfig.range * 10
      const rangeSq = rangePx * rangePx
      const damage = defenseConfig.damage(building.level)

      // Find nearest alive troop in range
      let nearestId = -1
      let nearestDist = Infinity
      for (const troop of troops) {
        if (!troop.alive) continue
        const dx = troop.x - bx
        const dy = troop.y - by
        const dist = dx * dx + dy * dy
        if (dist < nearestDist && dist <= rangeSq) {
          nearestDist = dist
          nearestId = troop.id
        }
      }

      if (nearestId >= 0) {
        const targetTroop = troops.find(t => t.id === nearestId)
        if (targetTroop && targetTroop.alive) {
          targetTroop.health -= damage
          if (targetTroop.health <= 0) {
            targetTroop.health = 0
            targetTroop.alive = false
          }
        }
      }
    }

    snapshots.push(captureSnapshot(troops, buildings))

    // 3. Check end conditions
    const allDestroyed = buildings.every(b => b.destroyed)
    const allDead = troops.every(t => !t.alive)
    if (allDestroyed || allDead) break
  }

  return snapshots
}

function captureSnapshot(troops: SimTroop[], buildings: SimBuilding[]): TickSnapshot {
  const destroyedCount = buildings.filter(b => b.destroyed).length
  const totalBuildings = buildings.length
  return {
    troops: troops.map(t => ({ id: t.id, x: t.x, y: t.y, alive: t.alive, health: t.health })),
    buildings: buildings.map(b => ({ buildingId: b.buildingId, currentHealth: b.currentHealth, destroyed: b.destroyed })),
    destructionPercent: totalBuildings > 0 ? Math.floor((destroyedCount * 100) / totalBuildings) : 0,
  }
}

function findNearestBuilding(tx: number, ty: number, buildings: SimBuilding[]): number {
  let nearestId = 0
  let nearestDist = Infinity
  for (const b of buildings) {
    if (b.destroyed) continue
    const bx = b.x * 10
    const by = b.y * 10
    const dx = tx - bx
    const dy = ty - by
    const dist = dx * dx + dy * dy
    if (dist < nearestDist) {
      nearestDist = dist
      nearestId = b.buildingId
    }
  }
  return nearestId
}

export function AttackScreen({ onClose }: AttackScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { address } = useAccount()
  const { currentBattle, startAttack, deployTroop, deploySpell, resolveBattle, cancelAttack } = useAttack()
  const { barbarians, archers, giants } = useTroops()
  const { fetchDefenderBuildings, fetchAllPlayers, player } = useDojo()
  const [selectedTroop, setSelectedTroop] = useState<TroopType | null>(null)
  const [targetAddress, setTargetAddress] = useState('')
  const [defenderBuildings, setDefenderBuildings] = useState<Building[]>([])
  const [deployedTroops, setDeployedTroops] = useState<DeployedTroopLocal[]>([])
  const [phase, setPhase] = useState<'scout' | 'deploy' | 'resolving' | 'replay' | 'result'>('scout')
  const [canvasSize, setCanvasSize] = useState<{ w: number; h: number }>({ w: ISO_CANVAS_W, h: ISO_CANVAS_H })
  const [pending, setPending] = useState(false)
  const spritesRef = useRef<Record<number, HTMLImageElement>>({})
  const [spritesLoaded, setSpritesLoaded] = useState(false)

  // Player discovery
  const [opponents, setOpponents] = useState<Player[]>([])
  const [loadingOpponents, setLoadingOpponents] = useState(true)

  // Fetch opponents on mount, sorted by trophy proximity
  useEffect(() => {
    setLoadingOpponents(true)
    fetchAllPlayers(address).then(players => {
      const myTrophies = player?.trophies ?? 0
      const sorted = players
        .filter(p => p.shieldUntil <= BigInt(Math.floor(Date.now() / 1000)))
        .sort((a, b) => Math.abs(a.trophies - myTrophies) - Math.abs(b.trophies - myTrophies))
      // Put shielded players at the end
      const shielded = players.filter(p => p.shieldUntil > BigInt(Math.floor(Date.now() / 1000)))
      setOpponents([...sorted, ...shielded])
      setLoadingOpponents(false)
    })
  }, [fetchAllPlayers, address, player?.trophies])

  // Replay state
  const [replaySnapshots, setReplaySnapshots] = useState<TickSnapshot[]>([])
  const [replayTick, setReplayTick] = useState(0)
  const replayRef = useRef<number | null>(null)
  const [battleResult, setBattleResult] = useState<BattleState | null>(null)
  const [replaySpeed, setReplaySpeed] = useState(1)
  const [replayPaused, setReplayPaused] = useState(false)

  // Camera
  const MIN_ZOOM = 0.5
  const MAX_ZOOM = 3.0
  const zoomRef = useRef(1.0)
  const panRef = useRef({ x: 0, y: 0 })
  const [camTick, setCamTick] = useState(0)
  const isDragging = useRef(false)
  const didDrag = useRef(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const dragPanStart = useRef({ x: 0, y: 0 })
  const lastWheelTimeRef = useRef(0)
  const gestureModeRef = useRef<'zoom' | 'pan' | null>(null)
  const lastTrackpadTimeRef = useRef(0)

  // Track remaining troops locally (decrements on deploy)
  const [localBarbarians, setLocalBarbarians] = useState(0)
  const [localArchers, setLocalArchers] = useState(0)
  const [localGiants, setLocalGiants] = useState(0)
  useEffect(() => { setLocalBarbarians(barbarians) }, [barbarians])
  useEffect(() => { setLocalArchers(archers) }, [archers])
  useEffect(() => { setLocalGiants(giants) }, [giants])

  // Spell state
  const [deployMode, setDeployMode] = useState<'troop' | 'spell'>('troop')
  const [selectedSpell, setSelectedSpell] = useState<SpellType | null>(null)
  const [spellsUsed, setSpellsUsed] = useState(0)
  const [deployedSpells, setDeployedSpells] = useState<{ id: number; type: SpellType; x: number; y: number }[]>([])
  const canUseSpells = (player?.townHallLevel ?? 0) >= SPELL_UNLOCK_TH_LEVEL

  // Load sprites
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

  // Track container size
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

  const getTransform = useCallback(() => {
    const baseScale = Math.min(canvasSize.w / ISO_CANVAS_W, canvasSize.h / ISO_CANVAS_H)
    const scale = baseScale * zoomRef.current
    const tx = (canvasSize.w - ISO_CANVAS_W * scale) / 2 + panRef.current.x
    const ty = (canvasSize.h - ISO_CANVAS_H * scale) / 2 + panRef.current.y
    return { scale, tx, ty }
  }, [canvasSize, camTick]) // eslint-disable-line react-hooks/exhaustive-deps

  const clientToLogical = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const canvasX = (clientX - rect.left) * (canvas.width / rect.width) / dpr
    const canvasY = (clientY - rect.top) * (canvas.height / rect.height) / dpr
    const { scale, tx, ty } = getTransform()
    return {
      x: (canvasX - tx) / scale,
      y: (canvasY - ty) / scale,
    }
  }, [getTransform])

  // Check if grid position is in deployment zone (edge tiles)
  const isDeployZone = useCallback((gx: number, gy: number) => {
    if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) return false
    return gx < DEPLOY_ZONE_DEPTH || gx >= GRID_SIZE - DEPLOY_ZONE_DEPTH ||
      gy < DEPLOY_ZONE_DEPTH || gy >= GRID_SIZE - DEPLOY_ZONE_DEPTH
  }, [])

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasSize.w * dpr
    canvas.height = canvasSize.h * dpr

    ctx.resetTransform()
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const { scale, tx, ty } = getTransform()
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, tx * dpr, ty * dpr)

    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, ISO_CANVAS_W, ISO_CANVAS_H)

    // Draw grid
    drawIsoGrid(ctx)

    // Draw deployment zones (green tinted edge tiles) during deploy phase
    if (phase === 'deploy') {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        for (let gy = 0; gy < GRID_SIZE; gy++) {
          if (isDeployZone(gx, gy)) {
            const top = gridToScreen(gx, gy)
            const right = gridToScreen(gx + 1, gy)
            const bottom = gridToScreen(gx + 1, gy + 1)
            const left = gridToScreen(gx, gy + 1)
            ctx.beginPath()
            ctx.moveTo(top.x, top.y)
            ctx.lineTo(right.x, right.y)
            ctx.lineTo(bottom.x, bottom.y)
            ctx.lineTo(left.x, left.y)
            ctx.closePath()
            ctx.fillStyle = 'rgba(46, 204, 113, 0.15)'
            ctx.fill()
          }
        }
      }
    }

    // Get current snapshot for replay, or use live buildings
    const currentSnapshot = (phase === 'replay' || phase === 'result') && replaySnapshots.length > 0
      ? replaySnapshots[Math.min(replayTick, replaySnapshots.length - 1)]
      : null

    // Sort and draw buildings
    const buildingsToRender = [...defenderBuildings].sort((a, b) => (a.x + a.y) - (b.x + b.y))
    for (const building of buildingsToRender) {
      const snapshotBuilding = currentSnapshot?.buildings.find(b => b.buildingId === building.buildingId)
      const isDestroyed = snapshotBuilding?.destroyed ?? false
      const opacity = isDestroyed ? 0.3 : 1.0

      drawIsoBuilding(ctx, building, spritesRef.current, false, opacity)

      // Health bar for buildings
      const size = BUILDING_SIZES[building.buildingType] || { width: 1, height: 1 }
      const bh = BUILDING_HEIGHTS[building.buildingType] ?? 14
      const topG = gridToScreen(building.x, building.y)
      const rightG = gridToScreen(building.x + size.width, building.y)
      const leftG = gridToScreen(building.x, building.y + size.height)
      const cx = (leftG.x + rightG.x) / 2
      const barY = topG.y - bh - 8
      const barWidth = 30
      const barHeight = 4
      const maxHp = building.health
      const curHp = snapshotBuilding ? snapshotBuilding.currentHealth : maxHp
      const healthPct = maxHp > 0 ? curHp / maxHp : 1

      if (!isDestroyed) {
        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
        ctx.fillRect(cx - barWidth / 2 - 1, barY - 1, barWidth + 2, barHeight + 2)
        // Empty bar
        ctx.fillStyle = '#333'
        ctx.fillRect(cx - barWidth / 2, barY, barWidth, barHeight)
        // Health fill
        ctx.fillStyle = healthPct > 0.5 ? '#2ecc71' : healthPct > 0.25 ? '#f39c12' : '#e74c3c'
        ctx.fillRect(cx - barWidth / 2, barY, barWidth * healthPct, barHeight)
      } else {
        // Destroyed label
        ctx.fillStyle = '#e74c3c'
        ctx.font = 'bold 8px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText('DESTROYED', cx, barY + barHeight)
      }
    }

    // Draw troops (deployed or replay)
    const troopsToRender = currentSnapshot
      ? currentSnapshot.troops
      : deployedTroops.map(t => ({ id: t.id, x: t.x, y: t.y, alive: true, health: TROOP_CONFIG[t.type]?.health ?? 45 }))

    for (const troop of troopsToRender) {
      if (!troop.alive) continue

      // Convert pixel coords (0-399) to grid coords for isometric rendering
      const gridX = troop.x / 10
      const gridY = troop.y / 10
      const screen = gridToScreen(gridX, gridY)

      // Determine troop type for color
      const deployedInfo = deployedTroops.find(d => d.id === troop.id)
      const troopType = deployedInfo?.type ?? TroopType.Barbarian
      const info = TROOP_INFO[troopType]

      // Troop circle
      ctx.fillStyle = info.color
      ctx.beginPath()
      ctx.arc(screen.x, screen.y - 4, 5, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5
      ctx.stroke()

      // Troop health bar
      const maxHp = TROOP_CONFIG[troopType]?.health ?? 45
      const curHp = troop.health
      const hpPct = maxHp > 0 ? curHp / maxHp : 1
      const tBarW = 14
      const tBarH = 2
      const tBarX = screen.x - tBarW / 2
      const tBarY = screen.y - 13

      ctx.fillStyle = '#333'
      ctx.fillRect(tBarX, tBarY, tBarW, tBarH)
      ctx.fillStyle = hpPct > 0.5 ? '#2ecc71' : hpPct > 0.25 ? '#f39c12' : '#e74c3c'
      ctx.fillRect(tBarX, tBarY, tBarW * hpPct, tBarH)
    }

    // Draw deployed spell indicators
    for (const spell of deployedSpells) {
      const gridX = spell.x / 10
      const gridY = spell.y / 10
      const screen = gridToScreen(gridX, gridY)
      const info = SPELL_INFO[spell.type]

      // Spell radius circle
      ctx.beginPath()
      ctx.arc(screen.x, screen.y, 20, 0, Math.PI * 2)
      ctx.fillStyle = info.color + '33' // translucent
      ctx.fill()
      ctx.strokeStyle = info.color
      ctx.lineWidth = 2
      ctx.stroke()

      // Spell icon
      ctx.fillStyle = info.color
      ctx.font = 'bold 10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(info.name[0], screen.x, screen.y)
    }

    // HUD during replay
    if (phase === 'replay' && currentSnapshot) {
      ctx.resetTransform()
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'
      ctx.fillRect(10, 10, 200, 50)
      ctx.fillStyle = '#fff'
      ctx.font = '14px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(`Tick: ${replayTick}/${replaySnapshots.length - 1}`, 20, 18)
      ctx.fillText(`Destruction: ${currentSnapshot.destructionPercent}%`, 20, 38)
    }
  }, [canvasSize, getTransform, defenderBuildings, deployedTroops, deployedSpells, phase, replaySnapshots, replayTick, isDeployZone, spritesLoaded, camTick]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { draw() }, [draw])

  // Replay animation loop
  useEffect(() => {
    if (phase !== 'replay' || replaySnapshots.length === 0 || replayPaused) return

    const interval = setInterval(() => {
      setReplayTick(prev => {
        const next = prev + 1
        if (next >= replaySnapshots.length) {
          clearInterval(interval)
          setPhase('result')
          return prev
        }
        return next
      })
    }, 100 / replaySpeed)

    replayRef.current = interval as unknown as number
    return () => clearInterval(interval)
  }, [phase, replaySnapshots, replaySpeed, replayPaused])

  const handleSkipReplay = useCallback(() => {
    if (replayRef.current) clearInterval(replayRef.current)
    setReplayTick(replaySnapshots.length - 1)
    setPhase('result')
  }, [replaySnapshots])

  // Scout: fetch defender buildings
  const handleScout = async () => {
    if (!targetAddress || pending) return
    setPending(true)
    try {
      const buildings = await fetchDefenderBuildings(targetAddress)
      if (buildings.length === 0) {
        alert('No buildings found for this address')
        setPending(false)
        return
      }
      setDefenderBuildings(buildings)

      // Start attack on-chain
      const battleId = await startAttack(targetAddress)
      if (battleId !== null) {
        setPhase('deploy')
      }
    } catch (error) {
      console.error('Scout failed:', error)
    }
    setPending(false)
  }

  // Deploy troop on canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== 'deploy' || !currentBattle) return

    const pos = clientToLogical(e.clientX, e.clientY)
    const { gx, gy } = screenToGrid(pos.x, pos.y)
    const pixelX = gx * 10
    const pixelY = gy * 10

    if (deployMode === 'spell' && selectedSpell !== null) {
      // Deploy spell anywhere on the grid
      if (gx < 0 || gy < 0 || gx >= GRID_SIZE || gy >= GRID_SIZE) return
      if (spellsUsed >= MAX_SPELLS_PER_BATTLE) return

      deploySpell(currentBattle.battleId, selectedSpell, pixelX, pixelY)
      setDeployedSpells(prev => [...prev, { id: prev.length + 1, type: selectedSpell, x: pixelX, y: pixelY }])
      setSpellsUsed(prev => prev + 1)
      return
    }

    // Troop deployment
    if (selectedTroop === null) return
    if (!isDeployZone(gx, gy)) return

    // Check troop availability
    if (selectedTroop === TroopType.Barbarian && localBarbarians <= 0) return
    if (selectedTroop === TroopType.Archer && localArchers <= 0) return
    if (selectedTroop === TroopType.Giant && localGiants <= 0) return

    // Deploy on-chain
    deployTroop(currentBattle.battleId, selectedTroop, pixelX, pixelY)

    // Add to local state
    const troopId = deployedTroops.length + 1
    setDeployedTroops(prev => [...prev, { id: troopId, type: selectedTroop, x: pixelX, y: pixelY }])

    // Decrement local count
    if (selectedTroop === TroopType.Barbarian) {
      setLocalBarbarians(prev => prev - 1)
    } else if (selectedTroop === TroopType.Archer) {
      setLocalArchers(prev => prev - 1)
    } else if (selectedTroop === TroopType.Giant) {
      setLocalGiants(prev => prev - 1)
    }
  }, [phase, currentBattle, selectedTroop, selectedSpell, deployMode, localBarbarians, localArchers, localGiants, spellsUsed, deployTroop, deploySpell, deployedTroops, clientToLogical, isDeployZone])

  // Launch attack (resolve)
  const handleLaunchAttack = async () => {
    if (!currentBattle || deployedTroops.length === 0 || pending) return
    setPending(true)
    setPhase('resolving')

    try {
      await resolveBattle(currentBattle.battleId)

      // Build simulation initial state from deployed troops and defender buildings
      const simTroops: SimTroop[] = deployedTroops.map(t => ({
        id: t.id,
        type: t.type,
        x: t.x,
        y: t.y,
        health: TROOP_CONFIG[t.type]?.health ?? 45,
        alive: true,
        targetBuildingId: 0,
      }))

      const simBuildings: SimBuilding[] = defenderBuildings
        .filter(b => b.level > 0)
        .map(b => ({
          buildingId: b.buildingId,
          buildingType: b.buildingType,
          level: b.level,
          x: b.x,
          y: b.y,
          maxHealth: b.health,
          currentHealth: b.health,
          destroyed: false,
        }))

      // Run deterministic replay simulation
      const snapshots = runReplaySimulation(simTroops, simBuildings)
      setReplaySnapshots(snapshots)
      setReplayTick(0)
      setPhase('replay')

      // Save final result
      const finalSnapshot = snapshots[snapshots.length - 1]
      setBattleResult({
        battleId: currentBattle.battleId,
        defender: currentBattle.defender,
        status: 'ended',
        destructionPercent: finalSnapshot.destructionPercent,
        diamondStolen: currentBattle.diamondStolen,
        gasStolen: currentBattle.gasStolen,
        tickCount: snapshots.length - 1,
        trophiesChange: currentBattle.trophiesChange,
        troopsDeployed: currentBattle.troopsDeployed,
      })
    } catch (error) {
      console.error('Resolve failed:', error)
      setPhase('deploy')
    }
    setPending(false)
  }

  // Mouse handlers for pan/drag
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true
    didDrag.current = false
    dragStart.current = { x: e.clientX, y: e.clientY }
    dragPanStart.current = { ...panRef.current }
  }, [])

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
        setCamTick(t => t + 1)
      }
    }
  }, [])

  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = false
    if (!didDrag.current) {
      handleCanvasClick(e)
    }
  }, [handleCanvasClick])

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false
  }, [])

  // Wheel zoom/pan
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()

      const now = performance.now()
      const timeSinceLastEvent = now - lastWheelTimeRef.current
      lastWheelTimeRef.current = now

      if (timeSinceLastEvent > 200) {
        gestureModeRef.current = null
      }

      let action: 'zoom' | 'pan'

      if (e.ctrlKey) {
        action = 'zoom'
      } else if (e.deltaMode === 1) {
        action = 'zoom'
      } else if (e.deltaX !== 0) {
        gestureModeRef.current = 'pan'
        lastTrackpadTimeRef.current = now
        action = 'pan'
      } else if (gestureModeRef.current === 'pan') {
        action = 'pan'
      } else if (now - lastTrackpadTimeRef.current < 5000) {
        gestureModeRef.current = 'pan'
        action = 'pan'
      } else {
        action = 'zoom'
      }

      if (action === 'zoom') {
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
        setCamTick(t => t + 1)
      } else {
        panRef.current = {
          x: panRef.current.x - e.deltaX,
          y: panRef.current.y - e.deltaY,
        }
        setCamTick(t => t + 1)
      }
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', handleWheel)
  }, [canvasSize])

  // Star rating based on destruction
  const getStars = (destruction: number) => {
    if (destruction >= 100) return 3
    if (destruction >= 50) return 2
    if (destruction >= 25) return 1
    return 0
  }

  const handleClose = () => {
    cancelAttack()
    onClose()
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h2 style={{ margin: 0 }}>Attack Mode</h2>
          <button style={styles.closeBtn} onClick={handleClose}>X</button>
        </div>

        {phase === 'scout' && (
          <div style={styles.scoutPhase}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, color: '#e74c3c' }}>Choose an Opponent</h3>
              {opponents.length > 0 && !loadingOpponents && (
                <button
                  style={{ ...styles.startBtn, padding: '8px 16px', fontSize: '13px' }}
                  onClick={() => {
                    const bestMatch = opponents.find(o => o.shieldUntil <= BigInt(Math.floor(Date.now() / 1000)))
                    if (bestMatch) {
                      setTargetAddress(bestMatch.address)
                    }
                  }}
                >
                  Find Match
                </button>
              )}
            </div>
            {loadingOpponents ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>
                Loading opponents...
              </div>
            ) : opponents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>
                No opponents found. Wait for other players to join!
              </div>
            ) : (
              <div style={styles.opponentList}>
                {opponents.map(opponent => {
                  const isShielded = opponent.shieldUntil > BigInt(Math.floor(Date.now() / 1000))
                  return (
                    <button
                      key={opponent.address}
                      style={{
                        ...styles.opponentCard,
                        border: targetAddress === opponent.address ? '2px solid #e74c3c' : '2px solid #0f3460',
                        opacity: isShielded ? 0.4 : pending ? 0.6 : 1,
                        cursor: isShielded ? 'not-allowed' : 'pointer',
                      }}
                      onClick={() => !isShielded && setTargetAddress(opponent.address)}
                      disabled={pending || isShielded}
                    >
                      <div style={styles.opponentInfo}>
                        <span style={styles.opponentName}>
                          {opponent.username || 'Unknown'}
                          {isShielded && <span style={styles.shieldBadge}>SHIELDED</span>}
                        </span>
                        <span style={styles.opponentAddress}>
                          {opponent.address.slice(0, 6)}...{opponent.address.slice(-4)}
                        </span>
                      </div>
                      <div style={styles.opponentStats}>
                        <span style={{ ...styles.statBadge, backgroundColor: getLeague(opponent.trophies).color + '44', color: getLeague(opponent.trophies).color }} title="Trophies">
                          {opponent.trophies} {getLeague(opponent.trophies).name}
                        </span>
                        <span style={styles.statBadgeTH} title="Town Hall Level">
                          TH{opponent.townHallLevel}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
            {targetAddress && (
              <button
                style={{ ...styles.startBtn, opacity: pending ? 0.5 : 1, marginTop: '12px' }}
                onClick={handleScout}
                disabled={pending}
              >
                {pending ? 'Scouting...' : 'Scout & Attack'}
              </button>
            )}
          </div>
        )}

        {(phase === 'deploy' || phase === 'resolving' || phase === 'replay' || phase === 'result') && (
          <>
            {/* Battle info HUD */}
            <div style={styles.battleInfo}>
              <span>Phase: {phase}</span>
              <span>Troops deployed: {deployedTroops.length}</span>
              {phase === 'replay' && replaySnapshots.length > 0 && (
                <span>Destruction: {replaySnapshots[Math.min(replayTick, replaySnapshots.length - 1)].destructionPercent}%</span>
              )}
            </div>

            {/* Canvas */}
            <div ref={containerRef} style={styles.canvasContainer}>
              <canvas
                ref={canvasRef}
                style={styles.canvas}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
              />
            </div>

            {/* Troop & spell selector (deploy phase only) */}
            {phase === 'deploy' && (
              <>
                {/* Mode toggle */}
                <div style={styles.modeToggle}>
                  <button
                    style={{
                      ...styles.modeBtn,
                      backgroundColor: deployMode === 'troop' ? '#c0392b' : '#333',
                    }}
                    onClick={() => { setDeployMode('troop'); setSelectedSpell(null) }}
                  >
                    Troops
                  </button>
                  {canUseSpells && (
                    <button
                      style={{
                        ...styles.modeBtn,
                        backgroundColor: deployMode === 'spell' ? '#8e44ad' : '#333',
                      }}
                      onClick={() => { setDeployMode('spell'); setSelectedTroop(null) }}
                    >
                      Spells ({spellsUsed}/{MAX_SPELLS_PER_BATTLE})
                    </button>
                  )}
                </div>

                {deployMode === 'troop' ? (
                  <div style={styles.troopSelector}>
                    <span>Select Troop:</span>
                    {Object.entries(TROOP_INFO).map(([type, info]) => {
                      const count = Number(type) === TroopType.Barbarian ? localBarbarians
                        : Number(type) === TroopType.Giant ? localGiants
                        : localArchers
                      return (
                        <button
                          key={type}
                          style={{
                            ...styles.troopBtn,
                            backgroundColor: info.color,
                            opacity: count > 0 ? 1 : 0.5,
                            border: selectedTroop === Number(type) ? '3px solid #fff' : '3px solid transparent',
                          }}
                          onClick={() => setSelectedTroop(Number(type) as TroopType)}
                          disabled={count === 0}
                        >
                          {info.name} ({count})
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div style={styles.troopSelector}>
                    <span>Select Spell:</span>
                    {Object.entries(SPELL_INFO).map(([type, info]) => (
                      <button
                        key={type}
                        style={{
                          ...styles.troopBtn,
                          backgroundColor: info.color,
                          opacity: spellsUsed < MAX_SPELLS_PER_BATTLE ? 1 : 0.5,
                          border: selectedSpell === Number(type) ? '3px solid #fff' : '3px solid transparent',
                        }}
                        onClick={() => setSelectedSpell(Number(type) as SpellType)}
                        disabled={spellsUsed >= MAX_SPELLS_PER_BATTLE}
                        title={info.description}
                      >
                        {info.name} ({info.cost}d)
                      </button>
                    ))}
                  </div>
                )}

                <div style={styles.actions}>
                  <button
                    style={{
                      ...styles.launchBtn,
                      opacity: deployedTroops.length > 0 && !pending ? 1 : 0.5,
                    }}
                    onClick={handleLaunchAttack}
                    disabled={deployedTroops.length === 0 || pending}
                  >
                    {pending ? 'Resolving...' : 'Launch Attack'}
                  </button>
                </div>
              </>
            )}

            {/* Resolving indicator */}
            {phase === 'resolving' && (
              <div style={{ textAlign: 'center', padding: '16px', color: '#f39c12', fontWeight: 'bold' }}>
                Resolving battle on-chain...
              </div>
            )}

            {/* Replay controls */}
            {phase === 'replay' && replaySnapshots.length > 0 && (
              <div style={styles.replayControls}>
                <button
                  style={styles.replayCtrlBtn}
                  onClick={() => setReplayPaused(p => !p)}
                >
                  {replayPaused ? 'Play' : 'Pause'}
                </button>
                {[1, 2, 4].map(speed => (
                  <button
                    key={speed}
                    style={{
                      ...styles.replayCtrlBtn,
                      backgroundColor: replaySpeed === speed ? '#c0392b' : '#333',
                    }}
                    onClick={() => setReplaySpeed(speed)}
                  >
                    {speed}x
                  </button>
                ))}
                <button style={{ ...styles.replayCtrlBtn, backgroundColor: '#8e44ad' }} onClick={handleSkipReplay}>
                  Skip
                </button>
                <div style={styles.replayProgress}>
                  <div style={{
                    ...styles.replayProgressFill,
                    width: `${(replayTick / (replaySnapshots.length - 1)) * 100}%`,
                  }} />
                </div>
                <span style={{ fontSize: '12px', color: '#888' }}>
                  {replayTick}/{replaySnapshots.length - 1}
                </span>
              </div>
            )}

            {/* Battle result overlay */}
            {phase === 'result' && battleResult && (
              <div style={styles.resultOverlay}>
                <h3 style={{ margin: '0 0 12px 0' }}>Battle Complete!</h3>
                <div style={styles.stars}>
                  {[1, 2, 3].map(star => (
                    <span
                      key={star}
                      style={{
                        fontSize: '32px',
                        color: star <= getStars(battleResult.destructionPercent) ? '#FFD700' : '#555',
                      }}
                    >
                      ★
                    </span>
                  ))}
                </div>
                <p>Destruction: {battleResult.destructionPercent}%</p>
                <p>Ticks: {battleResult.tickCount}</p>
                <button style={styles.returnBtn} onClick={handleClose}>
                  Return to Village
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    backgroundColor: '#1a1a2e',
    borderRadius: '16px',
    border: '2px solid #c0392b',
    padding: '20px',
    width: '90vw',
    maxWidth: '1000px',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  closeBtn: {
    backgroundColor: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '30px',
    height: '30px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  scoutPhase: {
    display: 'flex',
    flexDirection: 'column',
  },
  opponentList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  opponentCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: '#16213e',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#fff',
    textAlign: 'left' as const,
  },
  opponentInfo: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  opponentName: {
    fontWeight: 'bold',
    fontSize: '15px',
  },
  opponentAddress: {
    fontSize: '11px',
    color: '#888',
    fontFamily: 'monospace',
  },
  opponentStats: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  statBadge: {
    padding: '4px 10px',
    backgroundColor: '#f39c12',
    color: '#000',
    borderRadius: '12px',
    fontWeight: 'bold',
    fontSize: '13px',
  },
  shieldBadge: {
    display: 'inline-block',
    marginLeft: '8px',
    padding: '2px 6px',
    backgroundColor: '#3498db',
    color: '#fff',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 'bold',
    verticalAlign: 'middle',
  },
  statBadgeTH: {
    padding: '4px 10px',
    backgroundColor: '#3498db',
    color: '#fff',
    borderRadius: '12px',
    fontWeight: 'bold',
    fontSize: '13px',
  },
  startBtn: {
    padding: '12px 24px',
    backgroundColor: '#c0392b',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '16px',
  },
  battleInfo: {
    display: 'flex',
    justifyContent: 'space-around',
    padding: '12px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    marginBottom: '12px',
    fontSize: '13px',
  },
  canvasContainer: {
    position: 'relative',
    width: '100%',
    height: '500px',
    overflow: 'hidden',
    borderRadius: '8px',
    border: '2px solid #c0392b',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
    cursor: 'crosshair',
  },
  modeToggle: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center',
    marginTop: '12px',
  },
  modeBtn: {
    padding: '6px 16px',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '13px',
  },
  troopSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '12px',
    justifyContent: 'center',
  },
  troopBtn: {
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#fff',
    fontWeight: 'bold',
    textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
  },
  actions: {
    display: 'flex',
    gap: '12px',
    marginTop: '12px',
    justifyContent: 'center',
  },
  launchBtn: {
    padding: '12px 32px',
    backgroundColor: '#c0392b',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '16px',
  },
  resultOverlay: {
    textAlign: 'center',
    padding: '24px',
    backgroundColor: 'rgba(22, 33, 62, 0.95)',
    borderRadius: '12px',
    border: '2px solid #FFD700',
    marginTop: '12px',
  },
  stars: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  replayControls: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '12px',
    justifyContent: 'center',
    padding: '8px 12px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
  },
  replayCtrlBtn: {
    padding: '6px 12px',
    backgroundColor: '#333',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '12px',
  },
  replayProgress: {
    flex: 1,
    height: '6px',
    backgroundColor: '#333',
    borderRadius: '3px',
    overflow: 'hidden',
    minWidth: '100px',
  },
  replayProgressFill: {
    height: '100%',
    backgroundColor: '#c0392b',
    borderRadius: '3px',
    transition: 'width 0.1s linear',
  },
  returnBtn: {
    padding: '12px 32px',
    backgroundColor: '#27ae60',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '16px',
    marginTop: '12px',
  },
}
