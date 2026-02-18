// TypeScript types matching Cairo models for Torii queries

export type ClashSchemaType = {
  clash: {
    Player: {
      address: string
      username: string // felt252 as hex string
      diamond: string // u64 as string
      gas: string // u64 as string
      trophies: string // u32 as string
      town_hall_level: string // u8 as string
      building_count: string // u32 as string
      last_collected_at: string // u64 as string
      total_builders: string // u8 as string
      free_builders: string // u8 as string
      max_builders: string // u8 as string
      shield_until: string // u64 as string
    }
    Building: {
      owner: string
      building_id: string // u32 as string
      building_type: string // enum variant as string
      level: string // u8 as string
      x: string // u8 as string
      y: string // u8 as string
      health: string // u32 as string
      is_upgrading: boolean
      upgrade_finish_time: string // u64 as string
      last_collected_at: string // u64 as string
    }
    Army: {
      owner: string
      barbarians: string // u16 as string
      archers: string // u16 as string
      total_space_used: string // u16 as string
      max_capacity: string // u16 as string
    }
    TrainingQueue: {
      owner: string
      barracks_id: string // u32 as string
      troop_type: string // enum variant as string
      quantity: string // u8 as string
      finish_time: string // u64 as string
    }
    BuilderQueue: {
      owner: string
      is_training: boolean
      finish_time: string // u64 as string
    }
    Battle: {
      battle_id: string // u32 as string
      attacker: string
      defender: string
      status: string // enum variant as string
      started_at: string // u64 as string
      ends_at: string // u64 as string
      destruction_percent: string // u8 as string
      diamond_stolen: string // u64 as string
      gas_stolen: string // u64 as string
      attacker_trophies_change: string // i32 as string
      defender_trophies_change: string // i32 as string
      deployed_troop_count: string // u32 as string
      building_count: string // u32 as string
      tick_count: string // u32 as string
    }
    DeployedTroop: {
      battle_id: string // u32 as string
      troop_id: string // u32 as string
      troop_type: string // enum variant as string
      x: string // u16 as string
      y: string // u16 as string
      health: string // u32 as string
      is_alive: boolean
      target_building_id: string // u32 as string
    }
    BattleBuilding: {
      battle_id: string // u32 as string
      building_id: string // u32 as string
      building_type: string // enum variant as string
      level: string // u8 as string
      x: string // u8 as string
      y: string // u8 as string
      max_health: string // u32 as string
      current_health: string // u32 as string
      is_destroyed: boolean
      diamond_loot: string // u64 as string
      gas_loot: string // u64 as string
    }
    BattleCounter: {
      counter_id: string // u8 as string
      next_battle_id: string // u32 as string
    }
  }
}

// Model names for Torii queries
export const MODELS = {
  Player: 'clash-Player',
  Building: 'clash-Building',
  Army: 'clash-Army',
  TrainingQueue: 'clash-TrainingQueue',
  BuilderQueue: 'clash-BuilderQueue',
  Battle: 'clash-Battle',
  DeployedTroop: 'clash-DeployedTroop',
  BattleBuilding: 'clash-BattleBuilding',
  BattleCounter: 'clash-BattleCounter',
} as const
