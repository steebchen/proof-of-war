import { useState } from 'react'
import { TroopType, TROOP_INFO } from '../../config/dojoConfig'
import { useTroops } from '../../hooks/useTroops'
import { useResources } from '../../hooks/useResources'

interface TrainPanelProps {
  onClose: () => void
}

export function TrainPanel({ onClose }: TrainPanelProps) {
  const { barbarians, archers, totalSpace, maxCapacity, trainTroops } = useTroops()
  const { canAfford } = useResources()
  const [selectedTroop, setSelectedTroop] = useState<TroopType>(TroopType.Barbarian)
  const [quantity, setQuantity] = useState(1)

  const handleTrain = async () => {
    const success = await trainTroops(selectedTroop, quantity)
    if (success) {
      setQuantity(1)
    }
  }

  const troopInfo = TROOP_INFO[selectedTroop]
  const totalCost = troopInfo.cost * quantity
  const totalSpaceNeeded = troopInfo.space * quantity
  const canTrain = canAfford(0, totalCost) && totalSpace + totalSpaceNeeded <= maxCapacity

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2>Army Training</h2>
          <button style={styles.closeBtn} onClick={onClose}>X</button>
        </div>

        <div style={styles.capacity}>
          <span>Army Capacity:</span>
          <span style={totalSpace >= maxCapacity ? { color: '#e74c3c' } : {}}>
            {totalSpace} / {maxCapacity}
          </span>
        </div>

        <div style={styles.currentArmy}>
          <h3>Current Army</h3>
          <div style={styles.troopCounts}>
            <div style={styles.troopCount}>
              <div style={{ ...styles.troopIcon, backgroundColor: TROOP_INFO[TroopType.Barbarian].color }}>B</div>
              <span>{barbarians}</span>
            </div>
            <div style={styles.troopCount}>
              <div style={{ ...styles.troopIcon, backgroundColor: TROOP_INFO[TroopType.Archer].color }}>A</div>
              <span>{archers}</span>
            </div>
          </div>
        </div>

        <div style={styles.training}>
          <h3>Train Troops</h3>

          <div style={styles.troopSelection}>
            {Object.entries(TROOP_INFO).map(([type, info]) => (
              <button
                key={type}
                style={{
                  ...styles.troopBtn,
                  backgroundColor: info.color,
                  border: selectedTroop === Number(type) ? '3px solid #fff' : '3px solid transparent',
                }}
                onClick={() => setSelectedTroop(Number(type) as TroopType)}
              >
                <span style={styles.troopName}>{info.name}</span>
                <span style={styles.troopCost}>{info.cost} Elixir</span>
              </button>
            ))}
          </div>

          <div style={styles.quantityRow}>
            <label>Quantity:</label>
            <input
              type="number"
              min={1}
              max={Math.floor((maxCapacity - totalSpace) / troopInfo.space)}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
              style={styles.quantityInput}
            />
          </div>

          <div style={styles.costRow}>
            <span>Total Cost: {totalCost} Elixir</span>
            <span>Space: {totalSpaceNeeded}</span>
          </div>

          <button
            style={{
              ...styles.trainBtn,
              opacity: canTrain ? 1 : 0.5,
            }}
            onClick={handleTrain}
            disabled={!canTrain}
          >
            Train {quantity}x {troopInfo.name}
          </button>

          {!canTrain && (
            <p style={styles.warning}>
              {!canAfford(0, totalCost) ? 'Not enough elixir!' : 'Not enough army capacity!'}
            </p>
          )}
        </div>
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
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    backgroundColor: '#1a1a2e',
    borderRadius: '16px',
    border: '2px solid #0f3460',
    padding: '24px',
    minWidth: '400px',
    maxWidth: '500px',
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
  capacity: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  currentArmy: {
    marginBottom: '20px',
  },
  troopCounts: {
    display: 'flex',
    gap: '16px',
    marginTop: '8px',
  },
  troopCount: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
  },
  troopIcon: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    color: '#fff',
  },
  training: {
    borderTop: '1px solid #0f3460',
    paddingTop: '16px',
  },
  troopSelection: {
    display: 'flex',
    gap: '12px',
    marginTop: '12px',
    marginBottom: '16px',
  },
  troopBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  troopName: {
    color: '#fff',
    fontWeight: 'bold',
    textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
  },
  troopCost: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: '12px',
  },
  quantityRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
  },
  quantityInput: {
    width: '80px',
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #0f3460',
    backgroundColor: '#16213e',
    color: '#fff',
    fontSize: '16px',
  },
  costRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '16px',
    color: '#aaa',
  },
  trainBtn: {
    width: '100%',
    padding: '12px',
    backgroundColor: '#27ae60',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '16px',
  },
  warning: {
    color: '#e74c3c',
    textAlign: 'center',
    marginTop: '8px',
  },
}
