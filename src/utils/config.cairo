use clash_prototype::models::building::BuildingType;

// Grid size
pub const GRID_SIZE: u8 = 40;

// Starting resources
pub const STARTING_GOLD: u64 = 500;
pub const STARTING_ELIXIR: u64 = 500;

// Resource production rate: units produced per minute per level.
// Tune this single value to speed up or slow down all resource generation.
pub const RESOURCE_PRODUCTION_PER_MIN: u64 = 10;

// Building costs (gold, elixir) per type
#[derive(Copy, Drop)]
pub struct BuildingCost {
    pub gold: u64,
    pub elixir: u64,
}

pub fn get_building_cost(building_type: BuildingType, level: u8) -> BuildingCost {
    // Base costs for level 1
    let base_cost = match building_type {
        BuildingType::TownHall => BuildingCost { gold: 500, elixir: 500 },
        BuildingType::GoldMine => BuildingCost { gold: 150, elixir: 0 },
        BuildingType::ElixirCollector => BuildingCost { gold: 150, elixir: 0 },
        BuildingType::GoldStorage => BuildingCost { gold: 300, elixir: 0 },
        BuildingType::ElixirStorage => BuildingCost { gold: 300, elixir: 0 },
        BuildingType::Barracks => BuildingCost { gold: 0, elixir: 200 },
        BuildingType::ArmyCamp => BuildingCost { gold: 0, elixir: 250 },
        BuildingType::Cannon => BuildingCost { gold: 250, elixir: 0 },
        BuildingType::ArcherTower => BuildingCost { gold: 0, elixir: 300 },
        BuildingType::Wall => BuildingCost { gold: 50, elixir: 0 },
    };

    // Scale cost by level (multiply by level for simplicity)
    BuildingCost {
        gold: base_cost.gold * level.into(),
        elixir: base_cost.elixir * level.into(),
    }
}

// Building health at level 1
pub fn get_building_health(building_type: BuildingType, level: u8) -> u32 {
    let base_health: u32 = match building_type {
        BuildingType::TownHall => 1500,
        BuildingType::GoldMine => 400,
        BuildingType::ElixirCollector => 400,
        BuildingType::GoldStorage => 500,
        BuildingType::ElixirStorage => 500,
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
        BuildingType::GoldStorage => 1500,
        BuildingType::ElixirStorage => 1500,
        BuildingType::TownHall => 1000, // Town hall has some storage
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
        BuildingType::GoldMine => 3,
        BuildingType::ElixirCollector => 3,
        BuildingType::GoldStorage => 3,
        BuildingType::ElixirStorage => 3,
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
        BuildingType::GoldMine => town_hall_level + 1,
        BuildingType::ElixirCollector => town_hall_level + 1,
        BuildingType::GoldStorage => town_hall_level,
        BuildingType::ElixirStorage => town_hall_level,
        BuildingType::Barracks => 1 + (town_hall_level / 3),
        BuildingType::ArmyCamp => 1 + (town_hall_level / 2),
        BuildingType::Cannon => town_hall_level,
        BuildingType::ArcherTower => if town_hall_level >= 2 { town_hall_level - 1 } else { 0 },
        BuildingType::Wall => town_hall_level * 25,
    }
}

// Upgrade time in seconds
pub fn get_upgrade_time(building_type: BuildingType, level: u8) -> u64 {
    let base_time: u64 = match building_type {
        BuildingType::TownHall => 3600, // 1 hour
        BuildingType::GoldMine => 300,  // 5 minutes
        BuildingType::ElixirCollector => 300,
        BuildingType::GoldStorage => 600,
        BuildingType::ElixirStorage => 600,
        BuildingType::Barracks => 900,
        BuildingType::ArmyCamp => 600,
        BuildingType::Cannon => 900,
        BuildingType::ArcherTower => 900,
        BuildingType::Wall => 60, // 1 minute
    };

    base_time * level.into()
}

// Battle duration in seconds
pub const BATTLE_DURATION: u64 = 180; // 3 minutes

// Trophy gains/losses
pub const TROPHY_WIN_BASE: i32 = 30;
pub const TROPHY_LOSS_BASE: i32 = -20;

// Loot percentages (percentage of stored resources that can be stolen)
pub const LOOT_PERCENTAGE: u64 = 20; // 20% of stored resources
