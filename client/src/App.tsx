import { useState, useEffect, useRef } from 'react'
import { useAccount } from '@starknet-react/core'
import { useDojo, Building } from './providers/DojoProvider'
import { Header } from './components/layout/Header'
import { BottomBar } from './components/layout/BottomBar'
import { VillageGrid } from './components/village/VillageGrid'
import { TrainPanel } from './components/army/TrainPanel'
import { AttackScreen } from './components/attack/AttackScreen'
import { BattleResult } from './components/attack/BattleResult'
import { Leaderboard } from './components/layout/Leaderboard'
import { BattleLog } from './components/attack/BattleLog'
import { PlayerStats } from './components/layout/PlayerStats'
import { useAttack } from './hooks/useAttack'
import { dojoConfig, NO_FEE_DETAILS } from './config/dojoConfig'
import { ToastProvider, useToast } from './components/ui/Toast'

function App() {
  const { address, isConnected, account } = useAccount()
  const {
    player,
    setPlayer,
    setBuildings,
    setArmy,
    isLoading: isToriiLoading,
    error: toriiError,
    fetchPlayerData
  } = useDojo()
  const [showArmy, setShowArmy] = useState(false)
  const [showAttack, setShowAttack] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showBattleLog, setShowBattleLog] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [isSpawning, setIsSpawning] = useState(false)
  const [spawnUsername, setSpawnUsername] = useState('')
  const [isFetchingPlayer, setIsFetchingPlayer] = useState(false)
  const hasFetchedRef = useRef(false)
  const { currentBattle, cancelAttack } = useAttack()
  const { addToast } = useToast()

  // Reset player state on disconnect
  useEffect(() => {
    if (!isConnected) {
      setPlayer(null)
      setBuildings([])
      setArmy(null)
      hasFetchedRef.current = false
    }
  }, [isConnected, setPlayer, setBuildings, setArmy])

  // Fetch player data when wallet connects (once)
  useEffect(() => {
    if (!isConnected || !address || isToriiLoading || hasFetchedRef.current) return

    hasFetchedRef.current = true
    setIsFetchingPlayer(true)

    fetchPlayerData(address)
      .then((found) => {
        if (found) {
          console.log('Loaded existing player from Torii')
        } else {
          console.log('No existing player found, showing spawn screen')
        }
      })
      .catch((err) => {
        console.error('Error fetching player data:', err)
        hasFetchedRef.current = false // allow retry on error
      })
      .finally(() => {
        setIsFetchingPlayer(false)
      })
  }, [isConnected, address, isToriiLoading, fetchPlayerData])

  // Convert a string to felt252 hex (short string encoding, max 31 chars)
  const stringToFelt252 = (str: string): string => {
    const trimmed = str.slice(0, 31)
    let hex = '0x'
    for (let i = 0; i < trimmed.length; i++) {
      hex += trimmed.charCodeAt(i).toString(16).padStart(2, '0')
    }
    return hex
  }

  // Handle spawn (connect + initialize)
  const handleSpawn = async () => {
    if (!address || !account) return

    const name = spawnUsername.trim() || 'Player'

    setIsSpawning(true)

    try {
      const username = stringToFelt252(name)
      console.log('Calling spawn contract:', dojoConfig.villageSystemAddress)
      await account.execute([
        {
          contractAddress: dojoConfig.villageSystemAddress,
          entrypoint: 'spawn',
          calldata: [username],
        },
      ], NO_FEE_DETAILS)
      console.log('Spawn successful')
      addToast('Village spawned! Welcome, Commander!')

      // Set optimistic local state after successful spawn
      // The subscription will update with real data from Torii
      setPlayer({
        address,
        username: name,
        diamond: BigInt(2000),
        gas: BigInt(1000),
        trophies: 0,
        townHallLevel: 1,
        buildingCount: 1,
        totalBuilders: 1,
        freeBuilders: 1,
        maxBuilders: 5,
        shieldUntil: BigInt(0),
        lastAttackAt: BigInt(0),
      })

      const townHall: Building = {
        owner: address,
        buildingId: 1,
        buildingType: 0,
        level: 1,
        x: 18,
        y: 18,
        health: 1500,
        isUpgrading: false,
        upgradeFinishTime: BigInt(0),
        lastCollectedAt: BigInt(Math.floor(Date.now() / 1000)),
      }
      setBuildings([townHall])

      setArmy({
        owner: address,
        barbarians: 0,
        archers: 0,
        giants: 0,
        totalSpaceUsed: 0,
        maxCapacity: 0,
      })

      // Fetch real data from Torii after a short delay to let indexer catch up
      setTimeout(() => {
        fetchPlayerData(address)
      }, 2000)
    } catch (error: unknown) {
      // Check if error is "Player already exists" - this means we should just load the player
      const errorStr = String(error)
      if (errorStr.includes('already exists') || errorStr.includes('616c726561647920657869737473')) {
        console.log('Player already exists, fetching from Torii')
        await fetchPlayerData(address)
      } else {
        console.error('Failed to spawn:', error)
        addToast('Failed to spawn village', 'error')
      }
    } finally {
      setIsSpawning(false)
    }
  }

  // Handle retry connection
  const handleRetry = () => {
    window.location.reload()
  }

  // Show loading while Torii initializes
  if (isToriiLoading) {
    return (
      <div style={styles.app}>
        <Header />
        <main style={styles.main}>
          <div style={styles.loadingPrompt}>
            <h2>Connecting to Torii...</h2>
            <p>Please wait while we establish connection</p>
            <div style={styles.spinner} />
          </div>
        </main>
      </div>
    )
  }

  // Show error state with retry
  if (toriiError) {
    return (
      <div style={styles.app}>
        <Header />
        <main style={styles.main}>
          <div style={styles.errorPrompt}>
            <h2>Connection Error</h2>
            <p>{toriiError}</p>
            <button style={styles.retryBtn} onClick={handleRetry}>
              Retry Connection
            </button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div style={styles.app}>
      <Header />

      <main style={styles.main}>
        {!isConnected ? (
          <div style={styles.connectPrompt}>
            <h2 style={{ fontSize: '28px', color: '#FFD700' }}>Clash Prototype</h2>
            <p style={{ color: '#aaa', marginBottom: '8px' }}>An on-chain strategy game on Starknet</p>
            <p style={{ color: '#666', fontSize: '14px' }}>Connect your wallet to start playing</p>
          </div>
        ) : isFetchingPlayer ? (
          <div style={styles.loadingPrompt}>
            <h2>Loading your village...</h2>
            <p>Fetching your data from the blockchain</p>
            <div style={styles.spinner} />
          </div>
        ) : !player ? (
          <div style={styles.spawnPrompt}>
            <h2 style={{ fontSize: '28px', color: '#FFD700', marginBottom: '8px' }}>Welcome, Commander!</h2>
            <p style={{ color: '#aaa', marginBottom: '24px' }}>Build your base, train troops, and battle other players on-chain.</p>

            <div style={styles.howToPlay}>
              <div style={styles.howToPlayStep}>
                <span style={{ ...styles.stepIcon, backgroundColor: '#FFD700' }}>1</span>
                <div>
                  <strong>Build</strong>
                  <p style={styles.stepDesc}>Place mines, storages, barracks, and defenses to grow your village.</p>
                </div>
              </div>
              <div style={styles.howToPlayStep}>
                <span style={{ ...styles.stepIcon, backgroundColor: '#FFA500' }}>2</span>
                <div>
                  <strong>Train</strong>
                  <p style={styles.stepDesc}>Train barbarians and archers at your barracks to form an army.</p>
                </div>
              </div>
              <div style={styles.howToPlayStep}>
                <span style={{ ...styles.stepIcon, backgroundColor: '#e74c3c' }}>3</span>
                <div>
                  <strong>Attack</strong>
                  <p style={styles.stepDesc}>Scout opponents and deploy troops to steal their resources and earn trophies.</p>
                </div>
              </div>
            </div>

            <input
              type="text"
              placeholder="Enter your name..."
              value={spawnUsername}
              onChange={(e) => setSpawnUsername(e.target.value)}
              maxLength={31}
              style={styles.usernameInput}
              onKeyDown={(e) => e.key === 'Enter' && handleSpawn()}
            />
            <button
              style={{...styles.spawnBtn, opacity: isSpawning ? 0.7 : 1}}
              onClick={handleSpawn}
              disabled={isSpawning}
            >
              {isSpawning ? 'Spawning...' : 'Spawn Village'}
            </button>
          </div>
        ) : (
          <VillageGrid />
        )}
      </main>

      {player && (
        <BottomBar
          onOpenArmy={() => setShowArmy(true)}
          onOpenAttack={() => setShowAttack(true)}
          onOpenLeaderboard={() => setShowLeaderboard(true)}
          onOpenBattleLog={() => setShowBattleLog(true)}
          onOpenStats={() => setShowStats(true)}
        />
      )}

      {showArmy && <TrainPanel onClose={() => setShowArmy(false)} />}

      {showLeaderboard && <Leaderboard onClose={() => setShowLeaderboard(false)} />}

      {showBattleLog && <BattleLog onClose={() => setShowBattleLog(false)} />}

      {showStats && <PlayerStats onClose={() => setShowStats(false)} />}

      {showAttack && (
        <AttackScreen
          onClose={() => {
            setShowAttack(false)
            cancelAttack()
          }}
        />
      )}

      {currentBattle?.status === 'ended' && (
        <BattleResult
          battle={currentBattle}
          onClose={() => {
            cancelAttack()
            setShowAttack(false)
          }}
        />
      )}

    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  app: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    overflow: 'hidden',
  },
  main: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'stretch',
    backgroundColor: '#1a1a2e',
    minHeight: 0,
  },
  connectPrompt: {
    textAlign: 'center',
    padding: '48px',
  },
  spawnPrompt: {
    textAlign: 'center',
    padding: '48px',
    maxWidth: '480px',
    margin: '0 auto',
  },
  howToPlay: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '24px',
    textAlign: 'left',
  },
  howToPlayStep: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 14px',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '8px',
  },
  stepIcon: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '14px',
    color: '#000',
    flexShrink: 0,
  },
  stepDesc: {
    fontSize: '13px',
    color: '#aaa',
    margin: '2px 0 0',
  },
  loadingPrompt: {
    textAlign: 'center',
    padding: '48px',
    color: '#fff',
  },
  errorPrompt: {
    textAlign: 'center',
    padding: '48px',
    color: '#fff',
  },
  usernameInput: {
    padding: '12px 16px',
    fontSize: '16px',
    borderRadius: '8px',
    border: '2px solid #0f3460',
    backgroundColor: '#16213e',
    color: '#fff',
    outline: 'none',
    textAlign: 'center' as const,
    width: '250px',
    marginBottom: '8px',
  },
  spawnBtn: {
    marginTop: '24px',
    padding: '16px 48px',
    backgroundColor: '#27ae60',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '18px',
  },
  retryBtn: {
    marginTop: '24px',
    padding: '16px 48px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '18px',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid rgba(255, 255, 255, 0.3)',
    borderTop: '4px solid #fff',
    borderRadius: '50%',
    margin: '24px auto',
    animation: 'spin 1s linear infinite',
  },
}

// Add keyframes for spinner animation
const styleSheet = document.createElement('style')
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`
document.head.appendChild(styleSheet)

function AppWithToast() {
  return (
    <ToastProvider>
      <App />
    </ToastProvider>
  )
}

export default AppWithToast
