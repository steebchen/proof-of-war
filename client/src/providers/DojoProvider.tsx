import { createContext, useContext, ReactNode, useState, useEffect, useCallback, useRef } from 'react'
import { init, ToriiQueryBuilder, KeysClause, MemberClause } from '@dojoengine/sdk'
import type { SDK, StandardizedQueryResult } from '@dojoengine/sdk'
import { addAddressPadding } from 'starknet'
import { dojoConfig, BuildingType, TroopType } from '../config/dojoConfig'
import { ClashSchemaType, MODELS } from '../types/schema'

// Types for our game state
export interface Player {
  address: string
  username: string
  diamond: bigint
  gas: bigint
  trophies: number
  townHallLevel: number
  buildingCount: number
  totalBuilders: number
  freeBuilders: number
  maxBuilders: number
  shieldUntil: bigint
  lastAttackAt: bigint
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
  lastCollectedAt: bigint
}

export interface Army {
  owner: string
  barbarians: number
  archers: number
  giants: number
  totalSpaceUsed: number
  maxCapacity: number
  reservedSpace: number
}

export interface BuilderQueue {
  owner: string
  isTraining: boolean
  finishTime: bigint
}

export interface TrainingQueue {
  owner: string
  barracksId: number
  troopType: number
  quantity: number
  finishTime: bigint
}

// Subscription type from torii
interface Subscription {
  free(): void
}

export interface BattleResultData {
  destructionPercent: number
  diamondStolen: bigint
  gasStolen: bigint
  trophiesChange: number
  troopsDeployed: number
}

export interface BattleRecord {
  battleId: number
  attacker: string
  defender: string
  status: string
  destructionPercent: number
  diamondStolen: bigint
  gasStolen: bigint
  attackerTrophiesChange: number
  defenderTrophiesChange: number
  startedAt: bigint
}

interface DojoContextType {
  isConnected: boolean
  isLoading: boolean
  error: string | null
  player: Player | null
  buildings: Building[]
  army: Army | null
  builderQueue: BuilderQueue | null
  trainingQueues: TrainingQueue[]
  setPlayer: (player: Player | null) => void
  setBuildings: (buildings: Building[]) => void
  setArmy: (army: Army | null) => void
  setBuilderQueue: (queue: BuilderQueue | null) => void
  setTrainingQueues: (queues: TrainingQueue[]) => void
  fetchPlayerData: (address: string) => Promise<boolean>
  fetchAllPlayers: (excludeAddress?: string) => Promise<Player[]>
  fetchDefenderBuildings: (address: string) => Promise<Building[]>
  fetchBattleData: (battleId?: number) => Promise<BattleResultData | number | null>
  fetchBattleHistory: (address: string) => Promise<BattleRecord[]>
  refreshData: () => void
  // Building placement state (shared across components)
  isPlacing: boolean
  selectedBuildingType: number | null
  setIsPlacing: (isPlacing: boolean) => void
  setSelectedBuildingType: (type: number | null) => void
  // Building move state
  isMoving: boolean
  movingBuildingId: number | null
  setIsMoving: (isMoving: boolean) => void
  setMovingBuildingId: (id: number | null) => void
}

const DojoContext = createContext<DojoContextType | null>(null)

// Helper to convert felt252 hex to string
function hexToString(hex: string): string {
  if (!hex || hex === '0x0') return ''
  // Remove 0x prefix
  const hexStr = hex.startsWith('0x') ? hex.slice(2) : hex
  // Convert hex pairs to characters
  let result = ''
  for (let i = 0; i < hexStr.length; i += 2) {
    const charCode = parseInt(hexStr.slice(i, i + 2), 16)
    if (charCode > 0) {
      result += String.fromCharCode(charCode)
    }
  }
  return result
}

