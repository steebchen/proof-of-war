// TypeScript types matching Cairo models for Torii queries

export type ClashSchemaType = {
  clash: {
    Player: {
      address: string
      username: string // felt252 as hex string
      gold: string // u64 as string
      elixir: string // u64 as string
      trophies: string // u32 as string
      town_hall_level: string // u8 as string
      building_count: string // u32 as string
      last_collected_at: string // u64 as string
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
  }
}

// Model names for Torii queries
export const MODELS = {
  Player: 'clash-Player',
  Building: 'clash-Building',
  Army: 'clash-Army',
  TrainingQueue: 'clash-TrainingQueue',
} as const
