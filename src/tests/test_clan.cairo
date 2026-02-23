use starknet::ContractAddress;
use dojo::model::ModelStorage;
use dojo::world::{WorldStorageTrait, world};
use dojo_cairo_test::{
    spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
    WorldStorageTestTrait,
};

use clash_prototype::models::player::{Player, m_Player};
use clash_prototype::models::building::{m_Building};
use clash_prototype::models::army::{m_Army, m_BuilderQueue, m_TrainingQueue};
use clash_prototype::models::battle::{
    m_Battle, m_DeployedTroop, m_BattleBuilding, m_BattleCounter, m_DeployedSpell,
};
use clash_prototype::models::clan::{Clan, ClanMember, ClanRole, m_Clan, m_ClanMember, m_ClanCounter};
use clash_prototype::systems::village::{village, IVillageDispatcher, IVillageDispatcherTrait, e_PlayerSpawned};
use clash_prototype::systems::building::{building_system, e_BuildingPlaced, e_BuildingUpgraded, e_BuildingRemoved, e_BuildingRepaired};
use clash_prototype::systems::training::{training_system, e_TroopsTrainingStarted, e_TroopsCollected};
use clash_prototype::systems::resource::{resource_system, e_ResourcesCollected};
use clash_prototype::systems::combat::{combat_system, e_BattleStarted, e_TroopDeployed, e_SpellDeployed, e_BattleEnded};
use clash_prototype::systems::clan::{
    clan_system, IClanDispatcher, IClanDispatcherTrait,
    e_ClanCreated, e_MemberJoined, e_MemberLeft, e_MemberPromoted, e_MemberDemoted,
    e_MemberKicked, e_LeadershipTransferred,
};

fn namespace_def() -> NamespaceDef {
    let ndef = NamespaceDef {
        namespace: "clash",
        resources: [
            // Models
            TestResource::Model(m_Player::TEST_CLASS_HASH),
            TestResource::Model(m_Building::TEST_CLASS_HASH),
            TestResource::Model(m_Army::TEST_CLASS_HASH),
            TestResource::Model(m_BuilderQueue::TEST_CLASS_HASH),
            TestResource::Model(m_TrainingQueue::TEST_CLASS_HASH),
            TestResource::Model(m_Battle::TEST_CLASS_HASH),
            TestResource::Model(m_DeployedTroop::TEST_CLASS_HASH),
            TestResource::Model(m_BattleBuilding::TEST_CLASS_HASH),
            TestResource::Model(m_BattleCounter::TEST_CLASS_HASH),
            TestResource::Model(m_DeployedSpell::TEST_CLASS_HASH),
            TestResource::Model(m_Clan::TEST_CLASS_HASH),
            TestResource::Model(m_ClanMember::TEST_CLASS_HASH),
            TestResource::Model(m_ClanCounter::TEST_CLASS_HASH),
            // Events
            TestResource::Event(e_PlayerSpawned::TEST_CLASS_HASH),
            TestResource::Event(e_BuildingPlaced::TEST_CLASS_HASH),
            TestResource::Event(e_BuildingUpgraded::TEST_CLASS_HASH),
            TestResource::Event(e_BuildingRemoved::TEST_CLASS_HASH),
            TestResource::Event(e_BuildingRepaired::TEST_CLASS_HASH),
            TestResource::Event(e_TroopsTrainingStarted::TEST_CLASS_HASH),
            TestResource::Event(e_TroopsCollected::TEST_CLASS_HASH),
            TestResource::Event(e_ResourcesCollected::TEST_CLASS_HASH),
            TestResource::Event(e_BattleStarted::TEST_CLASS_HASH),
            TestResource::Event(e_TroopDeployed::TEST_CLASS_HASH),
            TestResource::Event(e_SpellDeployed::TEST_CLASS_HASH),
            TestResource::Event(e_BattleEnded::TEST_CLASS_HASH),
            TestResource::Event(e_ClanCreated::TEST_CLASS_HASH),
            TestResource::Event(e_MemberJoined::TEST_CLASS_HASH),
            TestResource::Event(e_MemberLeft::TEST_CLASS_HASH),
            TestResource::Event(e_MemberPromoted::TEST_CLASS_HASH),
            TestResource::Event(e_MemberDemoted::TEST_CLASS_HASH),
            TestResource::Event(e_MemberKicked::TEST_CLASS_HASH),
            TestResource::Event(e_LeadershipTransferred::TEST_CLASS_HASH),
            // Contracts
            TestResource::Contract(village::TEST_CLASS_HASH),
            TestResource::Contract(building_system::TEST_CLASS_HASH),
            TestResource::Contract(training_system::TEST_CLASS_HASH),
            TestResource::Contract(resource_system::TEST_CLASS_HASH),
            TestResource::Contract(combat_system::TEST_CLASS_HASH),
            TestResource::Contract(clan_system::TEST_CLASS_HASH),
        ]
            .span(),
    };
    ndef
}

