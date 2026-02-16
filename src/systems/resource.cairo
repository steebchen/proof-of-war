use starknet::ContractAddress;

#[starknet::interface]
pub trait IResource<T> {
    fn collect_all_resources(ref self: T);
    fn collect_from_building(ref self: T, building_id: u32);
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct ResourcesCollected {
    #[key]
    pub player: ContractAddress,
    pub diamond_collected: u64,
    pub gas_collected: u64,
}

#[dojo::contract]
pub mod resource_system {
    use super::{IResource, ResourcesCollected};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;

    use clash_prototype::models::player::Player;
    use clash_prototype::models::building::{Building, BuildingType};
    use clash_prototype::utils::config::{
        RESOURCE_PRODUCTION_PER_MIN,
        get_storage_capacity
    };

    #[abi(embed_v0)]
    impl ResourceImpl of IResource<ContractState> {
        fn collect_all_resources(ref self: ContractState) {
            let mut world = self.world_default();
            let player_address = get_caller_address();
            let current_time = get_block_timestamp();

            // Get player
            let mut player: Player = world.read_model(player_address);
            assert(player.town_hall_level > 0, 'Player not spawned');

            // Calculate storage capacity
            let (diamond_capacity, gas_capacity) = self.calculate_storage_capacity(
                @world, player_address, player.building_count
            );

            let mut total_diamond_collected: u64 = 0;
            let mut total_gas_collected: u64 = 0;

            // Iterate through all buildings
            let mut i: u32 = 1;
            loop {
                if i > player.building_count {
                    break;
                }

                let mut building: Building = world.read_model((player_address, i));

                if building.level > 0 {
                    let (diamond, gas) = self.calculate_production(
                        building.building_type,
                        building.level,
                        building.last_collected_at,
                        current_time
                    );

                    if diamond > 0 || gas > 0 {
                        total_diamond_collected += diamond;
                        total_gas_collected += gas;

                        building.last_collected_at = current_time;
                        world.write_model(@building);
                    }
                }

                i += 1;
            };

            // Check storage capacity - error if completely full for a resource being produced
            if total_diamond_collected > 0 {
                assert(player.diamond < diamond_capacity, 'Diamond storage full');
            }
            if total_gas_collected > 0 {
                assert(player.gas < gas_capacity, 'Gas storage full');
            }

            // Apply to player resources (cap at storage capacity)
            let diamond_added = if player.diamond + total_diamond_collected > diamond_capacity {
                diamond_capacity - player.diamond
            } else {
                total_diamond_collected
            };
            let gas_added = if player.gas + total_gas_collected > gas_capacity {
                gas_capacity - player.gas
            } else {
                total_gas_collected
            };

            player.diamond += diamond_added;
            player.gas += gas_added;

            player.last_collected_at = current_time;
            world.write_model(@player);

            // Emit event
            world.emit_event(@ResourcesCollected {
                player: player_address,
                diamond_collected: diamond_added,
                gas_collected: gas_added,
            });
        }

        fn collect_from_building(ref self: ContractState, building_id: u32) {
            let mut world = self.world_default();
            let player_address = get_caller_address();
            let current_time = get_block_timestamp();

            // Get player and building
            let mut player: Player = world.read_model(player_address);
            let mut building: Building = world.read_model((player_address, building_id));

            assert(player.town_hall_level > 0, 'Player not spawned');
            assert(building.level > 0, 'Building not found');

            // Calculate production
            let (diamond, gas) = self.calculate_production(
                building.building_type,
                building.level,
                building.last_collected_at,
                current_time
            );

            // Calculate storage capacity
            let (diamond_capacity, gas_capacity) = self.calculate_storage_capacity(
                @world, player_address, player.building_count
            );

            // Check storage capacity
            if diamond > 0 {
                assert(player.diamond < diamond_capacity, 'Diamond storage full');
            }
            if gas > 0 {
                assert(player.gas < gas_capacity, 'Gas storage full');
            }

            // Apply to player resources (cap at storage capacity)
            let diamond_added = if player.diamond + diamond > diamond_capacity {
                diamond_capacity - player.diamond
            } else {
                diamond
            };
            let gas_added = if player.gas + gas > gas_capacity {
                gas_capacity - player.gas
            } else {
                gas
            };

            player.diamond += diamond_added;
            player.gas += gas_added;
            world.write_model(@player);

            // Update building's last collected time
            building.last_collected_at = current_time;
            world.write_model(@building);

            // Emit event
            world.emit_event(@ResourcesCollected {
                player: player_address,
                diamond_collected: diamond_added,
                gas_collected: gas_added,
            });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"clash")
        }

        fn calculate_production(
            self: @ContractState,
            building_type: BuildingType,
            level: u8,
            last_collected_at: u64,
            current_time: u64
        ) -> (u64, u64) {
            if current_time <= last_collected_at {
                return (0, 0);
            }

            let elapsed_minutes = (current_time - last_collected_at) / 60;

            let production = RESOURCE_PRODUCTION_PER_MIN * elapsed_minutes * level.into();
            match building_type {
                BuildingType::DiamondMine => (production, 0),
                BuildingType::GasCollector => (0, production),
                _ => (0, 0),
            }
        }

        fn calculate_storage_capacity(
            self: @ContractState,
            world: @dojo::world::WorldStorage,
            owner: ContractAddress,
            building_count: u32
        ) -> (u64, u64) {
            let mut diamond_capacity: u64 = 0;
            let mut gas_capacity: u64 = 0;

            let mut i: u32 = 1;
            loop {
                if i > building_count {
                    break;
                }

                let building: Building = world.read_model((owner, i));
                if building.level > 0 {
                    match building.building_type {
                        BuildingType::TownHall => {
                            // Town hall stores both
                            let cap = get_storage_capacity(building.building_type, building.level);
                            diamond_capacity += cap;
                            gas_capacity += cap;
                        },
                        BuildingType::DiamondStorage => {
                            diamond_capacity += get_storage_capacity(building.building_type, building.level);
                        },
                        BuildingType::GasStorage => {
                            gas_capacity += get_storage_capacity(building.building_type, building.level);
                        },
                        _ => {},
                    }
                }

                i += 1;
            };

            (diamond_capacity, gas_capacity)
        }
    }
}
