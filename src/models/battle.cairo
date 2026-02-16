use starknet::ContractAddress;
use super::troop::TroopType;
use super::building::BuildingType;

#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug, DojoStore, Default)]
pub enum BattleStatus {
    #[default]
    Preparing,   // Attacker deploying troops
    InProgress,  // Combat happening
    Ended,       // Battle finished
}

#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct Battle {
    #[key]
    pub battle_id: u32,
    pub attacker: ContractAddress,
    pub defender: ContractAddress,
    pub status: BattleStatus,
    pub started_at: u64,
    pub ends_at: u64,
    pub destruction_percent: u8,
    pub diamond_stolen: u64,
    pub gas_stolen: u64,
    pub attacker_trophies_change: i32,
    pub defender_trophies_change: i32,
    pub deployed_troop_count: u32,
    pub building_count: u32,
}

#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct DeployedTroop {
    #[key]
    pub battle_id: u32,
    #[key]
    pub troop_id: u32,
    pub troop_type: TroopType,
    pub x: u16,
    pub y: u16,
    pub health: u32,
    pub is_alive: bool,
    pub target_building_id: u32,
}

// Snapshot of defender's building during battle
#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct BattleBuilding {
    #[key]
    pub battle_id: u32,
    #[key]
    pub building_id: u32,
    pub building_type: BuildingType,
    pub x: u8,
    pub y: u8,
    pub max_health: u32,
    pub current_health: u32,
    pub is_destroyed: bool,
    pub diamond_loot: u64,
    pub gas_loot: u64,
}

// Global counter for battle IDs
#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct BattleCounter {
    #[key]
    pub counter_id: u8,  // Always 0, singleton
    pub next_battle_id: u32,
}