fn contract_defs() -> Span<ContractDef> {
    [
        ContractDefTrait::new(@"clash", @"village")
            .with_writer_of([dojo::utils::bytearray_hash(@"clash")].span()),
        ContractDefTrait::new(@"clash", @"building_system")
            .with_writer_of([dojo::utils::bytearray_hash(@"clash")].span()),
        ContractDefTrait::new(@"clash", @"training_system")
            .with_writer_of([dojo::utils::bytearray_hash(@"clash")].span()),
        ContractDefTrait::new(@"clash", @"resource_system")
            .with_writer_of([dojo::utils::bytearray_hash(@"clash")].span()),
        ContractDefTrait::new(@"clash", @"combat_system")
            .with_writer_of([dojo::utils::bytearray_hash(@"clash")].span()),
        ContractDefTrait::new(@"clash", @"clan_system")
            .with_writer_of([dojo::utils::bytearray_hash(@"clash")].span()),
    ].span()
}

fn setup() -> (dojo::world::WorldStorage, IVillageDispatcher, IClanDispatcher) {
    let ndef = namespace_def();
    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    let (clan_address, _) = world.dns(@"clan_system").unwrap();
    let clan_dispatcher = IClanDispatcher { contract_address: clan_address };

    (world, village_dispatcher, clan_dispatcher)
}

fn spawn_player(village: IVillageDispatcher, address: ContractAddress, username: felt252) {
    starknet::testing::set_contract_address(address);
    starknet::testing::set_account_contract_address(address);
    village.spawn(username);
}

#[test]
fn test_create_clan() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let (mut world, village, clan) = setup();

    starknet::testing::set_block_timestamp(100);
    spawn_player(village, caller, 'Leader');

    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);
    clan.create_clan('TestClan', 0);

    // Verify clan was created
    let clan_data: Clan = world.read_model(1_u32);
    assert(clan_data.name == 'TestClan', 'Wrong clan name');
    assert(clan_data.leader == caller, 'Wrong leader');
    assert(clan_data.member_count == 1, 'Wrong member count');
    assert(clan_data.max_members == 50, 'Wrong max members');
    assert(clan_data.is_open, 'Should be open');
    assert(clan_data.required_trophies == 0, 'Wrong required trophies');

    // Verify player's clan_id was updated
    let player: Player = world.read_model(caller);
    assert(player.clan_id == 1, 'Wrong player clan_id');

    // Verify member entry
    let member: ClanMember = world.read_model((1_u32, caller));
    assert(member.role == ClanRole::Leader, 'Wrong role');
    assert(member.joined_at == 100, 'Wrong joined_at');
}

#[test]
fn test_join_clan() {
    let leader: ContractAddress = 'leader'.try_into().unwrap();
    let joiner: ContractAddress = 'joiner'.try_into().unwrap();
    let (mut world, village, clan) = setup();

    spawn_player(village, leader, 'Leader');
    spawn_player(village, joiner, 'Joiner');

    // Create clan
    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.create_clan('TestClan', 0);

    // Join clan
    starknet::testing::set_contract_address(joiner);
    starknet::testing::set_account_contract_address(joiner);
    clan.join_clan(1);

    // Verify
    let clan_data: Clan = world.read_model(1_u32);
    assert(clan_data.member_count == 2, 'Wrong member count');

    let member: ClanMember = world.read_model((1_u32, joiner));
    assert(member.role == ClanRole::Member, 'Wrong role');

    let player: Player = world.read_model(joiner);
    assert(player.clan_id == 1, 'Wrong player clan_id');
}

#[test]
#[should_panic(expected: ('Already in a clan', 'ENTRYPOINT_FAILED'))]
fn test_cannot_join_when_already_in_clan() {
    let leader: ContractAddress = 'leader'.try_into().unwrap();
    let joiner: ContractAddress = 'joiner'.try_into().unwrap();
    let (_, village, clan) = setup();

    spawn_player(village, leader, 'Leader');
    spawn_player(village, joiner, 'Joiner');

    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.create_clan('TestClan', 0);

    starknet::testing::set_contract_address(joiner);
    starknet::testing::set_account_contract_address(joiner);
    clan.join_clan(1);
    clan.join_clan(1); // Should panic
}

