import { useState, useEffect } from 'react'
import { useAccount } from '@starknet-react/core'
import { useDojo, BattleRecord } from '../../providers/DojoProvider'

interface BattleLogProps {
  onClose: () => void
}

export function BattleLog({ onClose }: BattleLogProps) {
  const { address } = useAccount()
  const { fetchBattleHistory } = useDojo()
  const [battles, setBattles] = useState<BattleRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!address) return
    setLoading(true)
    fetchBattleHistory(address).then(history => {
      setBattles(history)
      setLoading(false)
    })
  }, [fetchBattleHistory, address])

  const getStars = (destruction: number) => {
    if (destruction >= 100) return 3
    if (destruction >= 50) return 2
    if (destruction >= 25) return 1
    return 0
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h2 style={{ margin: 0, color: '#e74c3c' }}>Battle Log</h2>
          <button style={styles.closeBtn} onClick={onClose}>X</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>
            Loading battle history...
          </div>
        ) : battles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>
            No battles yet. Attack someone to get started!
          </div>
        ) : (
          <div style={styles.list}>
            {battles.map(battle => {
              const isAttacker = address && battle.attacker.toLowerCase() === address.toLowerCase()
              const opponentAddr = isAttacker ? battle.defender : battle.attacker
              const trophyChange = isAttacker ? battle.attackerTrophiesChange : battle.defenderTrophiesChange
              const isWin = isAttacker
                ? battle.destructionPercent >= 50
                : battle.destructionPercent < 50
              const stars = getStars(battle.destructionPercent)

              return (
                <div
                  key={battle.battleId}
                  style={{
                    ...styles.battleCard,
                    borderLeft: `4px solid ${isWin ? '#27ae60' : '#e74c3c'}`,
                  }}
                >
                  <div style={styles.battleHeader}>
                    <span style={{
                      ...styles.roleTag,
                      backgroundColor: isAttacker ? '#e74c3c' : '#3498db',
                    }}>
                      {isAttacker ? 'ATTACK' : 'DEFENSE'}
                    </span>
                    <span style={{
                      fontWeight: 'bold',
                      color: isWin ? '#27ae60' : '#e74c3c',
                    }}>
                      {isWin ? 'Victory' : 'Defeat'}
                    </span>
                    <span style={styles.battleId}>#{battle.battleId}</span>
                  </div>

                  <div style={styles.battleDetails}>
                    <div style={styles.opponentRow}>
                      <span style={{ color: '#888', fontSize: '12px' }}>
                        {isAttacker ? 'Defender' : 'Attacker'}:
                      </span>
                      <span style={styles.opponentAddr}>
                        {opponentAddr.slice(0, 6)}...{opponentAddr.slice(-4)}
                      </span>
                    </div>

                    <div style={styles.statsRow}>
                      <span style={styles.starsDisplay}>
                        {[1, 2, 3].map(s => (
                          <span key={s} style={{ color: s <= stars ? '#FFD700' : '#333', fontSize: '18px' }}>
                            *
                          </span>
                        ))}
                      </span>
                      <span style={{ color: '#aaa' }}>{battle.destructionPercent}%</span>
                      {Number(battle.diamondStolen) > 0 && (
                        <span style={{ color: '#FFD700' }}>
                          {isAttacker ? '+' : '-'}{Number(battle.diamondStolen)}d
                        </span>
                      )}
                      {Number(battle.gasStolen) > 0 && (
                        <span style={{ color: '#DA70D6' }}>
                          {isAttacker ? '+' : '-'}{Number(battle.gasStolen)}g
                        </span>
                      )}
                      <span style={{
                        color: trophyChange >= 0 ? '#27ae60' : '#e74c3c',
                        fontWeight: 'bold',
                      }}>
                        {trophyChange >= 0 ? '+' : ''}{trophyChange}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
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
    border: '2px solid #e74c3c',
    padding: '20px',
    width: '90vw',
    maxWidth: '600px',
    maxHeight: '80vh',
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
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  battleCard: {
    backgroundColor: '#16213e',
    borderRadius: '8px',
    padding: '12px',
  },
  battleHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '8px',
  },
  roleTag: {
    padding: '2px 8px',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 'bold',
  },
  battleId: {
    marginLeft: 'auto',
    color: '#555',
    fontSize: '12px',
  },
  battleDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  opponentRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  opponentAddr: {
    fontSize: '13px',
    color: '#aaa',
    fontFamily: 'monospace',
  },
  statsRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    fontSize: '13px',
  },
  starsDisplay: {
    display: 'flex',
    gap: '2px',
  },
}
