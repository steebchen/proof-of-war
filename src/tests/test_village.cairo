use starknet::ContractAddress;
use dojo::model::ModelStorage;
use dojo::world::{WorldStorageTrait, world};
use dojo_cairo_test::{
    spawn_test_world, NamespaceDef, TestResource, ContractDefTrait, ContractDef,
    WorldStorageTestTrait
};

use clash_prototype::models::player::{Player, m_Player};
use clash_prototype::models::building::{Building, BuildingType, m_Building};
use clash_prototype::models::army::{Army, BuilderQueue, m_Army, m_BuilderQueue, m_TrainingQueue};
use clash_prototype::models::battle::{
    m_Battle, m_DeployedTroop, m_BattleBuilding, m_BattleCounter,
};
use clash_prototype::systems::village::{village, IVillageDispatcher, IVillageDispatcherTrait, e_PlayerSpawned};
use clash_prototype::systems::building::{building_system, IBuildingDispatcher, IBuildingDispatcherTrait, e_BuildingPlaced, e_BuildingUpgraded};
use clash_prototype::systems::training::{training_system, ITrainingDispatcher, ITrainingDispatcherTrait, e_TroopsTrainingStarted, e_TroopsCollected};
use clash_prototype::systems::resource::{resource_system, IResourceDispatcher, IResourceDispatcherTrait, e_ResourcesCollected};
use clash_prototype::systems::combat::{combat_system, e_BattleStarted, e_TroopDeployed, e_BattleEnded};
use clash_prototype::models::troop::TroopType;
use clash_prototype::systems::combat::{ICombatDispatcher, ICombatDispatcherTrait};
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
            TestResource::Model(m_Battle::TEST_CLASS_HASH),
            TestResource::Model(m_DeployedTroop::TEST_CLASS_HASH),
            TestResource::Model(m_BattleBuilding::TEST_CLASS_HASH),
            TestResource::Model(m_BattleCounter::TEST_CLASS_HASH),
            TestResource::Event(e_PlayerSpawned::TEST_CLASS_HASH),
            TestResource::Event(e_BuildingPlaced::TEST_CLASS_HASH),
            TestResource::Event(e_BuildingUpgraded::TEST_CLASS_HASH),
            TestResource::Event(e_TroopsTrainingStarted::TEST_CLASS_HASH),
            TestResource::Event(e_TroopsCollected::TEST_CLASS_HASH),
            TestResource::Event(e_ResourcesCollected::TEST_CLASS_HASH),
            TestResource::Event(e_BattleStarted::TEST_CLASS_HASH),
            TestResource::Event(e_TroopDeployed::TEST_CLASS_HASH),
            TestResource::Event(e_BattleEnded::TEST_CLASS_HASH),
            TestResource::Contract(village::TEST_CLASS_HASH),
            TestResource::Contract(building_system::TEST_CLASS_HASH),
            TestResource::Contract(training_system::TEST_CLASS_HASH),
            TestResource::Contract(resource_system::TEST_CLASS_HASH),
            TestResource::Contract(combat_system::TEST_CLASS_HASH),
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

    // Place a diamond mine (uses builder, building at level 0)
    building_dispatcher.place_building(BuildingType::DiamondMine, 5, 5);

    // Finish construction first (level 0 → 1, frees builder)
    starknet::testing::set_block_timestamp(999999);
    building_dispatcher.finish_upgrade(2);

    // Verify builder is free after construction
    let player: Player = world.read_model(caller);
    assert(player.free_builders == 1, 'Worker should be free');

    // Now upgrade the diamond mine (level 1 → 2, uses builder)
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

    // Place a diamond mine (uses builder)
    building_dispatcher.place_building(BuildingType::DiamondMine, 5, 5);

    // Finish construction to get level 1 and free builder
    starknet::testing::set_block_timestamp(100);
    building_dispatcher.finish_upgrade(2);

    // Place second diamond mine (uses builder again)
    building_dispatcher.place_building(BuildingType::DiamondMine, 0, 0);

    // Finish second construction
    starknet::testing::set_block_timestamp(200);
    building_dispatcher.finish_upgrade(3);

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

    // Place a diamond mine (level 0, under construction)
    building_dispatcher.place_building(BuildingType::DiamondMine, 5, 5);

    // Finish construction (level 0 → 1, frees builder)
    starknet::testing::set_block_timestamp(100);
    building_dispatcher.finish_upgrade(2);

    // Start upgrade (level 1 → 2, uses builder)
    building_dispatcher.upgrade_building(2);

    let player: Player = world.read_model(caller);
    assert(player.free_builders == 0, 'Worker should be busy');

    // Fast-forward time past the upgrade finish
    starknet::testing::set_block_timestamp(999999);

    // Finish upgrade
    building_dispatcher.finish_upgrade(2);

    // Verify worker is free again and building is level 2
    let player: Player = world.read_model(caller);
    assert(player.free_builders == 1, 'Worker should be free');

    let building: Building = world.read_model((caller, 2_u32));
    assert(building.level == 2, 'Should be level 2');
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

