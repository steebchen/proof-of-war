import { BattleState } from '../../hooks/useAttack'

export function getStarCount(destructionPercent: number): number {
  if (destructionPercent >= 100) return 3
  if (destructionPercent >= 75) return 2
  if (destructionPercent >= 50) return 1
  return 0
}

interface BattleResultProps {
  battle: BattleState
  onClose: () => void
}

export function BattleResult({ battle, onClose }: BattleResultProps) {
  const stars = getStarCount(battle.destructionPercent)
  const isVictory = stars >= 1

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <h1 style={{ ...styles.title, color: isVictory ? '#27ae60' : '#e74c3c' }}>
          {isVictory ? 'VICTORY!' : 'DEFEAT'}
        </h1>

        <div style={styles.stars}>
          {[1, 2, 3].map((starNum) => {
            const earned = starNum <= stars
            return (
              <span
                key={starNum}
                style={{
                  ...styles.star,
                  color: earned ? '#FFD700' : '#333',
                  textShadow: earned ? '0 0 20px #FFD700, 0 0 40px #FFA500' : '2px 2px 4px rgba(0,0,0,0.5)',
                  transform: earned ? 'scale(1.1)' : 'scale(0.9)',
                  display: 'inline-block',
                }}
              >
                ★
              </span>
            )
          })}
        </div>

        <div style={styles.destructionBar}>
          <div style={styles.destructionLabel}>
            Destruction: {battle.destructionPercent}%
          </div>
          <div style={styles.destructionTrack}>
            <div style={{ ...styles.destructionFill, width: `${battle.destructionPercent}%` }} />
            {/* Star markers at 50%, 75%, 100% */}
            <div style={{ ...styles.starMarker, left: '50%' }}>
              <span style={{ color: battle.destructionPercent >= 50 ? '#FFD700' : '#555', fontSize: '12px' }}>★</span>
            </div>
            <div style={{ ...styles.starMarker, left: '75%' }}>
              <span style={{ color: battle.destructionPercent >= 75 ? '#FFD700' : '#555', fontSize: '12px' }}>★★</span>
            </div>
            <div style={{ ...styles.starMarker, left: '100%' }}>
              <span style={{ color: battle.destructionPercent >= 100 ? '#FFD700' : '#555', fontSize: '12px' }}>★★★</span>
            </div>
          </div>
        </div>

        <div style={styles.stats}>
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

          <div style={styles.stat}>
            <span style={styles.label}>Trophies</span>
            <span style={{ ...styles.value, color: battle.trophiesChange >= 0 ? '#27ae60' : '#e74c3c' }}>
              {battle.trophiesChange >= 0 ? '+' : ''}{battle.trophiesChange}
            </span>
          </div>
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
    marginBottom: '16px',
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
    marginBottom: '24px',
  },
  star: {
    fontSize: '64px',
    margin: '0 8px',
    transition: 'transform 0.3s ease',
  },
  destructionBar: {
    marginBottom: '32px',
  },
  destructionLabel: {
    color: '#aaa',
    fontSize: '14px',
    marginBottom: '8px',
    fontWeight: 'bold',
  },
  destructionTrack: {
    position: 'relative',
    height: '8px',
    backgroundColor: '#333',
    borderRadius: '4px',
    overflow: 'visible',
  },
  destructionFill: {
    height: '100%',
    backgroundColor: '#e74c3c',
    borderRadius: '4px',
    transition: 'width 0.5s ease',
  },
  starMarker: {
    position: 'absolute',
    top: '-18px',
    transform: 'translateX(-50%)',
  } as React.CSSProperties,
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
