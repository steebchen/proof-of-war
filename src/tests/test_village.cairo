use starknet::ContractAddress;
use dojo::model::ModelStorage;
use dojo::world::{WorldStorageTrait, world};
use dojo_cairo_test::{
    spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
    WorldStorageTestTrait
};

use clash_prototype::models::player::{Player, m_Player};
use clash_prototype::models::building::{Building, BuildingType, m_Building};
use clash_prototype::models::army::{Army, BuilderQueue, m_Army, m_BuilderQueue, TrainingQueue, m_TrainingQueue};
use clash_prototype::systems::village::{village, IVillageDispatcher, IVillageDispatcherTrait, e_PlayerSpawned};
use clash_prototype::systems::building::{building_system, IBuildingDispatcher, IBuildingDispatcherTrait, e_BuildingPlaced, e_BuildingUpgraded};
use clash_prototype::systems::training::{training_system, ITrainingDispatcher, ITrainingDispatcherTrait, e_TroopsTrainingStarted, e_TroopsCollected};
use clash_prototype::utils::config::{STARTING_DIAMOND, STARTING_GAS};

fn namespace_def() -> NamespaceDef {
    let ndef = NamespaceDef {
        namespace: "clash",
        resources: [
            TestResource::Model(m_Player::TEST_CLASS_HASH),
            TestResource::Model(m_Building::TEST_CLASS_HASH),
            TestResource::Model(m_Army::TEST_CLASS_HASH),
            TestResource::Model(m_BuilderQueue::TEST_CLASS_HASH),
            TestResource::Model(m_TrainingQueue::TEST_CLASS_HASH),
            TestResource::Event(e_PlayerSpawned::TEST_CLASS_HASH),
            TestResource::Event(e_BuildingPlaced::TEST_CLASS_HASH),
            TestResource::Event(e_BuildingUpgraded::TEST_CLASS_HASH),
            TestResource::Event(e_TroopsTrainingStarted::TEST_CLASS_HASH),
            TestResource::Event(e_TroopsCollected::TEST_CLASS_HASH),
            TestResource::Contract(village::TEST_CLASS_HASH),
            TestResource::Contract(building_system::TEST_CLASS_HASH),
            TestResource::Contract(training_system::TEST_CLASS_HASH),
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
    assert(player.diamond == STARTING_DIAMOND, 'Wrong diamond');
    assert(player.gas == STARTING_GAS, 'Wrong gas');
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

    // Place a diamond mine
    building_dispatcher.place_building(BuildingType::DiamondMine, 5, 5);

    // Verify building was placed
    let player: Player = world.read_model(caller);
    assert(player.building_count == 2, 'Wrong building count');

    let diamond_mine: Building = world.read_model((caller, 2_u32));
    assert(diamond_mine.building_type == BuildingType::DiamondMine, 'Wrong building type');
    assert(diamond_mine.x == 5, 'Wrong x');
    assert(diamond_mine.y == 5, 'Wrong y');
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
    building_dispatcher.place_building(BuildingType::DiamondMine, 19, 19); // Should collide
}

#[test]
fn test_spawn_has_one_worker_max_five() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let ndef = namespace_def();

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);

    village_dispatcher.spawn('TestPlayer');

    let player: Player = world.read_model(caller);
    assert(player.total_builders == 1, 'Should start with 1 worker');
    assert(player.free_builders == 1, 'Should have 1 free worker');
    assert(player.max_builders == 5, 'Max should be 5');
}

#[test]
fn test_upgrade_uses_worker() {
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

    // Place a diamond mine
    building_dispatcher.place_building(BuildingType::DiamondMine, 5, 5);

    // Upgrade the diamond mine (uses 1 worker)
    building_dispatcher.upgrade_building(2);

    // Verify worker was consumed
    let player: Player = world.read_model(caller);
    assert(player.free_builders == 0, 'Worker should be busy');
}

#[test]
#[should_panic(expected: ('No free builders', 'ENTRYPOINT_FAILED'))]
fn test_cannot_upgrade_without_free_worker() {
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

    // Place two diamond mines
    building_dispatcher.place_building(BuildingType::DiamondMine, 5, 5);
    building_dispatcher.place_building(BuildingType::DiamondMine, 0, 0);

    // Upgrade first one (uses the only worker)
    building_dispatcher.upgrade_building(2);

    // Try to upgrade second one — should fail, no free workers
    building_dispatcher.upgrade_building(3);
}

#[test]
fn test_finish_upgrade_frees_worker() {
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

    // Place and upgrade a diamond mine
    building_dispatcher.place_building(BuildingType::DiamondMine, 5, 5);
    building_dispatcher.upgrade_building(2);

    // Fast-forward time past the upgrade finish
    starknet::testing::set_block_timestamp(999999);

    // Finish upgrade
    building_dispatcher.finish_upgrade(2);

    // Verify worker is free again
    let player: Player = world.read_model(caller);
    assert(player.free_builders == 1, 'Worker should be free');
}

#[test]
fn test_train_worker_at_command_center() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let ndef = namespace_def();

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    let (training_address, _) = world.dns(@"training_system").unwrap();
    let training_dispatcher = ITrainingDispatcher { contract_address: training_address };

    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);

    village_dispatcher.spawn('TestPlayer');

    // Train a worker
    training_dispatcher.train_worker();

    // Verify queue is active
    let queue: BuilderQueue = world.read_model(caller);
    assert(queue.is_training, 'Should be training');

    // Verify gas was deducted
    let player: Player = world.read_model(caller);
    assert(player.gas == STARTING_GAS - 150, 'Gas should be deducted');

    // Fast-forward and collect
    starknet::testing::set_block_timestamp(999999);
    training_dispatcher.collect_worker();

    // Verify worker was added
    let player: Player = world.read_model(caller);
    assert(player.total_builders == 2, 'Should have 2 workers');
    assert(player.free_builders == 2, 'Should have 2 free workers');

    // Verify queue is cleared
    let queue: BuilderQueue = world.read_model(caller);
    assert(!queue.is_training, 'Should not be training');
}
