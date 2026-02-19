use starknet::ContractAddress;
use clash_prototype::models::troop::TroopType;

#[starknet::interface]
pub trait ITraining<T> {
    fn train_troops(ref self: T, barracks_id: u32, troop_type: TroopType, quantity: u8);
    fn collect_trained_troops(ref self: T, barracks_id: u32);
    fn train_worker(ref self: T);
    fn collect_worker(ref self: T);
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct TroopsTrainingStarted {
    #[key]
    pub player: ContractAddress,
    pub barracks_id: u32,
    pub troop_type: TroopType,
    pub quantity: u8,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct TroopsCollected {
    #[key]
    pub player: ContractAddress,
    pub troop_type: TroopType,
    pub quantity: u8,
}

#[dojo::contract]
pub mod training_system {
    use super::{ITraining, TroopsTrainingStarted, TroopsCollected};
    use starknet::{get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;

    use clash_prototype::models::player::Player;
    use clash_prototype::models::building::{Building, BuildingType};
    use clash_prototype::models::army::{Army, TrainingQueue, BuilderQueue};
    use clash_prototype::models::troop::{TroopType, get_troop_config};
    use clash_prototype::utils::config::{
        MAX_BUILDERS, BUILDER_TRAINING_COST, get_builder_training_time
    };

    #[abi(embed_v0)]
    impl TrainingImpl of ITraining<ContractState> {
        fn train_troops(ref self: ContractState, barracks_id: u32, troop_type: TroopType, quantity: u8) {
            let mut world = self.world_default();
            let player_address = get_caller_address();
            let current_time = get_block_timestamp();

            // Validate input
            assert(quantity > 0, 'Quantity must be > 0');

            // Get player
            let mut player: Player = world.read_model(player_address);
            assert(player.town_hall_level > 0, 'Player not spawned');

            // Verify building is a barracks
            let barracks: Building = world.read_model((player_address, barracks_id));
            assert(barracks.level > 0, 'Building not found');
            assert(barracks.building_type == BuildingType::Barracks, 'Not a barracks');
            assert(!barracks.is_upgrading, 'Barracks upgrading');

            // Check existing queue - must collect trained troops before starting new training
            let existing_queue: TrainingQueue = world.read_model((player_address, barracks_id));
            assert(existing_queue.quantity == 0, 'Collect troops first');

            // Get troop config
            let config = get_troop_config(troop_type);

            // Check army capacity
            let army: Army = world.read_model(player_address);
            let space_needed: u16 = config.housing_space.into() * quantity.into();
            assert(army.total_space_used + space_needed <= army.max_capacity, 'Not enough army space');

            // Calculate total cost
            let total_cost = config.training_cost_gas * quantity.into();
            assert(player.gas >= total_cost, 'Not enough gas');

            // Deduct gas
            player.gas -= total_cost;
            world.write_model(@player);

            // Calculate training time
            let total_time = config.training_time * quantity.into();

            // Create training queue
            let queue = TrainingQueue {
                owner: player_address,
                barracks_id,
                troop_type,
                quantity,
                finish_time: current_time + total_time,
            };
            world.write_model(@queue);

            // Emit event
            world.emit_event(@TroopsTrainingStarted {
                player: player_address,
                barracks_id,
                troop_type,
                quantity,
            });
        }

        fn collect_trained_troops(ref self: ContractState, barracks_id: u32) {
            let mut world = self.world_default();
            let player_address = get_caller_address();
            let current_time = get_block_timestamp();

            // Get training queue
            let mut queue: TrainingQueue = world.read_model((player_address, barracks_id));
            assert(queue.quantity > 0, 'No troops training');
            assert(current_time >= queue.finish_time, 'Training not finished');

            // Get army
            let mut army: Army = world.read_model(player_address);
            let config = get_troop_config(queue.troop_type);

            // Add troops to army
            match queue.troop_type {
                TroopType::Barbarian => {
                    army.barbarians += queue.quantity.into();
                },
                TroopType::Archer => {
                    army.archers += queue.quantity.into();
                },
                TroopType::Giant => {
                    army.giants += queue.quantity.into();
                },
            }

            // Update space used
            army.total_space_used += config.housing_space.into() * queue.quantity.into();
            world.write_model(@army);

            // Clear queue
            let empty_queue = TrainingQueue {
                owner: player_address,
                barracks_id,
                troop_type: TroopType::Barbarian, // Default
                quantity: 0,
                finish_time: 0,
            };
            world.write_model(@empty_queue);

            // Emit event
            world.emit_event(@TroopsCollected {
                player: player_address,
                troop_type: queue.troop_type,
                quantity: queue.quantity,
            });
        }

        fn train_worker(ref self: ContractState) {
            let mut world = self.world_default();
            let player_address = get_caller_address();
            let current_time = get_block_timestamp();

            // Get player
            let mut player: Player = world.read_model(player_address);
            assert(player.town_hall_level > 0, 'Player not spawned');

            // Verify command center (town hall) is not upgrading
            let town_hall: Building = world.read_model((player_address, 1_u32));
            assert(!town_hall.is_upgrading, 'Command center upgrading');

            // Check builder limits
            assert(player.total_builders < MAX_BUILDERS, 'Max workers reached');

            // Check no active builder training
            let existing: BuilderQueue = world.read_model(player_address);
            assert(!existing.is_training, 'Already training worker');

            // Check gas cost
            assert(player.gas >= BUILDER_TRAINING_COST, 'Not enough gas');

            // Deduct gas
            player.gas -= BUILDER_TRAINING_COST;
            world.write_model(@player);

            // Training time scales with current worker count
            let training_time = get_builder_training_time(player.total_builders);

            // Create builder queue
            let queue = BuilderQueue {
                owner: player_address,
                is_training: true,
                finish_time: current_time + training_time,
            };
            world.write_model(@queue);
        }

        fn collect_worker(ref self: ContractState) {
            let mut world = self.world_default();
            let player_address = get_caller_address();
            let current_time = get_block_timestamp();

            // Get builder queue
            let queue: BuilderQueue = world.read_model(player_address);
            assert(queue.is_training, 'No worker training');
            assert(current_time >= queue.finish_time, 'Training not finished');

            // Update player
            let mut player: Player = world.read_model(player_address);
            player.total_builders += 1;
            player.free_builders += 1;
            world.write_model(@player);

            // Clear queue
            let empty_queue = BuilderQueue {
                owner: player_address,
                is_training: false,
                finish_time: 0,
            };
            world.write_model(@empty_queue);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"clash")
        }
    }
}