#[test]
#[should_panic(expected: ('Username cannot be empty', 'ENTRYPOINT_FAILED'))]
fn test_spawn_empty_username() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let ndef = namespace_def();

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);

    village_dispatcher.spawn(0); // Should panic - empty username
}

#[test]
fn test_move_building() {
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

    // Finish construction first
    starknet::testing::set_block_timestamp(999999);
    building_dispatcher.finish_upgrade(2);

    // Move it to a new position
    building_dispatcher.move_building(2, 10, 10);

    // Verify new position
    let building: Building = world.read_model((caller, 2_u32));
    assert(building.x == 10, 'Wrong x after move');
    assert(building.y == 10, 'Wrong y after move');
}

#[test]
fn test_resource_collection() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let ndef = namespace_def();

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    let (building_address, _) = world.dns(@"building_system").unwrap();
    let building_dispatcher = IBuildingDispatcher { contract_address: building_address };

    let (resource_address, _) = world.dns(@"resource_system").unwrap();
    let resource_dispatcher = IResourceDispatcher { contract_address: resource_address };

    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);

    village_dispatcher.spawn('TestPlayer');

    // Place a diamond mine
    building_dispatcher.place_building(BuildingType::DiamondMine, 5, 5);

    // Finish construction
    starknet::testing::set_block_timestamp(100);
    building_dispatcher.finish_upgrade(2);

    // Also place a diamond storage for capacity
    building_dispatcher.place_building(BuildingType::DiamondStorage, 0, 0);
    starknet::testing::set_block_timestamp(200);
    building_dispatcher.finish_upgrade(3);

    // Wait 10 minutes (600 seconds) and collect
    starknet::testing::set_block_timestamp(800);
    let player_before: Player = world.read_model(caller);
    resource_dispatcher.collect_all_resources();
    let player_after: Player = world.read_model(caller);

    // Diamond mine level 1 produces 10/min * level 1 = 10/min
    // 10 minutes elapsed = 100 diamond expected
    assert(player_after.diamond > player_before.diamond, 'Should collect diamond');
}

#[test]
#[should_panic(expected: ('Quantity must be > 0', 'ENTRYPOINT_FAILED'))]
fn test_train_zero_troops() {
    let caller: ContractAddress = 'player1'.try_into().unwrap();
    let ndef = namespace_def();

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    let (building_address, _) = world.dns(@"building_system").unwrap();
    let building_dispatcher = IBuildingDispatcher { contract_address: building_address };

    let (training_address, _) = world.dns(@"training_system").unwrap();
    let training_dispatcher = ITrainingDispatcher { contract_address: training_address };

    starknet::testing::set_contract_address(caller);
    starknet::testing::set_account_contract_address(caller);

    village_dispatcher.spawn('TestPlayer');

    // Place army camp (uses builder)
    building_dispatcher.place_building(BuildingType::ArmyCamp, 0, 0);

    // Finish construction (frees builder)
    starknet::testing::set_block_timestamp(100);
    building_dispatcher.finish_upgrade(2);

    // Place barracks (uses builder)
    building_dispatcher.place_building(BuildingType::Barracks, 5, 5);

    // Finish construction (frees builder)
    starknet::testing::set_block_timestamp(200);
    building_dispatcher.finish_upgrade(3);

    // Try to train 0 troops - should panic
    training_dispatcher.train_troops(3, TroopType::Barbarian, 0);
}

