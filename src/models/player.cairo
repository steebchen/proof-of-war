use starknet::ContractAddress;

#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct Player {
    #[key]
    pub address: ContractAddress,
    pub username: felt252,
    pub diamond: u64,
    pub gas: u64,
    pub trophies: u32,
    pub town_hall_level: u8,
    pub building_count: u32,
    pub last_collected_at: u64,
    pub total_builders: u8,
    pub free_builders: u8,
    pub max_builders: u8,
    pub shield_until: u64,
    pub last_attack_at: u64,
    pub clan_id: u32,
}
