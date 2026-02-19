use clash_prototype::models::building::BuildingType;

// Grid size
pub const GRID_SIZE: u8 = 40;

// Starting resources
pub const STARTING_DIAMOND: u64 = 2000;
pub const STARTING_GAS: u64 = 1000;

// Builder (worker) training at Command Center
pub const MAX_BUILDERS: u8 = 5;
pub const BUILDER_TRAINING_COST: u64 = 150; // gas

// Exponential training times: 2nd=60s, 3rd=1h, 4th=2d, 5th=5d, (6th would be 15d but max is 5)
pub fn get_builder_training_time(total_builders: u8) -> u64 {
    match total_builders {
        1 => 60,           // 2nd worker: 1 minute
        2 => 3600,         // 3rd worker: 1 hour
        3 => 172800,       // 4th worker: 2 days
        4 => 432000,       // 5th worker: 5 days
        _ => 1296000,      // fallback: 15 days
    }
}

// Resource production rate: units produced per minute per level.
// Tune this single value to speed up or slow down all resource generation.
pub const RESOURCE_PRODUCTION_PER_MIN: u64 = 10;

// Building costs (diamond, gas) per type
#[derive(Copy, Drop)]
pub struct BuildingCost {
    pub diamond: u64,
    pub gas: u64,
}

pub fn get_building_cost(building_type: BuildingType, level: u8) -> BuildingCost {
    // Base costs for level 1
    let base_cost = match building_type {
        BuildingType::TownHall => BuildingCost { diamond: 500, gas: 500 },
        BuildingType::DiamondMine => BuildingCost { diamond: 150, gas: 0 },
        BuildingType::GasCollector => BuildingCost { diamond: 150, gas: 0 },
        BuildingType::DiamondStorage => BuildingCost { diamond: 300, gas: 0 },
        BuildingType::GasStorage => BuildingCost { diamond: 300, gas: 0 },
        BuildingType::Barracks => BuildingCost { diamond: 0, gas: 200 },
        BuildingType::ArmyCamp => BuildingCost { diamond: 0, gas: 250 },
        BuildingType::Cannon => BuildingCost { diamond: 250, gas: 0 },
        BuildingType::ArcherTower => BuildingCost { diamond: 0, gas: 300 },
        BuildingType::Wall => BuildingCost { diamond: 50, gas: 0 },
    };

    // Scale cost by level (multiply by level for simplicity)
    BuildingCost {
        diamond: base_cost.diamond * level.into(),
        gas: base_cost.gas * level.into(),
    }
}

// Building health by level (level must be >= 1)
pub fn get_building_health(building_type: BuildingType, level: u8) -> u32 {
    assert(level > 0, 'Level must be > 0');
    let base_health: u32 = match building_type {
        BuildingType::TownHall => 1500,
        BuildingType::DiamondMine => 400,
        BuildingType::GasCollector => 400,
        BuildingType::DiamondStorage => 500,
        BuildingType::GasStorage => 500,
        BuildingType::Barracks => 350,
        BuildingType::ArmyCamp => 300,
        BuildingType::Cannon => 420,
        BuildingType::ArcherTower => 380,
        BuildingType::Wall => 300,
    };

    // +25% per level
    base_health + (base_health * (level.into() - 1) / 4)
}

// Storage capacity per level
pub fn get_storage_capacity(building_type: BuildingType, level: u8) -> u64 {
    let base_capacity: u64 = match building_type {
        BuildingType::DiamondStorage => 1500,
        BuildingType::GasStorage => 1500,
        BuildingType::TownHall => 2500, // Town hall has some storage
        _ => 0,
    };

    base_capacity * level.into()
}

// Army camp capacity per level
pub fn get_army_camp_capacity(level: u8) -> u16 {
    20_u16 * level.into()  // 20 troops per level
}

// Defense stats
#[derive(Copy, Drop)]
pub struct DefenseStats {
    pub damage: u32,
    pub range: u8,
    pub attack_speed: u8, // attacks per second * 10
}

pub fn get_defense_stats(building_type: BuildingType, level: u8) -> DefenseStats {
    match building_type {
        BuildingType::Cannon => DefenseStats {
            damage: 8 + (level.into() * 2),
            range: 9,
            attack_speed: 8, // 0.8 per second
        },
        BuildingType::ArcherTower => DefenseStats {
            damage: 6 + (level.into() * 1),
            range: 10,
            attack_speed: 10, // 1 per second
        },
        _ => DefenseStats { damage: 0, range: 0, attack_speed: 0 },
    }
}

