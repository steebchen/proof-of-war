use starknet::ContractAddress;
use dojo::model::ModelStorage;
use dojo::world::{WorldStorageTrait, world};
use dojo_cairo_test::{
    spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
    WorldStorageTestTrait
};

use clash_prototype::models::player::{Player, m_Player};
use clash_prototype::models::building::{Building, BuildingType, m_Building};
use clash_prototype::models::army::{Army, m_Army};
use clash_prototype::systems::village::{village, IVillageDispatcher, IVillageDispatcherTrait, e_PlayerSpawned};
use clash_prototype::systems::building::{building_system, IBuildingDispatcher, IBuildingDispatcherTrait, e_BuildingPlaced, e_BuildingUpgraded};
use clash_prototype::utils::config::{STARTING_GOLD, STARTING_ELIXIR};

fn namespace_def() -> NamespaceDef {
    let ndef = NamespaceDef {
        namespace: "clash",
        resources: [
            TestResource::Model(m_Player::TEST_CLASS_HASH),
            TestResource::Model(m_Building::TEST_CLASS_HASH),
            TestResource::Model(m_Army::TEST_CLASS_HASH),
            TestResource::Event(e_PlayerSpawned::TEST_CLASS_HASH),
            TestResource::Event(e_BuildingPlaced::TEST_CLASS_HASH),
            TestResource::Event(e_BuildingUpgraded::TEST_CLASS_HASH),
            TestResource::Contract(village::TEST_CLASS_HASH),
            TestResource::Contract(building_system::TEST_CLASS_HASH),
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
    ].span()
}

#[test]
fn test_spawn_player() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let ndef = namespace_def();

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    // Set caller
    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);

    // Spawn player
    village_dispatcher.spawn('TestPlayer');

    // Verify player was created
    let player: Player = world.read_model(caller);
    assert(player.username == 'TestPlayer', 'Wrong username');
    assert(player.gold == STARTING_GOLD, 'Wrong gold');
    assert(player.elixir == STARTING_ELIXIR, 'Wrong elixir');
    assert(player.town_hall_level == 1, 'Wrong TH level');
    assert(player.building_count == 1, 'Wrong building count');

    // Verify town hall was created
    let town_hall: Building = world.read_model((caller, 1_u32));
    assert(town_hall.building_type == BuildingType::TownHall, 'Wrong building type');
    assert(town_hall.level == 1, 'Wrong level');
    assert(town_hall.x == 18, 'Wrong x position');
    assert(town_hall.y == 18, 'Wrong y position');

    // Verify army was initialized
    let army: Army = world.read_model(caller);
    assert(army.barbarians == 0, 'Wrong barbarians');
    assert(army.archers == 0, 'Wrong archers');
    assert(army.max_capacity == 0, 'Wrong capacity');
}

#[test]
fn test_place_building() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let ndef = namespace_def();

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    let (building_address, _) = world.dns(@"building_system").unwrap();
    let building_dispatcher = IBuildingDispatcher { contract_address: building_address };

    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);

    // Spawn player first
    village_dispatcher.spawn('TestPlayer');

    // Place a gold mine
    building_dispatcher.place_building(BuildingType::GoldMine, 5, 5);

    // Verify building was placed
    let player: Player = world.read_model(caller);
    assert(player.building_count == 2, 'Wrong building count');

    let gold_mine: Building = world.read_model((caller, 2_u32));
    assert(gold_mine.building_type == BuildingType::GoldMine, 'Wrong building type');
    assert(gold_mine.x == 5, 'Wrong x');
    assert(gold_mine.y == 5, 'Wrong y');
}

#[test]
#[should_panic(expected: ('Player already exists', 'ENTRYPOINT_FAILED'))]
fn test_cannot_spawn_twice() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let ndef = namespace_def();

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);

    village_dispatcher.spawn('TestPlayer');
    village_dispatcher.spawn('TestPlayer2'); // Should panic
}

#[test]
#[should_panic(expected: ('Building collision', 'ENTRYPOINT_FAILED'))]
fn test_building_collision() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let ndef = namespace_def();

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    let (building_address, _) = world.dns(@"building_system").unwrap();
    let building_dispatcher = IBuildingDispatcher { contract_address: building_address };

    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);

    village_dispatcher.spawn('TestPlayer');

    // Place at position that overlaps with town hall (18,18 with size 4x4)
    building_dispatcher.place_building(BuildingType::GoldMine, 19, 19); // Should collide
}
