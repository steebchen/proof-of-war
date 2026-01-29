import { createContext, useContext, ReactNode, useState, useEffect } from 'react'
import { dojoConfig } from '../config/dojoConfig'

// Types for our game state
export interface Player {
  address: string
  username: string
  gold: bigint
  elixir: bigint
  trophies: number
  townHallLevel: number
  buildingCount: number
}

export interface Building {
  owner: string
  buildingId: number
  buildingType: number
  level: number
  x: number
  y: number
  health: number
  isUpgrading: boolean
  upgradeFinishTime: bigint
}

export interface Army {
  owner: string
  barbarians: number
  archers: number
  totalSpaceUsed: number
  maxCapacity: number
}

interface DojoContextType {
  isConnected: boolean
  player: Player | null
  buildings: Building[]
  army: Army | null
  setPlayer: (player: Player | null) => void
  setBuildings: (buildings: Building[]) => void
  setArmy: (army: Army | null) => void
  refreshData: () => void
}

const DojoContext = createContext<DojoContextType | null>(null)

export function DojoProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [player, setPlayer] = useState<Player | null>(null)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [army, setArmy] = useState<Army | null>(null)

  useEffect(() => {
    // Check if torii is available
    const checkConnection = async () => {
      try {
        const response = await fetch(`${dojoConfig.toriiUrl}/health`)
        setIsConnected(response.ok)
      } catch {
        setIsConnected(false)
      }
    }
    checkConnection()
  }, [])

  const refreshData = () => {
    // This would be implemented with actual Torii subscriptions
    console.log('Refreshing data...')
  }

  return (
    <DojoContext.Provider
      value={{
        isConnected,
        player,
        buildings,
        army,
        setPlayer,
        setBuildings,
        setArmy,
        refreshData,
      }}
    >
      {children}
    </DojoContext.Provider>
  )
}

export function useDojo() {
  const context = useContext(DojoContext)
  if (!context) {
    throw new Error('useDojo must be used within DojoProvider')
  }
  return context
}
