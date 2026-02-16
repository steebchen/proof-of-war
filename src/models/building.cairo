use starknet::ContractAddress;

#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug, DojoStore, Default)]
pub enum BuildingType {
    #[default]
    TownHall,
    DiamondMine,
    GasCollector,
    DiamondStorage,
    GasStorage,
    Barracks,
    ArmyCamp,
    Cannon,
    ArcherTower,
    Wall,
}

#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct Building {
    #[key]
    pub owner: ContractAddress,
    #[key]
    pub building_id: u32,
    pub building_type: BuildingType,
    pub level: u8,
    pub x: u8,
    pub y: u8,
    pub health: u32,
    pub is_upgrading: bool,
    pub upgrade_finish_time: u64,
    pub last_collected_at: u64,
}

// Helper to get building size (width, height)
pub fn get_building_size(building_type: BuildingType) -> (u8, u8) {
    match building_type {
        BuildingType::TownHall => (4, 4),
        BuildingType::DiamondMine => (3, 3),
        BuildingType::GasCollector => (3, 3),
        BuildingType::DiamondStorage => (3, 3),
        BuildingType::GasStorage => (3, 3),
        BuildingType::Barracks => (3, 3),
        BuildingType::ArmyCamp => (4, 4),
        BuildingType::Cannon => (3, 3),
        BuildingType::ArcherTower => (3, 3),
        BuildingType::Wall => (1, 1),
    }
}