#[test]
fn test_shield_after_battle() {
    let attacker: ContractAddress = 'attacker'.try_into().unwrap();
    let defender: ContractAddress = 'defender'.try_into().unwrap();
    let ndef = namespace_def();

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    let (building_address, _) = world.dns(@"building_system").unwrap();
    let building_dispatcher = IBuildingDispatcher { contract_address: building_address };

    let (training_address, _) = world.dns(@"training_system").unwrap();
    let training_dispatcher = ITrainingDispatcher { contract_address: training_address };

    let (combat_address, _) = world.dns(@"combat_system").unwrap();
    let combat_dispatcher = ICombatDispatcher { contract_address: combat_address };

    // Spawn both players
    starknet::testing::set_contract_address(attacker);
    starknet::testing::set_account_contract_address(attacker);
    village_dispatcher.spawn('Attacker');

    starknet::testing::set_contract_address(defender);
    starknet::testing::set_account_contract_address(defender);
    village_dispatcher.spawn('Defender');

    // Give attacker an army camp and barracks, then train troops
    starknet::testing::set_contract_address(attacker);
    starknet::testing::set_account_contract_address(attacker);

    building_dispatcher.place_building(BuildingType::ArmyCamp, 0, 0);
    starknet::testing::set_block_timestamp(100);
    building_dispatcher.finish_upgrade(2);

    building_dispatcher.place_building(BuildingType::Barracks, 5, 5);
    starknet::testing::set_block_timestamp(200);
    building_dispatcher.finish_upgrade(3);

    // Train barbarians
    training_dispatcher.train_troops(3, TroopType::Barbarian, 5);
    starknet::testing::set_block_timestamp(300);
    training_dispatcher.collect_trained_troops(3);

    // Start attack (first battle gets id 0)
    combat_dispatcher.start_attack(defender);

    // Deploy a troop (at edge zone)
    combat_dispatcher.deploy_troop(0, TroopType::Barbarian, 5, 5);

    // Resolve battle
    combat_dispatcher.resolve_battle(0);

    // Verify defender got a shield
    let defender_player: Player = world.read_model(defender);
    assert(defender_player.shield_until > 300, 'Shield should be set');

    // Verify shield_until = current_time + 14400
    assert(defender_player.shield_until == 300 + 14400, 'Wrong shield duration');
}

#[test]
#[should_panic(expected: ('Defender is shielded', 'ENTRYPOINT_FAILED'))]
fn test_cannot_attack_shielded_player() {
    let attacker: ContractAddress = 'attacker'.try_into().unwrap();
    let defender: ContractAddress = 'defender'.try_into().unwrap();
    let ndef = namespace_def();

    let mut world = spawn_test_world(world::TEST_CLASS_HASH, [ndef].span());
    world.sync_perms_and_inits(contract_defs());

    let (village_address, _) = world.dns(@"village").unwrap();
    let village_dispatcher = IVillageDispatcher { contract_address: village_address };

    let (building_address, _) = world.dns(@"building_system").unwrap();
    let building_dispatcher = IBuildingDispatcher { contract_address: building_address };

    let (training_address, _) = world.dns(@"training_system").unwrap();
    let training_dispatcher = ITrainingDispatcher { contract_address: training_address };

    let (combat_address, _) = world.dns(@"combat_system").unwrap();
    let combat_dispatcher = ICombatDispatcher { contract_address: combat_address };

    // Spawn both players
    starknet::testing::set_contract_address(attacker);
    starknet::testing::set_account_contract_address(attacker);
    village_dispatcher.spawn('Attacker');

    starknet::testing::set_contract_address(defender);
    starknet::testing::set_account_contract_address(defender);
    village_dispatcher.spawn('Defender');

    // Give attacker army
    starknet::testing::set_contract_address(attacker);
    starknet::testing::set_account_contract_address(attacker);

    building_dispatcher.place_building(BuildingType::ArmyCamp, 0, 0);
    starknet::testing::set_block_timestamp(100);
    building_dispatcher.finish_upgrade(2);

    building_dispatcher.place_building(BuildingType::Barracks, 5, 5);
    starknet::testing::set_block_timestamp(200);
    building_dispatcher.finish_upgrade(3);

    training_dispatcher.train_troops(3, TroopType::Barbarian, 5);
    starknet::testing::set_block_timestamp(500);
    training_dispatcher.collect_trained_troops(3);

    // First attack (battle_id = 0)
    combat_dispatcher.start_attack(defender);
    combat_dispatcher.deploy_troop(0, TroopType::Barbarian, 5, 5);
    combat_dispatcher.resolve_battle(0);

    // Try to attack again while shielded — should panic
    combat_dispatcher.start_attack(defender);
}
