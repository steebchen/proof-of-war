import { useAccount, useConnect, useDisconnect } from '@starknet-react/core'
import { useResources } from '../../hooks/useResources'
import { useDojo } from '../../providers/DojoProvider'
import { COLORS } from '../../utils/constants'

export function Header() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { gold, elixir, collectResources } = useResources()
  const { player, isConnected: toriiConnected } = useDojo()

  const formatNumber = (n: bigint): string => {
    const num = Number(n)
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  return (
    <header style={styles.header}>
      <div style={styles.left}>
        <h1 style={styles.title}>Clash Prototype</h1>
        {toriiConnected && (
          <span style={styles.status}>Torii Connected</span>
        )}
      </div>

      <div style={styles.center}>
        {player && (
          <>
            <div style={styles.resource}>
              <span style={{ ...styles.resourceIcon, backgroundColor: COLORS.gold }}>G</span>
              <span style={styles.resourceValue}>{formatNumber(gold)}</span>
            </div>
            <div style={styles.resource}>
              <span style={{ ...styles.resourceIcon, backgroundColor: COLORS.elixir }}>E</span>
              <span style={styles.resourceValue}>{formatNumber(elixir)}</span>
            </div>
            <button style={styles.collectBtn} onClick={collectResources}>
              Collect
            </button>
          </>
        )}
      </div>

      <div style={styles.right}>
        {isConnected ? (
          <div style={styles.walletInfo}>
            <span style={styles.address}>
              {address?.slice(0, 6)}...{address?.slice(-4)}
            </span>
            {player && (
              <span style={styles.trophies}>
                {player.trophies} Trophies
              </span>
            )}
            <button style={styles.disconnectBtn} onClick={() => disconnect()}>
              Disconnect
            </button>
          </div>
        ) : (
          <div style={styles.connectButtons}>
            {connectors.map((connector) => (
              <button
                key={connector.id}
                style={styles.connectBtn}
                onClick={() => connect({ connector })}
              >
                Connect {connector.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </header>
  )
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    backgroundColor: '#16213e',
    borderBottom: '2px solid #0f3460',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#FFD700',
    margin: 0,
  },
  status: {
    fontSize: '12px',
    color: '#4CAF50',
    padding: '4px 8px',
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderRadius: '4px',
  },
  center: {
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
  },
  resource: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
  },
  resourceIcon: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '14px',
    color: '#000',
  },
  resourceValue: {
    fontSize: '18px',
    fontWeight: 'bold',
    minWidth: '60px',
  },
  collectBtn: {
    padding: '8px 16px',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  walletInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  address: {
    fontSize: '14px',
    color: '#aaa',
    fontFamily: 'monospace',
  },
  trophies: {
    fontSize: '14px',
    color: '#FFD700',
    padding: '4px 8px',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: '4px',
  },
  disconnectBtn: {
    padding: '6px 12px',
    backgroundColor: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  connectButtons: {
    display: 'flex',
    gap: '8px',
  },
  connectBtn: {
    padding: '8px 16px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
}
