#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug, DojoStore, Default)]
pub enum TroopType {
    #[default]
    Barbarian,
    Archer,
    Giant,
}

// Troop configuration/stats (not stored as model, just helper struct)
#[derive(Copy, Drop)]
pub struct TroopConfig {
    pub troop_type: TroopType,
    pub health: u32,
    pub damage: u32,
    pub training_time: u64,      // seconds
    pub training_cost_gas: u64,
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
            training_cost_gas: 25,
            housing_space: 1,
            attack_range: 1,
            movement_speed: 2,
        },
        TroopType::Archer => TroopConfig {
            troop_type: TroopType::Archer,
            health: 20,
            damage: 7,
            training_time: 25,
            training_cost_gas: 50,
            housing_space: 1,
            attack_range: 4,
            movement_speed: 2,
        },
        TroopType::Giant => TroopConfig {
            troop_type: TroopType::Giant,
            health: 300,
            damage: 12,
            training_time: 60,
            training_cost_gas: 150,
            housing_space: 5,
            attack_range: 1,
            movement_speed: 1,
        },
    }
}

// Returns true if this troop type targets defenses first
pub fn targets_defenses(troop_type: TroopType) -> bool {
    match troop_type {
        TroopType::Giant => true,
        _ => false,
    }
}