// Maximum level a building can be upgraded to
pub fn get_max_level(building_type: BuildingType) -> u8 {
    match building_type {
        BuildingType::TownHall => 5,
        BuildingType::DiamondMine => 3,
        BuildingType::GasCollector => 3,
        BuildingType::DiamondStorage => 3,
        BuildingType::GasStorage => 3,
        BuildingType::Barracks => 3,
        BuildingType::ArmyCamp => 3,
        BuildingType::Cannon => 3,
        BuildingType::ArcherTower => 3,
        BuildingType::Wall => 3,
    }
}

// Max building counts per town hall level
pub fn get_max_building_count(building_type: BuildingType, town_hall_level: u8) -> u8 {
    match building_type {
        BuildingType::TownHall => 1,
        BuildingType::DiamondMine => town_hall_level + 1,
        BuildingType::GasCollector => town_hall_level + 1,
        BuildingType::DiamondStorage => town_hall_level,
        BuildingType::GasStorage => town_hall_level,
        BuildingType::Barracks => 1 + (town_hall_level / 3),
        BuildingType::ArmyCamp => 1,
        BuildingType::Cannon => town_hall_level,
        BuildingType::ArcherTower => if town_hall_level >= 2 { town_hall_level - 1 } else { 0 },
        BuildingType::Wall => town_hall_level * 25,
    }
}

// Initial construction time for placing a new building (level 0 → 1)
pub fn get_build_time(building_type: BuildingType) -> u64 {
    match building_type {
        BuildingType::TownHall => 0, // spawned instantly
        BuildingType::DiamondMine => 3,
        BuildingType::GasCollector => 3,
        BuildingType::DiamondStorage => 5,
        BuildingType::GasStorage => 5,
        BuildingType::Barracks => 10,
        BuildingType::ArmyCamp => 10,
        BuildingType::Cannon => 30,
        BuildingType::ArcherTower => 30,
        BuildingType::Wall => 1,
    }
}

// Upgrade time in seconds
pub fn get_upgrade_time(building_type: BuildingType, level: u8) -> u64 {
    let base_time: u64 = match building_type {
        BuildingType::TownHall => 3600, // 1 hour
        BuildingType::DiamondMine => 300,  // 5 minutes
        BuildingType::GasCollector => 300,
        BuildingType::DiamondStorage => 600,
        BuildingType::GasStorage => 600,
        BuildingType::Barracks => 900,
        BuildingType::ArmyCamp => 600,
        BuildingType::Cannon => 900,
        BuildingType::ArcherTower => 900,
        BuildingType::Wall => 60, // 1 minute
    };

    base_time * level.into()
}

// Shield duration after being attacked (in seconds)
pub const SHIELD_DURATION: u64 = 60; // 1 minute (dev/testing)

// Battle duration in seconds
pub const BATTLE_DURATION: u64 = 3600; // 1 hour (generous for dev/testing)

// Number of simulation ticks per battle resolve
// With movement speed 8, troops cross ~150px in ~19 ticks. 30 ticks is enough.
pub const TICKS_PER_BATTLE: u32 = 30;

// Trophy gains/losses
pub const TROPHY_WIN_BASE: i32 = 30;
pub const TROPHY_LOSS_BASE: i32 = -20;

// Loot percentages (percentage of stored resources that can be stolen)
pub const LOOT_PERCENTAGE: u64 = 20; // 20% of stored resources
pub const LOOT_PROTECTION: u64 = 500; // Resources below this threshold cannot be looted

// Spell system
pub const SPELL_UNLOCK_TH_LEVEL: u8 = 3; // Town Hall level required to use spells
pub const MAX_SPELLS_PER_BATTLE: u32 = 3; // Maximum spells per battle
pub const SPELL_RADIUS: u32 = 30; // Spell effect radius in pixel coords (3 tiles * 10)

pub const LIGHTNING_COST_DIAMOND: u64 = 100;
pub const LIGHTNING_DAMAGE: u32 = 200;

pub const HEAL_COST_DIAMOND: u64 = 75;
pub const HEAL_AMOUNT: u32 = 150;

pub const RAGE_COST_DIAMOND: u64 = 150;

// Attack cooldown between battles (in seconds)
pub const ATTACK_COOLDOWN: u64 = 5;
