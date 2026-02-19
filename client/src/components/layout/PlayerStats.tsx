import { useState, useEffect } from 'react'
import { useAccount } from '@starknet-react/core'
import { useDojo, BattleRecord } from '../../providers/DojoProvider'
import { getStarCount } from '../attack/BattleResult'
import { getLeague } from '../../config/dojoConfig'

interface PlayerStatsProps {
  onClose: () => void
}

export function PlayerStats({ onClose }: PlayerStatsProps) {
  const { address } = useAccount()
  const { player, fetchBattleHistory } = useDojo()
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

  // Compute stats
  const attacks = battles.filter(b => address && b.attacker.toLowerCase() === address.toLowerCase())
  const defenses = battles.filter(b => address && b.defender.toLowerCase() === address.toLowerCase())

  const attackWins = attacks.filter(b => b.destructionPercent >= 50).length
  const attackLosses = attacks.length - attackWins
  const defenseWins = defenses.filter(b => b.destructionPercent < 50).length
  const defenseLosses = defenses.length - defenseWins

  const totalStarsEarned = attacks.reduce((sum, b) => sum + getStarCount(b.destructionPercent), 0)
  const threeStarCount = attacks.filter(b => b.destructionPercent >= 100).length

  const totalDiamondLooted = attacks.reduce((sum, b) => sum + Number(b.diamondStolen), 0)
  const totalGasLooted = attacks.reduce((sum, b) => sum + Number(b.gasStolen), 0)
  const totalDiamondLost = defenses.reduce((sum, b) => sum + Number(b.diamondStolen), 0)
  const totalGasLost = defenses.reduce((sum, b) => sum + Number(b.gasStolen), 0)

  const league = player ? getLeague(player.trophies) : null

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h2 style={{ margin: 0, color: '#3498db' }}>Player Stats</h2>
          <button style={styles.closeBtn} onClick={onClose}>X</button>
        </div>

        {/* Player info */}
        {player && (
          <div style={styles.playerCard}>
            <div style={styles.playerName}>{player.username || 'Commander'}</div>
            <div style={styles.playerMeta}>
              <span style={{ color: '#3498db' }}>TH Level {player.townHallLevel}</span>
              {league && (
                <span style={{ color: league.color, fontWeight: 'bold' }}>
                  {league.name} League
                </span>
              )}
              <span style={{ color: '#FFD700' }}>{player.trophies} Trophies</span>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>
            Loading stats...
          </div>
        ) : (
          <>
            {/* Combat record */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Combat Record</h3>
              <div style={styles.statsGrid}>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{attacks.length}</div>
                  <div style={styles.statLabel}>Attacks</div>
                </div>
                <div style={styles.statBox}>
                  <div style={{ ...styles.statValue, color: '#27ae60' }}>{attackWins}</div>
                  <div style={styles.statLabel}>Wins</div>
                </div>
                <div style={styles.statBox}>
                  <div style={{ ...styles.statValue, color: '#e74c3c' }}>{attackLosses}</div>
                  <div style={styles.statLabel}>Losses</div>
                </div>
                <div style={styles.statBox}>
                  <div style={{ ...styles.statValue, color: '#FFD700' }}>{totalStarsEarned} ★</div>
                  <div style={styles.statLabel}>Stars Earned</div>
                </div>
              </div>
            </div>

            {/* Defense record */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Defense Record</h3>
              <div style={styles.statsGrid}>
                <div style={styles.statBox}>
                  <div style={styles.statValue}>{defenses.length}</div>
                  <div style={styles.statLabel}>Defenses</div>
                </div>
                <div style={styles.statBox}>
                  <div style={{ ...styles.statValue, color: '#27ae60' }}>{defenseWins}</div>
                  <div style={styles.statLabel}>Defended</div>
                </div>
                <div style={styles.statBox}>
                  <div style={{ ...styles.statValue, color: '#e74c3c' }}>{defenseLosses}</div>
                  <div style={styles.statLabel}>Raided</div>
                </div>
                <div style={styles.statBox}>
                  <div style={{ ...styles.statValue, color: '#FFD700' }}>{threeStarCount}</div>
                  <div style={styles.statLabel}>3-Stars</div>
                </div>
              </div>
            </div>

            {/* Resources */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Resources</h3>
              <div style={styles.resourceGrid}>
                <div style={styles.resourceRow}>
                  <span style={styles.resourceLabel}>Diamond Looted:</span>
                  <span style={{ color: '#FFD700', fontWeight: 'bold' }}>+{totalDiamondLooted}</span>
                </div>
                <div style={styles.resourceRow}>
                  <span style={styles.resourceLabel}>Gas Looted:</span>
                  <span style={{ color: '#DA70D6', fontWeight: 'bold' }}>+{totalGasLooted}</span>
                </div>
                <div style={styles.resourceRow}>
                  <span style={styles.resourceLabel}>Diamond Lost:</span>
                  <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>-{totalDiamondLost}</span>
                </div>
                <div style={styles.resourceRow}>
                  <span style={styles.resourceLabel}>Gas Lost:</span>
                  <span style={{ color: '#e74c3c', fontWeight: 'bold' }}>-{totalGasLost}</span>
                </div>
                <div style={{ ...styles.resourceRow, borderTop: '1px solid #333', paddingTop: '8px', marginTop: '4px' }}>
                  <span style={styles.resourceLabel}>Net Diamond:</span>
                  <span style={{ color: totalDiamondLooted - totalDiamondLost >= 0 ? '#27ae60' : '#e74c3c', fontWeight: 'bold' }}>
                    {totalDiamondLooted - totalDiamondLost >= 0 ? '+' : ''}{totalDiamondLooted - totalDiamondLost}
                  </span>
                </div>
                <div style={styles.resourceRow}>
                  <span style={styles.resourceLabel}>Net Gas:</span>
                  <span style={{ color: totalGasLooted - totalGasLost >= 0 ? '#27ae60' : '#e74c3c', fontWeight: 'bold' }}>
                    {totalGasLooted - totalGasLost >= 0 ? '+' : ''}{totalGasLooted - totalGasLost}
                  </span>
                </div>
              </div>
            </div>

            {/* Win rate */}
            {attacks.length > 0 && (
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}>Win Rate</h3>
                <div style={styles.winRateBar}>
                  <div
                    style={{
                      ...styles.winRateFill,
                      width: `${(attackWins / attacks.length) * 100}%`,
                    }}
                  />
                </div>
                <div style={{ textAlign: 'center', color: '#aaa', fontSize: '13px', marginTop: '4px' }}>
                  {Math.round((attackWins / attacks.length) * 100)}% ({attackWins}W / {attackLosses}L)
                </div>
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
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    backgroundColor: '#1a1a2e',
    borderRadius: '16px',
    border: '2px solid #3498db',
    padding: '20px',
    width: '90vw',
    maxWidth: '500px',
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
  playerCard: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
    border: '1px solid rgba(52, 152, 219, 0.3)',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
    textAlign: 'center',
  },
  playerName: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: '4px',
  },
  playerMeta: {
    display: 'flex',
    justifyContent: 'center',
    gap: '16px',
    fontSize: '13px',
  },
  section: {
    marginBottom: '16px',
  },
  sectionTitle: {
    fontSize: '13px',
    color: '#888',
    textTransform: 'uppercase',
    margin: '0 0 8px 0',
    letterSpacing: '1px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },
  statBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
    padding: '10px 8px',
    textAlign: 'center',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: 'bold',
    color: '#fff',
  },
  statLabel: {
    fontSize: '10px',
    color: '#888',
    marginTop: '2px',
    textTransform: 'uppercase',
  },
  resourceGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  resourceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 8px',
    fontSize: '13px',
  },
  resourceLabel: {
    color: '#888',
  },
  winRateBar: {
    height: '12px',
    backgroundColor: '#e74c3c',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  winRateFill: {
    height: '100%',
    backgroundColor: '#27ae60',
    borderRadius: '6px',
    transition: 'width 0.5s ease',
  },
}
