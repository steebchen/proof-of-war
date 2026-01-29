import { useState, useRef, useEffect, useCallback } from 'react'
import { useAttack } from '../../hooks/useAttack'
import { useTroops } from '../../hooks/useTroops'
import { TroopType, TROOP_INFO } from '../../config/dojoConfig'
import {
  GRID_SIZE,
  TILE_SIZE,
  CANVAS_SIZE,
} from '../../utils/constants'

interface AttackScreenProps {
  onClose: () => void
}

export function AttackScreen({ onClose }: AttackScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const { currentBattle, startAttack, deployTroop, processCombat, endBattle } = useAttack()
  const { barbarians, archers } = useTroops()
  const [selectedTroop, setSelectedTroop] = useState<TroopType | null>(null)
  const [targetAddress, setTargetAddress] = useState('')
  const [deployedTroops, setDeployedTroops] = useState<Array<{
    type: TroopType
    x: number
    y: number
    id: number
  }>>([])

  // Mock enemy buildings for display
  const [enemyBuildings] = useState([
    { type: 0, x: 18, y: 18, width: 4, height: 4 },
    { type: 1, x: 10, y: 10, width: 3, height: 3 },
    { type: 7, x: 25, y: 12, width: 3, height: 3 },
  ])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear and draw grass
    ctx.fillStyle = '#2d4a2d' // Darker grass for enemy base
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
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

    // Draw enemy buildings
    for (const building of enemyBuildings) {
      ctx.fillStyle = '#c0392b' // Red-ish for enemy
      ctx.fillRect(
        building.x * TILE_SIZE + 1,
        building.y * TILE_SIZE + 1,
        building.width * TILE_SIZE - 2,
        building.height * TILE_SIZE - 2
      )
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'
      ctx.strokeRect(
        building.x * TILE_SIZE + 1,
        building.y * TILE_SIZE + 1,
        building.width * TILE_SIZE - 2,
        building.height * TILE_SIZE - 2
      )
    }

    // Draw deployment zone (edges)
    ctx.fillStyle = 'rgba(46, 204, 113, 0.2)'
    ctx.fillRect(0, 0, CANVAS_SIZE, TILE_SIZE * 3) // Top
    ctx.fillRect(0, CANVAS_SIZE - TILE_SIZE * 3, CANVAS_SIZE, TILE_SIZE * 3) // Bottom
    ctx.fillRect(0, 0, TILE_SIZE * 3, CANVAS_SIZE) // Left
    ctx.fillRect(CANVAS_SIZE - TILE_SIZE * 3, 0, TILE_SIZE * 3, CANVAS_SIZE) // Right

    // Draw deployed troops
    for (const troop of deployedTroops) {
      const info = TROOP_INFO[troop.type]
      ctx.fillStyle = info.color
      ctx.beginPath()
      ctx.arc(troop.x, troop.y, 8, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
    }
  }, [enemyBuildings, deployedTroops])

  useEffect(() => {
    draw()
  }, [draw])

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!currentBattle || selectedTroop === null) return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Check if in deployment zone (edges)
    const inDeployZone =
      x < TILE_SIZE * 3 ||
      x > CANVAS_SIZE - TILE_SIZE * 3 ||
      y < TILE_SIZE * 3 ||
      y > CANVAS_SIZE - TILE_SIZE * 3

    if (!inDeployZone) {
      console.log('Deploy in the edge zones only!')
      return
    }

    // Check if we have troops
    if (selectedTroop === TroopType.Barbarian && barbarians <= 0) return
    if (selectedTroop === TroopType.Archer && archers <= 0) return

    // Deploy troop
    deployTroop(selectedTroop, Math.floor(x), Math.floor(y))

    // Add to local state
    setDeployedTroops((prev) => [
      ...prev,
      { type: selectedTroop, x, y, id: Date.now() },
    ])
  }, [currentBattle, selectedTroop, barbarians, archers, deployTroop])

  const handleStartAttack = async () => {
    if (!targetAddress) return
    await startAttack(targetAddress)
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h2>Attack Mode</h2>
          <button style={styles.closeBtn} onClick={onClose}>X</button>
        </div>

        {!currentBattle ? (
          <div style={styles.targetInput}>
            <label>Target Address:</label>
            <input
              type="text"
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              placeholder="0x..."
              style={styles.input}
            />
            <button style={styles.startBtn} onClick={handleStartAttack}>
              Scout & Attack
            </button>
          </div>
        ) : (
          <>
            <div style={styles.battleInfo}>
              <span>Destruction: {currentBattle.destructionPercent}%</span>
              <span>Gold: {currentBattle.goldStolen.toString()}</span>
              <span>Elixir: {currentBattle.elixirStolen.toString()}</span>
            </div>

            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              style={styles.canvas}
              onClick={handleCanvasClick}
            />

            <div style={styles.troopSelector}>
              <span>Select Troop:</span>
              {Object.entries(TROOP_INFO).map(([type, info]) => {
                const count = Number(type) === TroopType.Barbarian ? barbarians : archers
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

            <div style={styles.actions}>
              <button style={styles.processBtn} onClick={processCombat}>
                Process Combat Tick
              </button>
              <button style={styles.endBtn} onClick={endBattle}>
                End Battle
              </button>
            </div>
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
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    backgroundColor: '#1a1a2e',
    borderRadius: '16px',
    border: '2px solid #c0392b',
    padding: '24px',
    maxWidth: '90vw',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
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
  targetInput: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  input: {
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #0f3460',
    backgroundColor: '#16213e',
    color: '#fff',
    fontSize: '14px',
    fontFamily: 'monospace',
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
    marginBottom: '16px',
  },
  canvas: {
    border: '4px solid #c0392b',
    borderRadius: '8px',
    cursor: 'crosshair',
    display: 'block',
    margin: '0 auto',
  },
  troopSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginTop: '16px',
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
    marginTop: '16px',
    justifyContent: 'center',
  },
  processBtn: {
    padding: '12px 24px',
    backgroundColor: '#f39c12',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  endBtn: {
    padding: '12px 24px',
    backgroundColor: '#27ae60',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
}