#[test]
#[should_panic(expected: ('Not enough trophies', 'ENTRYPOINT_FAILED'))]
fn test_cannot_join_without_trophies() {
    let leader: ContractAddress = 'leader'.try_into().unwrap();
    let joiner: ContractAddress = 'joiner'.try_into().unwrap();
    let (_, village, clan) = setup();

    spawn_player(village, leader, 'Leader');
    spawn_player(village, joiner, 'Joiner');

    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.create_clan('TestClan', 100); // Require 100 trophies

    starknet::testing::set_contract_address(joiner);
    starknet::testing::set_account_contract_address(joiner);
    clan.join_clan(1); // Should panic - joiner has 0 trophies
}

#[test]
fn test_leave_clan() {
    let leader: ContractAddress = 'leader'.try_into().unwrap();
    let member_addr: ContractAddress = 'member'.try_into().unwrap();
    let (mut world, village, clan) = setup();

    spawn_player(village, leader, 'Leader');
    spawn_player(village, member_addr, 'Member');

    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.create_clan('TestClan', 0);

    starknet::testing::set_contract_address(member_addr);
    starknet::testing::set_account_contract_address(member_addr);
    clan.join_clan(1);

    // Leave clan
    clan.leave_clan();

    // Verify
    let clan_data: Clan = world.read_model(1_u32);
    assert(clan_data.member_count == 1, 'Wrong member count');

    let player: Player = world.read_model(member_addr);
    assert(player.clan_id == 0, 'Should not be in clan');
}

#[test]
#[should_panic(expected: ('Leader cannot leave', 'ENTRYPOINT_FAILED'))]
fn test_leader_cannot_leave() {
    let leader: ContractAddress = 'leader'.try_into().unwrap();
    let (_, village, clan) = setup();

    spawn_player(village, leader, 'Leader');

    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.create_clan('TestClan', 0);

    clan.leave_clan(); // Should panic
}

#[test]
fn test_promote_member() {
    let leader: ContractAddress = 'leader'.try_into().unwrap();
    let member_addr: ContractAddress = 'member'.try_into().unwrap();
    let (mut world, village, clan) = setup();

    spawn_player(village, leader, 'Leader');
    spawn_player(village, member_addr, 'Member');

    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.create_clan('TestClan', 0);

    starknet::testing::set_contract_address(member_addr);
    starknet::testing::set_account_contract_address(member_addr);
    clan.join_clan(1);

    // Leader promotes member to Elder
    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.promote_member(1, member_addr);

    let member: ClanMember = world.read_model((1_u32, member_addr));
    assert(member.role == ClanRole::Elder, 'Should be Elder');

    // Leader promotes Elder to CoLeader
    clan.promote_member(1, member_addr);

    let member: ClanMember = world.read_model((1_u32, member_addr));
    assert(member.role == ClanRole::CoLeader, 'Should be CoLeader');
}

#[test]
fn test_demote_member() {
    let leader: ContractAddress = 'leader'.try_into().unwrap();
    let member_addr: ContractAddress = 'member'.try_into().unwrap();
    let (mut world, village, clan) = setup();

    spawn_player(village, leader, 'Leader');
    spawn_player(village, member_addr, 'Member');

    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.create_clan('TestClan', 0);

    starknet::testing::set_contract_address(member_addr);
    starknet::testing::set_account_contract_address(member_addr);
    clan.join_clan(1);

    // Promote to CoLeader first
    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.promote_member(1, member_addr);
    clan.promote_member(1, member_addr);

    // Demote CoLeader to Elder
    clan.demote_member(1, member_addr);
    let member: ClanMember = world.read_model((1_u32, member_addr));
    assert(member.role == ClanRole::Elder, 'Should be Elder');

    // Demote Elder to Member
    clan.demote_member(1, member_addr);
    let member: ClanMember = world.read_model((1_u32, member_addr));
    assert(member.role == ClanRole::Member, 'Should be Member');
}

#[test]
fn test_kick_member() {
    let leader: ContractAddress = 'leader'.try_into().unwrap();
    let member_addr: ContractAddress = 'member'.try_into().unwrap();
    let (mut world, village, clan) = setup();

    spawn_player(village, leader, 'Leader');
    spawn_player(village, member_addr, 'Member');

    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.create_clan('TestClan', 0);

    starknet::testing::set_contract_address(member_addr);
    starknet::testing::set_account_contract_address(member_addr);
    clan.join_clan(1);

    // Leader kicks member
    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.kick_member(1, member_addr);

    // Verify
    let clan_data: Clan = world.read_model(1_u32);
    assert(clan_data.member_count == 1, 'Wrong member count');

    let player: Player = world.read_model(member_addr);
    assert(player.clan_id == 0, 'Should not be in clan');
}

