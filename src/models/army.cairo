use starknet::ContractAddress;
use super::troop::TroopType;

#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct Army {
    #[key]
    pub owner: ContractAddress,
    pub barbarians: u16,
    pub archers: u16,
    pub giants: u16,
    pub total_space_used: u16,
    pub max_capacity: u16,
    pub reserved_space: u16,
}

#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct TrainingQueue {
    #[key]
    pub owner: ContractAddress,
    #[key]
    pub barracks_id: u32,
    pub troop_type: TroopType,
    pub quantity: u8,
    pub finish_time: u64,
}

#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct BuilderQueue {
    #[key]
    pub owner: ContractAddress,
    pub is_training: bool,
    pub finish_time: u64,
}
