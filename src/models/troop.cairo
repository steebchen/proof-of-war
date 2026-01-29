#[derive(Copy, Drop, Serde, PartialEq, Introspect)]
pub enum TroopType {
    Barbarian,
    Archer,
}

// Troop configuration/stats (not stored as model, just helper struct)
#[derive(Copy, Drop)]
pub struct TroopConfig {
    pub troop_type: TroopType,
    pub health: u32,
    pub damage: u32,
    pub training_time: u64,      // seconds
    pub training_cost_elixir: u64,
    pub housing_space: u8,
    pub attack_range: u8,        // 1 = melee, >1 = ranged
    pub movement_speed: u8,
}

pub fn get_troop_config(troop_type: TroopType) -> TroopConfig {
    match troop_type {
        TroopType::Barbarian => TroopConfig {
            troop_type: TroopType::Barbarian,
            health: 45,
            damage: 8,
            training_time: 20,
            training_cost_elixir: 25,
            housing_space: 1,
            attack_range: 1,
            movement_speed: 2,
        },
        TroopType::Archer => TroopConfig {
            troop_type: TroopType::Archer,
            health: 20,
            damage: 7,
            training_time: 25,
            training_cost_elixir: 50,
            housing_space: 1,
            attack_range: 4,
            movement_speed: 2,
        },
    }
}