// Helper to parse building type from Torii response
function parseBuildingType(typeData: unknown): number {
  if (typeof typeData === 'number') return typeData
  if (typeof typeData === 'string') {
    // Could be a numeric string or enum name
    const num = parseInt(typeData, 10)
    if (!isNaN(num)) return num
    // Map enum names to values
    const enumMap: Record<string, number> = {
      'TownHall': BuildingType.TownHall,
      'DiamondMine': BuildingType.DiamondMine,
      'GasCollector': BuildingType.GasCollector,
      'DiamondStorage': BuildingType.DiamondStorage,
      'GasStorage': BuildingType.GasStorage,
      'Barracks': BuildingType.Barracks,
      'ArmyCamp': BuildingType.ArmyCamp,
      'Cannon': BuildingType.Cannon,
      'ArcherTower': BuildingType.ArcherTower,
      'Wall': BuildingType.Wall,
    }
    return enumMap[typeData] ?? 0
  }
  if (typeof typeData === 'object' && typeData !== null) {
    // Could be { variant: 'DiamondMine' } or { type: 'DiamondMine' }
    const obj = typeData as Record<string, unknown>
    if ('variant' in obj) return parseBuildingType(obj.variant)
    if ('type' in obj) return parseBuildingType(obj.type)
    // Could be { DiamondMine: {} } format
    const keys = Object.keys(obj)
    if (keys.length === 1) return parseBuildingType(keys[0])
  }
  return 0
}

// Transform functions
function transformPlayer(data: ClashSchemaType['clash']['Player'], address: string): Player {
  return {
    address,
    username: hexToString(data.username),
    diamond: BigInt(data.diamond ?? '0'),
    gas: BigInt(data.gas ?? '0'),
    trophies: parseInt(data.trophies ?? '0', 10),
    townHallLevel: parseInt(data.town_hall_level ?? '1', 10),
    buildingCount: parseInt(data.building_count ?? '0', 10),
    totalBuilders: parseInt(data.total_builders ?? '1', 10),
    freeBuilders: parseInt(data.free_builders ?? '1', 10),
    maxBuilders: parseInt(data.max_builders ?? '1', 10),
    shieldUntil: BigInt(data.shield_until ?? '0'),
    lastAttackAt: BigInt(data.last_attack_at ?? '0'),
  }
}

function transformBuilding(data: ClashSchemaType['clash']['Building']): Building {
  return {
    owner: data.owner,
    buildingId: parseInt(data.building_id ?? '0', 10),
    buildingType: parseBuildingType(data.building_type),
    level: parseInt(data.level ?? '1', 10),
    x: parseInt(data.x ?? '0', 10),
    y: parseInt(data.y ?? '0', 10),
    health: parseInt(data.health ?? '100', 10),
    isUpgrading: data.is_upgrading ?? false,
    upgradeFinishTime: BigInt(data.upgrade_finish_time ?? '0'),
    lastCollectedAt: BigInt(data.last_collected_at ?? '0'),
  }
}

function parseTroopType(typeData: unknown): number {
  if (typeof typeData === 'number') return typeData
  if (typeof typeData === 'string') {
    const num = parseInt(typeData, 10)
    if (!isNaN(num)) return num
    const enumMap: Record<string, number> = {
      'Barbarian': TroopType.Barbarian,
      'Archer': TroopType.Archer,
      'Giant': TroopType.Giant,
    }
    return enumMap[typeData] ?? 0
  }
  if (typeof typeData === 'object' && typeData !== null) {
    const obj = typeData as Record<string, unknown>
    if ('variant' in obj) return parseTroopType(obj.variant)
    if ('type' in obj) return parseTroopType(obj.type)
    const keys = Object.keys(obj)
    if (keys.length === 1) return parseTroopType(keys[0])
  }
  return 0
}

function transformTrainingQueue(data: ClashSchemaType['clash']['TrainingQueue']): TrainingQueue {
  return {
    owner: data.owner,
    barracksId: parseInt(data.barracks_id ?? '0', 10),
    troopType: parseTroopType(data.troop_type),
    quantity: parseInt(data.quantity ?? '0', 10),
    finishTime: BigInt(data.finish_time ?? '0'),
  }
}

function transformBuilderQueue(data: ClashSchemaType['clash']['BuilderQueue']): BuilderQueue {
  return {
    owner: data.owner,
    isTraining: data.is_training ?? false,
    finishTime: BigInt(data.finish_time ?? '0'),
  }
}

