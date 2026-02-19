import { useState, useEffect } from 'react'
import { useAccount } from '@starknet-react/core'
import { useDojo, Player } from '../../providers/DojoProvider'
import { getLeague } from '../../config/dojoConfig'

interface LeaderboardProps {
  onClose: () => void
}

export function Leaderboard({ onClose }: LeaderboardProps) {
  const { address } = useAccount()
  const { fetchAllPlayers } = useDojo()
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchAllPlayers().then(all => {
      setPlayers(all)
      setLoading(false)
    })
  }, [fetchAllPlayers])

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <h2 style={{ margin: 0, color: '#FFD700' }}>Leaderboard</h2>
          <button style={styles.closeBtn} onClick={onClose}>X</button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>
            Loading...
          </div>
        ) : players.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: '#888' }}>
            No players found yet.
          </div>
        ) : (
          <div style={styles.table}>
            <div style={styles.tableHeader}>
              <span style={styles.colRank}>#</span>
              <span style={styles.colName}>Player</span>
              <span style={styles.colTrophies}>Trophies</span>
              <span style={styles.colTH}>TH Level</span>
            </div>
            {players.map((p, i) => {
              const isMe = address && p.address.toLowerCase() === address.toLowerCase()
              return (
                <div
                  key={p.address}
                  style={{
                    ...styles.row,
                    backgroundColor: isMe ? 'rgba(255, 215, 0, 0.15)' : i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                    border: isMe ? '1px solid rgba(255, 215, 0, 0.3)' : '1px solid transparent',
                  }}
                >
                  <span style={{
                    ...styles.colRank,
                    color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : '#888',
                    fontWeight: i < 3 ? 'bold' : 'normal',
                  }}>
                    {i + 1}
                  </span>
                  <span style={styles.colName}>
                    <span style={{ fontWeight: 'bold' }}>{p.username || 'Unknown'}</span>
                    {isMe && <span style={styles.youBadge}>YOU</span>}
                    <span style={styles.addressSmall}>
                      {p.address.slice(0, 6)}...{p.address.slice(-4)}
                    </span>
                  </span>
                  <span style={{
                    ...styles.colTrophies,
                    color: '#FFD700',
                    fontWeight: 'bold',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '2px',
                  }}>
                    {p.trophies}
                    <span style={{
                      fontSize: '9px',
                      color: getLeague(p.trophies).color,
                      fontWeight: 'bold',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}>
                      {getLeague(p.trophies).name}
                    </span>
                  </span>
                  <span style={styles.colTH}>{p.townHallLevel}</span>
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
    border: '2px solid #FFD700',
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
  table: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '2px solid #0f3460',
    color: '#888',
    fontSize: '12px',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: '6px',
  },
  colRank: {
    width: '40px',
    textAlign: 'center',
    fontSize: '16px',
  },
  colName: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  colTrophies: {
    width: '80px',
    textAlign: 'center',
    fontSize: '16px',
  },
  colTH: {
    width: '70px',
    textAlign: 'center',
    fontSize: '14px',
    color: '#3498db',
  },
  youBadge: {
    display: 'inline-block',
    marginLeft: '8px',
    padding: '1px 6px',
    backgroundColor: '#FFD700',
    color: '#000',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 'bold',
    verticalAlign: 'middle',
  },
  addressSmall: {
    fontSize: '11px',
    color: '#666',
    fontFamily: 'monospace',
  },
}
