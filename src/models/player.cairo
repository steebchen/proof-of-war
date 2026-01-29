use starknet::ContractAddress;

#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct Player {
    #[key]
    pub address: ContractAddress,
    pub username: felt252,
    pub gold: u64,
    pub elixir: u64,
    pub trophies: u32,
    pub town_hall_level: u8,
    pub building_count: u32,
    pub last_collected_at: u64,
}
