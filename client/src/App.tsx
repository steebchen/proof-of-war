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
import { useAttack } from './hooks/useAttack'
import { dojoConfig, NO_FEE_DETAILS } from './config/dojoConfig'

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
  const [isSpawning, setIsSpawning] = useState(false)
  const [isFetchingPlayer, setIsFetchingPlayer] = useState(false)
  const hasFetchedRef = useRef(false)
  const { currentBattle, cancelAttack } = useAttack()

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

  // Handle spawn (connect + initialize)
  const handleSpawn = async () => {
    if (!address || !account) return

    setIsSpawning(true)

    try {
      // Call the village system spawn function with username
      // Convert "Player" to felt252 (short string encoding)
      const username = '0x506c61796572' // "Player" as felt252
      console.log('Calling spawn contract:', dojoConfig.villageSystemAddress)
      await account.execute([
        {
          contractAddress: dojoConfig.villageSystemAddress,
          entrypoint: 'spawn',
          calldata: [username],
        },
      ], NO_FEE_DETAILS)
      console.log('Spawn successful')

      // Set optimistic local state after successful spawn
      // The subscription will update with real data from Torii
      setPlayer({
        address,
        username: 'Player',
        diamond: BigInt(2000),
        gas: BigInt(1000),
        trophies: 0,
        townHallLevel: 1,
        buildingCount: 1,
        totalBuilders: 1,
        freeBuilders: 1,
        maxBuilders: 5,
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
            <h2>Welcome to Clash Prototype!</h2>
            <p>Connect your wallet to start playing</p>
          </div>
        ) : isFetchingPlayer ? (
          <div style={styles.loadingPrompt}>
            <h2>Loading your village...</h2>
            <p>Fetching your data from the blockchain</p>
            <div style={styles.spinner} />
          </div>
        ) : !player ? (
          <div style={styles.spawnPrompt}>
            <h2>Welcome, Commander!</h2>
            <p>Click Spawn to create your village</p>
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
        />
      )}

      {showArmy && <TrainPanel onClose={() => setShowArmy(false)} />}

      {showLeaderboard && <Leaderboard onClose={() => setShowLeaderboard(false)} />}

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

export default App
