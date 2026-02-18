import { BattleState } from '../../hooks/useAttack'

interface BattleResultProps {
  battle: BattleState
  onClose: () => void
}

export function BattleResult({ battle, onClose }: BattleResultProps) {
  const isVictory = battle.destructionPercent >= 50

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <h1 style={{ ...styles.title, color: isVictory ? '#27ae60' : '#e74c3c' }}>
          {isVictory ? 'VICTORY!' : 'DEFEAT'}
        </h1>

        <div style={styles.stats}>
          <div style={styles.stat}>
            <span style={styles.label}>Destruction</span>
            <span style={styles.value}>{battle.destructionPercent}%</span>
          </div>

          <div style={styles.stat}>
            <span style={styles.label}>Diamond Stolen</span>
            <span style={{ ...styles.value, color: '#FFD700' }}>
              {battle.diamondStolen.toString()}
            </span>
          </div>

          <div style={styles.stat}>
            <span style={styles.label}>Gas Stolen</span>
            <span style={{ ...styles.value, color: '#9932CC' }}>
              {battle.gasStolen.toString()}
            </span>
          </div>
        </div>

        <div style={styles.stats}>
          <div style={styles.stat}>
            <span style={styles.label}>Trophies</span>
            <span style={{ ...styles.value, color: battle.trophiesChange >= 0 ? '#27ae60' : '#e74c3c' }}>
              {battle.trophiesChange >= 0 ? '+' : ''}{battle.trophiesChange}
            </span>
          </div>

          <div style={styles.stat}>
            <span style={styles.label}>Troops Deployed</span>
            <span style={styles.value}>{battle.troopsDeployed}</span>
          </div>
        </div>

        <div style={styles.stars}>
          {[1, 2, 3].map((star) => (
            <span
              key={star}
              style={{
                ...styles.star,
                color:
                  battle.destructionPercent >= star * 33
                    ? '#FFD700'
                    : '#444',
              }}
            >
              ★
            </span>
          ))}
        </div>

        <button style={styles.closeBtn} onClick={onClose}>
          Return to Village
        </button>
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
    zIndex: 1001,
  },
  panel: {
    backgroundColor: '#1a1a2e',
    borderRadius: '16px',
    border: '2px solid #0f3460',
    padding: '48px',
    textAlign: 'center',
    minWidth: '400px',
  },
  title: {
    fontSize: '48px',
    marginBottom: '32px',
    textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
  },
  stats: {
    display: 'flex',
    justifyContent: 'space-around',
    marginBottom: '32px',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    color: '#888',
    fontSize: '14px',
  },
  value: {
    fontSize: '24px',
    fontWeight: 'bold',
  },
  stars: {
    marginBottom: '32px',
  },
  star: {
    fontSize: '64px',
    margin: '0 8px',
    textShadow: '2px 2px 4px rgba(0,0,0,0.5)',
  },
  closeBtn: {
    padding: '16px 32px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '18px',
  },
}