#[test]
#[should_panic(expected: ('Cannot kick higher role', 'ENTRYPOINT_FAILED'))]
fn test_coleader_cannot_kick_coleader() {
    let leader: ContractAddress = 'leader'.try_into().unwrap();
    let coleader1: ContractAddress = 'coleader1'.try_into().unwrap();
    let coleader2: ContractAddress = 'coleader2'.try_into().unwrap();
    let (_, village, clan) = setup();

    spawn_player(village, leader, 'Leader');
    spawn_player(village, coleader1, 'CoLeader1');
    spawn_player(village, coleader2, 'CoLeader2');

    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.create_clan('TestClan', 0);

    starknet::testing::set_contract_address(coleader1);
    starknet::testing::set_account_contract_address(coleader1);
    clan.join_clan(1);

    starknet::testing::set_contract_address(coleader2);
    starknet::testing::set_account_contract_address(coleader2);
    clan.join_clan(1);

    // Promote both to CoLeader
    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.promote_member(1, coleader1);
    clan.promote_member(1, coleader1);
    clan.promote_member(1, coleader2);
    clan.promote_member(1, coleader2);

    // CoLeader1 tries to kick CoLeader2 - should fail
    starknet::testing::set_contract_address(coleader1);
    starknet::testing::set_account_contract_address(coleader1);
    clan.kick_member(1, coleader2);
}

#[test]
fn test_transfer_leadership() {
    let leader: ContractAddress = 'leader'.try_into().unwrap();
    let member_addr: ContractAddress = 'member'.try_into().unwrap();
    let (mut world, village, clan) = setup();

    spawn_player(village, leader, 'Leader');
    spawn_player(village, member_addr, 'Member');

    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.create_clan('TestClan', 0);

    starknet::testing::set_contract_address(member_addr);
    starknet::testing::set_account_contract_address(member_addr);
    clan.join_clan(1);

    // Transfer leadership
    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.transfer_leadership(1, member_addr);

    // Verify
    let clan_data: Clan = world.read_model(1_u32);
    assert(clan_data.leader == member_addr, 'Wrong new leader');

    let old_leader: ClanMember = world.read_model((1_u32, leader));
    assert(old_leader.role == ClanRole::CoLeader, 'Old leader should be CoLeader');

    let new_leader: ClanMember = world.read_model((1_u32, member_addr));
    assert(new_leader.role == ClanRole::Leader, 'New leader should be Leader');
}

#[test]
#[should_panic(expected: ('Clan name cannot be empty', 'ENTRYPOINT_FAILED'))]
fn test_cannot_create_clan_empty_name() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let (_, village, clan) = setup();

    spawn_player(village, caller, 'Player');

    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);
    clan.create_clan(0, 0); // Should panic
}

#[test]
#[should_panic(expected: ('Already in a clan', 'ENTRYPOINT_FAILED'))]
fn test_cannot_create_clan_while_in_clan() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let (_, village, clan) = setup();

    spawn_player(village, caller, 'Player');

    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);
    clan.create_clan('Clan1', 0);
    clan.create_clan('Clan2', 0); // Should panic
}

#[test]
fn test_leader_can_leave_after_transfer() {
    let leader: ContractAddress = 'leader'.try_into().unwrap();
    let member_addr: ContractAddress = 'member'.try_into().unwrap();
    let (mut world, village, clan) = setup();

    spawn_player(village, leader, 'Leader');
    spawn_player(village, member_addr, 'Member');

    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.create_clan('TestClan', 0);

    starknet::testing::set_contract_address(member_addr);
    starknet::testing::set_account_contract_address(member_addr);
    clan.join_clan(1);

    // Transfer leadership first
    starknet::testing::set_contract_address(leader);
    starknet::testing::set_account_contract_address(leader);
    clan.transfer_leadership(1, member_addr);

    // Now old leader (now CoLeader) can leave
    clan.leave_clan();

    let player: Player = world.read_model(leader);
    assert(player.clan_id == 0, 'Should not be in clan');

    let clan_data: Clan = world.read_model(1_u32);
    assert(clan_data.member_count == 1, 'Wrong member count');
}
