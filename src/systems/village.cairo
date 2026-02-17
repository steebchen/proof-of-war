use starknet::ContractAddress;

#[starknet::interface]
pub trait IVillage<T> {
    fn spawn(ref self: T, username: felt252);
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct PlayerSpawned {
    #[key]
    pub player: ContractAddress,
    pub username: felt252,
}

#[dojo::contract]
pub mod village {
    use super::{IVillage, PlayerSpawned};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;

    use clash_prototype::models::player::Player;
    use clash_prototype::models::building::{Building, BuildingType};
    use clash_prototype::models::army::Army;
    use clash_prototype::utils::config::{
        STARTING_DIAMOND, STARTING_GAS, get_building_health
    };

    #[abi(embed_v0)]
    impl VillageImpl of IVillage<ContractState> {
        fn spawn(ref self: ContractState, username: felt252) {
            let mut world = self.world_default();
            let player_address = get_caller_address();
            let current_time = get_block_timestamp();

            // Check if player already exists
            let existing_player: Player = world.read_model(player_address);
            assert(existing_player.town_hall_level == 0, 'Player already exists');

            // Create player
            let player = Player {
                address: player_address,
                username,
                diamond: STARTING_DIAMOND,
                gas: STARTING_GAS,
                trophies: 0,
                town_hall_level: 1,
                building_count: 1,
                last_collected_at: current_time,
                total_builders: 1,
                free_builders: 1,
                max_builders: 1,
            };
            world.write_model(@player);

            // Create starter Town Hall at center of grid (position 18, 18)
            let town_hall = Building {
                owner: player_address,
                building_id: 1,
                building_type: BuildingType::TownHall,
                level: 1,
                x: 18,
                y: 18,
                health: get_building_health(BuildingType::TownHall, 1),
                is_upgrading: false,
                upgrade_finish_time: 0,
                last_collected_at: current_time,
            };
            world.write_model(@town_hall);

            // Initialize empty army
            let army = Army {
                owner: player_address,
                barbarians: 0,
                archers: 0,
                total_space_used: 0,
                max_capacity: 0, // No army camps yet
            };
            world.write_model(@army);

            // Emit spawn event
            world.emit_event(@PlayerSpawned {
                player: player_address,
                username,
            });
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"clash")
        }
    }
}
