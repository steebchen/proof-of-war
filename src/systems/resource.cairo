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
    pub gold_collected: u64,
    pub elixir_collected: u64,
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
            let (gold_capacity, elixir_capacity) = self.calculate_storage_capacity(
                @world, player_address, player.building_count
            );

            let mut total_gold_collected: u64 = 0;
            let mut total_elixir_collected: u64 = 0;

            // Iterate through all buildings
            let mut i: u32 = 1;
            loop {
                if i > player.building_count {
                    break;
                }

                let mut building: Building = world.read_model((player_address, i));

                if building.level > 0 {
                    let (gold, elixir) = self.calculate_production(
                        building.building_type,
                        building.level,
                        building.last_collected_at,
                        current_time
                    );

                    if gold > 0 || elixir > 0 {
                        total_gold_collected += gold;
                        total_elixir_collected += elixir;

                        building.last_collected_at = current_time;
                        world.write_model(@building);
                    }
                }

                i += 1;
            };

            // Check storage capacity - error if completely full for a resource being produced
            if total_gold_collected > 0 {
                assert(player.gold < gold_capacity, 'Gold storage full');
            }
            if total_elixir_collected > 0 {
                assert(player.elixir < elixir_capacity, 'Elixir storage full');
            }

            // Apply to player resources (cap at storage capacity)
            let gold_added = if player.gold + total_gold_collected > gold_capacity {
                gold_capacity - player.gold
            } else {
                total_gold_collected
            };
            let elixir_added = if player.elixir + total_elixir_collected > elixir_capacity {
                elixir_capacity - player.elixir
            } else {
                total_elixir_collected
            };

            player.gold += gold_added;
            player.elixir += elixir_added;

            player.last_collected_at = current_time;
            world.write_model(@player);

            // Emit event
            world.emit_event(@ResourcesCollected {
                player: player_address,
                gold_collected: gold_added,
                elixir_collected: elixir_added,
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
            let (gold, elixir) = self.calculate_production(
                building.building_type,
                building.level,
                building.last_collected_at,
                current_time
            );

            // Calculate storage capacity
            let (gold_capacity, elixir_capacity) = self.calculate_storage_capacity(
                @world, player_address, player.building_count
            );

            // Check storage capacity
            if gold > 0 {
                assert(player.gold < gold_capacity, 'Gold storage full');
            }
            if elixir > 0 {
                assert(player.elixir < elixir_capacity, 'Elixir storage full');
            }

            // Apply to player resources (cap at storage capacity)
            let gold_added = if player.gold + gold > gold_capacity {
                gold_capacity - player.gold
            } else {
                gold
            };
            let elixir_added = if player.elixir + elixir > elixir_capacity {
                elixir_capacity - player.elixir
            } else {
                elixir
            };

            player.gold += gold_added;
            player.elixir += elixir_added;
            world.write_model(@player);

            // Update building's last collected time
            building.last_collected_at = current_time;
            world.write_model(@building);

            // Emit event
            world.emit_event(@ResourcesCollected {
                player: player_address,
                gold_collected: gold_added,
                elixir_collected: elixir_added,
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
                BuildingType::GoldMine => (production, 0),
                BuildingType::ElixirCollector => (0, production),
                _ => (0, 0),
            }
        }

        fn calculate_storage_capacity(
            self: @ContractState,
            world: @dojo::world::WorldStorage,
            owner: ContractAddress,
            building_count: u32
        ) -> (u64, u64) {
            let mut gold_capacity: u64 = 0;
            let mut elixir_capacity: u64 = 0;

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
                            gold_capacity += cap;
                            elixir_capacity += cap;
                        },
                        BuildingType::GoldStorage => {
                            gold_capacity += get_storage_capacity(building.building_type, building.level);
                        },
                        BuildingType::ElixirStorage => {
                            elixir_capacity += get_storage_capacity(building.building_type, building.level);
                        },
                        _ => {},
                    }
                }

                i += 1;
            };

            (gold_capacity, elixir_capacity)
        }
    }
}
