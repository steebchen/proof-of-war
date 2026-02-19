import { useState, useEffect, useRef } from 'react'
import { useAccount, useConnect, useDisconnect } from '@starknet-react/core'
import { useResources } from '../../hooks/useResources'
import { useDojo, BattleRecord } from '../../providers/DojoProvider'
import { COLORS } from '../../utils/constants'
import { getLeague } from '../../config/dojoConfig'

export function Header() {
  const { address, isConnected } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const { diamond, gas, capacity, collectResources, canCollect, collecting, pending, lastCollection } = useResources()
  const { player, army, isConnected: toriiConnected, fetchBattleHistory } = useDojo()
  const [attackNotification, setAttackNotification] = useState<BattleRecord | null>(null)
  const checkedRef = useRef(false)

  // Check for recent attacks on player
  useEffect(() => {
    if (!address || !player || checkedRef.current) return
    checkedRef.current = true

    fetchBattleHistory(address).then(battles => {
      // Find most recent ended battle where player was defender
      const defense = battles.find(
        b => b.defender.toLowerCase() === address.toLowerCase() && b.status !== 'Preparing'
      )
      if (defense) {
        setAttackNotification(defense)
        // Auto-dismiss after 10 seconds
        setTimeout(() => setAttackNotification(null), 10000)
      }
    })
  }, [address, player, fetchBattleHistory])

  const formatNumber = (n: bigint | number): string => {
    const num = typeof n === 'bigint' ? Number(n) : n
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
    return num.toString()
  }

  const getResourceColor = (current: bigint, max: number): string | undefined => {
    if (max <= 0) return undefined
    const ratio = Number(current) / max
    if (ratio >= 1) return '#e74c3c'
    if (ratio > 0.8) return '#f39c12'
    return undefined
  }

  // Get the Cartridge Controller connector
  const controllerConnector = connectors[0]

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
              <span style={{ ...styles.resourceIcon, backgroundColor: COLORS.diamond }}>D</span>
              <span style={{ ...styles.resourceValue, color: getResourceColor(diamond, capacity.diamond) }}>
                {formatNumber(diamond)}
                {capacity.diamond > 0 && <span style={styles.capacityText}>/{formatNumber(capacity.diamond)}</span>}
                {pending.diamond > 0 && (
                  <span style={styles.pendingResource}>+{pending.diamond}</span>
                )}
              </span>
            </div>
            <div style={styles.resource}>
              <span style={{ ...styles.resourceIcon, backgroundColor: COLORS.gas }}>G</span>
              <span style={{ ...styles.resourceValue, color: getResourceColor(gas, capacity.gas) }}>
                {formatNumber(gas)}
                {capacity.gas > 0 && <span style={styles.capacityText}>/{formatNumber(capacity.gas)}</span>}
                {pending.gas > 0 && (
                  <span style={styles.pendingResource}>+{pending.gas}</span>
                )}
              </span>
            </div>
            <div style={styles.resource}>
              <span style={{ ...styles.resourceIcon, backgroundColor: '#e67e22' }}>W</span>
              <span style={styles.resourceValue}>
                {(player.freeBuilders ?? 0)}/{(player.totalBuilders ?? 1)}
              </span>
            </div>
            {army && army.maxCapacity > 0 && (
              <div style={styles.resource} title={`Barbarians: ${army.barbarians}, Archers: ${army.archers}, Giants: ${army.giants}`}>
                <span style={{ ...styles.resourceIcon, backgroundColor: '#e74c3c' }}>A</span>
                <span style={styles.resourceValue}>
                  {army.totalSpaceUsed}/{army.maxCapacity}
                </span>
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <button
                style={{
                  ...styles.collectBtn,
                  opacity: canCollect && !collecting ? 1 : 0.5,
                  cursor: canCollect && !collecting ? 'pointer' : 'not-allowed',
                }}
                onClick={collectResources}
                disabled={!canCollect || collecting}
              >
                {collecting ? 'Collecting...'
                  : lastCollection ? 'Collected!'
                  : canCollect
                    ? `Collect${pending.diamond > 0 ? ` +${pending.diamond}d` : ''}${pending.gas > 0 ? ` +${pending.gas}g` : ''}`
                    : 'Nothing to collect'}
              </button>
              {lastCollection && (
                <div style={styles.collectionToast}>
                  {lastCollection.diamond > 0 && <span style={{ color: '#FFD700' }}>+{lastCollection.diamond} diamond</span>}
                  {lastCollection.diamond > 0 && lastCollection.gas > 0 && <span> </span>}
                  {lastCollection.gas > 0 && <span style={{ color: '#DA70D6' }}>+{lastCollection.gas} gas</span>}
                </div>
              )}
            </div>
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
              <>
                {(() => {
                  const league = getLeague(player.trophies)
                  return (
                    <span style={{ ...styles.leagueBadge, backgroundColor: league.color + '33', color: league.color, borderColor: league.color }}>
                      {league.name}
                    </span>
                  )
                })()}
                <span style={styles.trophies}>
                  {player.trophies} Trophies
                </span>
                {player.shieldUntil > BigInt(Math.floor(Date.now() / 1000)) && (
                  <span style={styles.shield}>
                    Shield Active
                  </span>
                )}
              </>
            )}
            <button style={styles.disconnectBtn} onClick={() => disconnect()}>
              Disconnect
            </button>
          </div>
        ) : (
          <button
            style={styles.connectBtn}
            onClick={() => connect({ connector: controllerConnector })}
          >
            Connect with Controller
          </button>
        )}
      </div>
      {attackNotification && (
        <div style={styles.notificationBanner}>
          <span>
            You were attacked! {attackNotification.destructionPercent}% destroyed.
            {Number(attackNotification.diamondStolen) > 0 && ` Lost ${Number(attackNotification.diamondStolen)} diamond`}
            {Number(attackNotification.gasStolen) > 0 && ` ${Number(attackNotification.gasStolen)} gas`}
          </span>
          <button
            style={styles.dismissBtn}
            onClick={() => setAttackNotification(null)}
          >
            Dismiss
          </button>
        </div>
      )}
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
    position: 'relative',
    zIndex: 100,
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
  capacityText: {
    fontSize: '13px',
    color: '#888',
    fontWeight: 'normal',
  },
  pendingResource: {
    fontSize: '11px',
    color: '#4CAF50',
    marginLeft: '4px',
    fontWeight: 'normal',
  },
  collectBtn: {
    padding: '8px 16px',
    backgroundColor: '#4CAF50',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '13px',
    whiteSpace: 'nowrap',
  },
  collectionToast: {
    position: 'absolute',
    bottom: '-28px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(39, 174, 96, 0.9)',
    padding: '4px 10px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    animation: 'fadeIn 0.3s ease',
    zIndex: 9999,
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
  leagueBadge: {
    fontSize: '12px',
    padding: '4px 8px',
    borderRadius: '4px',
    fontWeight: 'bold',
    border: '1px solid',
  },
  trophies: {
    fontSize: '14px',
    color: '#FFD700',
    padding: '4px 8px',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: '4px',
  },
  shield: {
    fontSize: '12px',
    color: '#3498db',
    padding: '4px 8px',
    backgroundColor: 'rgba(52, 152, 219, 0.2)',
    borderRadius: '4px',
    fontWeight: 'bold',
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
  notificationBanner: {
    position: 'absolute',
    bottom: '-44px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#e74c3c',
    color: '#fff',
    padding: '8px 16px',
    borderRadius: '0 0 8px 8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    fontSize: '13px',
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    zIndex: 200,
  },
  dismissBtn: {
    padding: '2px 8px',
    backgroundColor: 'rgba(255,255,255,0.2)',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '11px',
  },
  connectBtn: {
    padding: '12px 24px',
    backgroundColor: '#F5851F',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '16px',
  },
}
