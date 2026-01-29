import { useState, useEffect } from 'react'
import { useAccount } from '@starknet-react/core'
import { useDojo, Building } from './providers/DojoProvider'
import { Header } from './components/layout/Header'
import { BottomBar } from './components/layout/BottomBar'
import { VillageGrid } from './components/village/VillageGrid'
import { TrainPanel } from './components/army/TrainPanel'
import { AttackScreen } from './components/attack/AttackScreen'
import { BattleResult } from './components/attack/BattleResult'
import { useAttack } from './hooks/useAttack'

function App() {
  const { address, isConnected } = useAccount()
  const { player, setPlayer, setBuildings, setArmy } = useDojo()
  const [showArmy, setShowArmy] = useState(false)
  const [showAttack, setShowAttack] = useState(false)
  const { currentBattle, cancelAttack } = useAttack()

  // Initialize demo data when wallet connects
  useEffect(() => {
    if (isConnected && address && !player) {
      // Create demo player data
      setPlayer({
        address,
        username: 'Player',
        gold: BigInt(500),
        elixir: BigInt(500),
        trophies: 0,
        townHallLevel: 1,
        buildingCount: 1,
      })

      // Create starter town hall
      const townHall: Building = {
        owner: address,
        buildingId: 1,
        buildingType: 0, // TownHall
        level: 1,
        x: 18,
        y: 18,
        health: 1500,
        isUpgrading: false,
        upgradeFinishTime: BigInt(0),
      }
      setBuildings([townHall])

      // Initialize empty army
      setArmy({
        owner: address,
        barbarians: 0,
        archers: 0,
        totalSpaceUsed: 0,
        maxCapacity: 0,
      })
    }
  }, [isConnected, address, player, setPlayer, setBuildings, setArmy])

  // Handle spawn (connect + initialize)
  const handleSpawn = () => {
    if (!address) return

    setPlayer({
      address,
      username: 'Player',
      gold: BigInt(500),
      elixir: BigInt(500),
      trophies: 0,
      townHallLevel: 1,
      buildingCount: 1,
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
    }
    setBuildings([townHall])

    setArmy({
      owner: address,
      barbarians: 5,
      archers: 3,
      totalSpaceUsed: 8,
      maxCapacity: 20,
    })
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
        ) : !player ? (
          <div style={styles.spawnPrompt}>
            <h2>Welcome, Commander!</h2>
            <p>Click Spawn to create your village</p>
            <button style={styles.spawnBtn} onClick={handleSpawn}>
              Spawn Village
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
        />
      )}

      {showArmy && <TrainPanel onClose={() => setShowArmy(false)} />}

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
    minHeight: '100vh',
  },
  main: {
    flex: 1,
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  connectPrompt: {
    textAlign: 'center',
    padding: '48px',
  },
  spawnPrompt: {
    textAlign: 'center',
    padding: '48px',
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
}

export default App
