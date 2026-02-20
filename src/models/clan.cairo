use starknet::ContractAddress;

#[derive(Serde, Copy, Drop, Introspect, PartialEq, Debug, DojoStore, Default)]
pub enum ClanRole {
    #[default]
    Member,
    Elder,
    CoLeader,
    Leader,
}

#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct Clan {
    #[key]
    pub clan_id: u32,
    pub name: felt252,
    pub leader: ContractAddress,
    pub member_count: u16,
    pub max_members: u16,
    pub total_trophies: u32,
    pub required_trophies: u32,
    pub is_open: bool,
    pub created_at: u64,
}

#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct ClanMember {
    #[key]
    pub clan_id: u32,
    #[key]
    pub member: ContractAddress,
    pub role: ClanRole,
    pub joined_at: u64,
    pub donated_troops: u32,
    pub received_troops: u32,
}

// Global counter for clan IDs (singleton with counter_id = 0)
#[derive(Clone, Drop, Serde)]
#[dojo::model]
pub struct ClanCounter {
    #[key]
    pub counter_id: u8, // Always 0, singleton
    pub next_clan_id: u32,
}