function transformArmy(data: ClashSchemaType['clash']['Army']): Army {
  return {
    owner: data.owner,
    barbarians: parseInt(data.barbarians || '0', 10),
    archers: parseInt(data.archers || '0', 10),
    giants: parseInt(data.giants || '0', 10),
    totalSpaceUsed: parseInt(data.total_space_used || '0', 10),
    maxCapacity: parseInt(data.max_capacity || '0', 10),
    reservedSpace: parseInt(data.reserved_space || '0', 10),
  }
}

export function DojoProvider({ children }: { children: ReactNode }) {
  const [sdk, setSdk] = useState<SDK<ClashSchemaType> | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [army, setArmy] = useState<Army | null>(null)
  const [builderQueue, setBuilderQueue] = useState<BuilderQueue | null>(null)
  const [trainingQueues, setTrainingQueues] = useState<TrainingQueue[]>([])
  const [isPlacing, setIsPlacing] = useState(false)
  const [selectedBuildingType, setSelectedBuildingType] = useState<number | null>(null)
  const [isMoving, setIsMoving] = useState(false)
  const [movingBuildingId, setMovingBuildingId] = useState<number | null>(null)
  const subscriptionRef = useRef<Subscription | null>(null)

  // Initialize SDK
  useEffect(() => {
    const initSdk = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const database = await init<ClashSchemaType>({
          client: {
            toriiUrl: dojoConfig.toriiUrl,
            worldAddress: dojoConfig.worldAddress,
          },
          domain: {
            name: 'ClashPrototype',
            version: '1.0',
            chainId: 'KATANA',
            revision: '1',
          },
        })

        setSdk(database)
        setIsConnected(true)
        console.log('Dojo SDK initialized successfully')
      } catch (err) {
        console.error('Failed to initialize Dojo SDK:', err)
        setError('Failed to connect to Torii. Please make sure the server is running.')
        setIsConnected(false)
      } finally {
        setIsLoading(false)
      }
    }

    initSdk()

    return () => {
      // Cleanup subscription on unmount
      if (subscriptionRef.current) {
        subscriptionRef.current.free()
      }
    }
  }, [])

  // Fetch player data from Torii
  const fetchPlayerData = useCallback(async (address: string, silent = false): Promise<boolean> => {
    if (!sdk) {
      console.error('SDK not initialized')
      return false
    }

    try {
      if (!silent) setIsLoading(true)
      const paddedAddress = addAddressPadding(address)

      // Fetch Player entity
      const playerQuery = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          KeysClause(
            [MODELS.Player],
            [paddedAddress],
            'FixedLen'
          ).build()
        )

      const playerResponse = await sdk.getEntities({ query: playerQuery })
      const playerEntities = playerResponse.getItems()

      // Check if player exists
      let playerFound = false
      for (const entity of playerEntities) {
        const playerData = entity.models?.clash?.Player
        if (playerData) {
          const transformed = transformPlayer(playerData as ClashSchemaType['clash']['Player'], address)
          // Player entity may exist with town_hall_level=0 if not yet spawned
          if (transformed.townHallLevel === 0) {
            break
          }
          setPlayer(transformed)
          playerFound = true
          break
        }
      }

      if (!playerFound) {
        console.log('Player not found in Torii')
        setPlayer(null)
        setBuildings([])
        setArmy(null)
        return false
      }

      // Fetch Buildings for this owner
      const buildingsQuery = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          MemberClause(
            MODELS.Building,
            'owner',
            'Eq',
            paddedAddress
          ).build()
        )
        .withLimit(100)

      const buildingsResponse = await sdk.getEntities({ query: buildingsQuery })
      const buildingEntities = buildingsResponse.getItems()
      const fetchedBuildings: Building[] = []
      for (const entity of buildingEntities) {
        const buildingData = entity.models?.clash?.Building
        if (buildingData) {
          const b = transformBuilding(buildingData as ClashSchemaType['clash']['Building'])
          // Filter out zeroed buildings (level 0 and not under construction)
          if (b.level > 0 || b.isUpgrading) {
            fetchedBuildings.push(b)
          }
        }
      }
      setBuildings(fetchedBuildings)

      // Fetch Army
      const armyQuery = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          KeysClause(
            [MODELS.Army],
            [paddedAddress],
            'FixedLen'
          ).build()
        )

      const armyResponse = await sdk.getEntities({ query: armyQuery })
      const armyEntities = armyResponse.getItems()
      for (const entity of armyEntities) {
        const armyData = entity.models?.clash?.Army
        if (armyData) {
          setArmy(transformArmy(armyData as ClashSchemaType['clash']['Army']))
          break
        }
      }

      // Fetch BuilderQueue
      const builderQueueQuery = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          KeysClause(
            [MODELS.BuilderQueue],
            [paddedAddress],
            'FixedLen'
          ).build()
        )

      const builderQueueResponse = await sdk.getEntities({ query: builderQueueQuery })
      const builderQueueEntities = builderQueueResponse.getItems()
      for (const entity of builderQueueEntities) {
        const bqData = entity.models?.clash?.BuilderQueue
        if (bqData) {
          setBuilderQueue(transformBuilderQueue(bqData as ClashSchemaType['clash']['BuilderQueue']))
          break
        }
      }

      // Fetch TrainingQueues for barracks
      const trainingQuery = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          MemberClause(
            MODELS.TrainingQueue,
            'owner',
            'Eq',
            paddedAddress
          ).build()
        )
        .withLimit(20)

      const trainingResponse = await sdk.getEntities({ query: trainingQuery })
      const trainingEntities = trainingResponse.getItems()
      const fetchedQueues: TrainingQueue[] = []
      for (const entity of trainingEntities) {
        const tqData = entity.models?.clash?.TrainingQueue
        if (tqData) {
          const tq = transformTrainingQueue(tqData as ClashSchemaType['clash']['TrainingQueue'])
          if (tq.quantity > 0) {
            fetchedQueues.push(tq)
          }
        }
      }
      setTrainingQueues(fetchedQueues)

      // Set up subscriptions for real-time updates
      setupSubscriptions(address)

      return true
    } catch (err) {
      console.error('Failed to fetch player data:', err)
      if (!silent) setError('Failed to fetch player data from Torii')
      return false
    } finally {
      if (!silent) setIsLoading(false)
    }
  }, [sdk])

  // Fetch all spawned players from Torii
  const fetchAllPlayers = useCallback(async (excludeAddress?: string): Promise<Player[]> => {
    if (!sdk) return []

    try {
      const query = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          KeysClause(
            [MODELS.Player],
            [],
            'VariableLen'
          ).build()
        )
        .withLimit(100)

      const response = await sdk.getEntities({ query })
      const entities = response.getItems()
      const players: Player[] = []

      const excludePadded = excludeAddress ? addAddressPadding(excludeAddress).toLowerCase() : null

      for (const entity of entities) {
        const playerData = entity.models?.clash?.Player
        if (playerData && playerData.address) {
          const addr = playerData.address as string
          const transformed = transformPlayer(playerData as ClashSchemaType['clash']['Player'], addr)
          // Only include spawned players (town_hall_level > 0)
          if (transformed.townHallLevel === 0) continue
          // Exclude self
          if (excludePadded && addAddressPadding(addr).toLowerCase() === excludePadded) continue
          players.push(transformed)
        }
      }

      // Sort by trophies descending
      players.sort((a, b) => b.trophies - a.trophies)
      return players
    } catch (err) {
      console.error('Failed to fetch all players:', err)
      return []
    }
  }, [sdk])

  // Set up entity subscriptions for real-time updates
  const setupSubscriptions = useCallback(async (address: string) => {
    if (!sdk) return

    // Cancel existing subscription
    if (subscriptionRef.current) {
      subscriptionRef.current.free()
    }

    try {
      const paddedAddress = addAddressPadding(address)

      // Subscribe to player updates
      const subscriptionQuery = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          KeysClause(
            [MODELS.Player, MODELS.Building, MODELS.Army, MODELS.BuilderQueue],
            [paddedAddress],
            'FixedLen'
          ).build()
        )

      const [_initialData, subscription] = await sdk.subscribeEntityQuery({
        query: subscriptionQuery,
        callback: ({ data, error: subError }: { data?: StandardizedQueryResult<ClashSchemaType>; error?: Error }) => {
          if (subError) {
            console.error('Subscription error:', subError)
            return
          }

          if (data) {
            for (const entity of data) {
              // Handle Player updates
              const playerData = entity.models?.clash?.Player
              if (playerData) {
                const transformed = transformPlayer(playerData as ClashSchemaType['clash']['Player'], address)
                // Player with town_hall_level=0 is not spawned
                if (transformed.townHallLevel === 0) {
                  setPlayer(null)
                  setBuildings([])
                  setArmy(null)
                } else {
                  setPlayer(transformed)
                }
              }

              // Handle Building updates
              const buildingData = entity.models?.clash?.Building
              if (buildingData) {
                const newBuilding = transformBuilding(buildingData as ClashSchemaType['clash']['Building'])
                // Remove zeroed buildings (level=0, not upgrading)
                if (newBuilding.level === 0 && !newBuilding.isUpgrading) {
                  setBuildings(prev => prev.filter(b => b.buildingId !== newBuilding.buildingId))
                } else {
                  setBuildings(prev => {
                    const existing = prev.findIndex(b => b.buildingId === newBuilding.buildingId)
                    if (existing >= 0) {
                      const updated = [...prev]
                      updated[existing] = newBuilding
                      return updated
                    }
                    return [...prev, newBuilding]
                  })
                }
              }

              // Handle Army updates
              const armyData = entity.models?.clash?.Army
              if (armyData) {
                setArmy(transformArmy(armyData as ClashSchemaType['clash']['Army']))
              }

              // Handle BuilderQueue updates
              const bqData = entity.models?.clash?.BuilderQueue
              if (bqData) {
                setBuilderQueue(transformBuilderQueue(bqData as ClashSchemaType['clash']['BuilderQueue']))
              }
            }
          }
        }
      })

      subscriptionRef.current = subscription
      console.log('Entity subscriptions set up successfully')
    } catch (err) {
      console.error('Failed to set up subscriptions:', err)
    }
  }, [sdk])

  // Fetch defender's buildings for attack screen
  const fetchDefenderBuildings = useCallback(async (address: string): Promise<Building[]> => {
    if (!sdk) return []

    try {
      const paddedAddress = addAddressPadding(address)

      const buildingsQuery = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          MemberClause(
            MODELS.Building,
            'owner',
            'Eq',
            paddedAddress
          ).build()
        )
        .withLimit(100)

      const buildingsResponse = await sdk.getEntities({ query: buildingsQuery })
      const buildingEntities = buildingsResponse.getItems()
      const fetchedBuildings: Building[] = []
      for (const entity of buildingEntities) {
        const buildingData = entity.models?.clash?.Building
        if (buildingData) {
          fetchedBuildings.push(transformBuilding(buildingData as ClashSchemaType['clash']['Building']))
        }
      }
      return fetchedBuildings
    } catch (err) {
      console.error('Failed to fetch defender buildings:', err)
      return []
    }
  }, [sdk])

  // Fetch battle data (battle counter for latest ID, or specific battle)
  const fetchBattleData = useCallback(async (battleId?: number): Promise<BattleResultData | number | null> => {
    if (!sdk) return null

    try {
      if (battleId !== undefined) {
        // Fetch specific battle with full data
        const battleQuery = new ToriiQueryBuilder<ClashSchemaType>()
          .withClause(
            KeysClause(
              [MODELS.Battle],
              [battleId.toString()],
              'FixedLen'
            ).build()
          )

        const response = await sdk.getEntities({ query: battleQuery })
        const entities = response.getItems()
        for (const entity of entities) {
          const battleData = entity.models?.clash?.Battle
          if (battleData) {
            return {
              destructionPercent: parseInt(battleData.destruction_percent || '0', 10),
              diamondStolen: BigInt(battleData.diamond_stolen || '0'),
              gasStolen: BigInt(battleData.gas_stolen || '0'),
              trophiesChange: parseInt(battleData.attacker_trophies_change || '0', 10),
              troopsDeployed: parseInt(battleData.deployed_troop_count || '0', 10),
            }
          }
        }
        return null
      } else {
        // Fetch battle counter to get the latest battle ID
        const counterQuery = new ToriiQueryBuilder<ClashSchemaType>()
          .withClause(
            KeysClause(
              [MODELS.BattleCounter],
              ['0'],
              'FixedLen'
            ).build()
          )

        const response = await sdk.getEntities({ query: counterQuery })
        const entities = response.getItems()
        for (const entity of entities) {
          const counterData = entity.models?.clash?.BattleCounter
          if (counterData) {
            // Return the latest battle ID (next_battle_id - 1)
            const nextId = parseInt(counterData.next_battle_id || '0', 10)
            return nextId > 0 ? nextId - 1 : null
          }
        }
        return null
      }
    } catch (err) {
      console.error('Failed to fetch battle data:', err)
      return null
    }
  }, [sdk])

  // Fetch battle history for a player (both as attacker and defender)
  const fetchBattleHistory = useCallback(async (address: string): Promise<BattleRecord[]> => {
    if (!sdk) return []

    try {
      const paddedAddress = addAddressPadding(address)
      const battles: BattleRecord[] = []

      // Query battles where player is attacker
      const attackerQuery = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          MemberClause(
            MODELS.Battle,
            'attacker',
            'Eq',
            paddedAddress
          ).build()
        )
        .withLimit(50)

      const attackerResponse = await sdk.getEntities({ query: attackerQuery })
      for (const entity of attackerResponse.getItems()) {
        const b = entity.models?.clash?.Battle
        if (b && b.status !== 'Preparing') {
          battles.push({
            battleId: parseInt(b.battle_id || '0', 10),
            attacker: b.attacker || '',
            defender: b.defender || '',
            status: typeof b.status === 'string' ? b.status : 'Ended',
            destructionPercent: parseInt(b.destruction_percent || '0', 10),
            diamondStolen: BigInt(b.diamond_stolen || '0'),
            gasStolen: BigInt(b.gas_stolen || '0'),
            attackerTrophiesChange: parseInt(b.attacker_trophies_change || '0', 10),
            defenderTrophiesChange: parseInt(b.defender_trophies_change || '0', 10),
            startedAt: BigInt(b.started_at || '0'),
          })
        }
      }

      // Query battles where player is defender
      const defenderQuery = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          MemberClause(
            MODELS.Battle,
            'defender',
            'Eq',
            paddedAddress
          ).build()
        )
        .withLimit(50)

      const defenderResponse = await sdk.getEntities({ query: defenderQuery })
      for (const entity of defenderResponse.getItems()) {
        const b = entity.models?.clash?.Battle
        if (b && b.status !== 'Preparing') {
          // Avoid duplicates (unlikely but safe)
          const id = parseInt(b.battle_id || '0', 10)
          if (!battles.find(existing => existing.battleId === id)) {
            battles.push({
              battleId: id,
              attacker: b.attacker || '',
              defender: b.defender || '',
              status: typeof b.status === 'string' ? b.status : 'Ended',
              destructionPercent: parseInt(b.destruction_percent || '0', 10),
              diamondStolen: BigInt(b.diamond_stolen || '0'),
              gasStolen: BigInt(b.gas_stolen || '0'),
              attackerTrophiesChange: parseInt(b.attacker_trophies_change || '0', 10),
              defenderTrophiesChange: parseInt(b.defender_trophies_change || '0', 10),
              startedAt: BigInt(b.started_at || '0'),
            })
          }
        }
      }

      // Sort by battle ID descending (newest first)
      battles.sort((a, b) => b.battleId - a.battleId)
      return battles
    } catch (err) {
      console.error('Failed to fetch battle history:', err)
      return []
    }
  }, [sdk])

  const refreshData = useCallback(() => {
    if (player?.address) {
      fetchPlayerData(player.address, true)
    }
  }, [player?.address, fetchPlayerData])

  return (
    <DojoContext.Provider
      value={{
        isConnected,
        isLoading,
        error,
        player,
        buildings,
        army,
        builderQueue,
        trainingQueues,
        setPlayer,
        setBuildings,
        setArmy,
        setBuilderQueue,
        setTrainingQueues,
        fetchPlayerData,
        fetchAllPlayers,
        fetchDefenderBuildings,
        fetchBattleData,
        fetchBattleHistory,
        refreshData,
        isPlacing,
        selectedBuildingType,
        setIsPlacing,
        setSelectedBuildingType,
        isMoving,
        movingBuildingId,
        setIsMoving,
        setMovingBuildingId,
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
