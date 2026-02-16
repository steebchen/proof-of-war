use starknet::ContractAddress;
use clash_prototype::models::building::BuildingType;

#[starknet::interface]
pub trait IBuilding<T> {
    fn place_building(ref self: T, building_type: BuildingType, x: u8, y: u8);
    fn upgrade_building(ref self: T, building_id: u32);
    fn finish_upgrade(ref self: T, building_id: u32);
    fn move_building(ref self: T, building_id: u32, new_x: u8, new_y: u8);
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct BuildingPlaced {
    #[key]
    pub owner: ContractAddress,
    pub building_id: u32,
    pub building_type: BuildingType,
    pub x: u8,
    pub y: u8,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct BuildingUpgraded {
    #[key]
    pub owner: ContractAddress,
    pub building_id: u32,
    pub new_level: u8,
}

#[dojo::contract]
pub mod building_system {
    use super::{IBuilding, BuildingPlaced, BuildingUpgraded};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;

    use clash_prototype::models::player::Player;
    use clash_prototype::models::building::{Building, BuildingType, get_building_size};
    use clash_prototype::models::army::Army;
    use clash_prototype::utils::config::{
        GRID_SIZE, get_building_cost, get_building_health, get_max_building_count,
        get_upgrade_time, get_army_camp_capacity
    };

    #[abi(embed_v0)]
    impl BuildingImpl of IBuilding<ContractState> {
        fn place_building(ref self: ContractState, building_type: BuildingType, x: u8, y: u8) {
            let mut world = self.world_default();
            let player_address = get_caller_address();
            let current_time = get_block_timestamp();

            // Get player
            let mut player: Player = world.read_model(player_address);
            assert(player.town_hall_level > 0, 'Player not spawned');

            // Cannot place another town hall
            assert(building_type != BuildingType::TownHall, 'Cannot place town hall');

            // Check building limit
            let max_count = get_max_building_count(building_type, player.town_hall_level);
            let current_count = self.count_buildings_of_type(@world, player_address, building_type, player.building_count);
            assert(current_count < max_count.into(), 'Building limit reached');

            // Check resources
            let cost = get_building_cost(building_type, 1);
            assert(player.gold >= cost.gold, 'Not enough gold');
            assert(player.elixir >= cost.elixir, 'Not enough elixir');

            // Check position is valid (within grid and doesn't overlap)
            let (width, height) = get_building_size(building_type);
            assert(x + width <= GRID_SIZE && y + height <= GRID_SIZE, 'Out of bounds');

            // Check collision with existing buildings
            let has_collision = self.check_collision(@world, player_address, x, y, width, height, player.building_count, 0);
            assert(!has_collision, 'Building collision');

            // Deduct resources
            player.gold -= cost.gold;
            player.elixir -= cost.elixir;
            player.building_count += 1;
            world.write_model(@player);

            // Create building
            let new_building = Building {
                owner: player_address,
                building_id: player.building_count,
                building_type,
                level: 1,
                x,
                y,
                health: get_building_health(building_type, 1),
                is_upgrading: false,
                upgrade_finish_time: 0,
                last_collected_at: current_time,
            };
            world.write_model(@new_building);

            // Update army capacity if it's an army camp
            if building_type == BuildingType::ArmyCamp {
                let mut army: Army = world.read_model(player_address);
                army.max_capacity += get_army_camp_capacity(1);
                world.write_model(@army);
            }

            // Emit event
            world.emit_event(@BuildingPlaced {
                owner: player_address,
                building_id: player.building_count,
                building_type,
                x,
                y,
            });
        }

        fn upgrade_building(ref self: ContractState, building_id: u32) {
            let mut world = self.world_default();
            let player_address = get_caller_address();
            let current_time = get_block_timestamp();

            // Get player and building
            let mut player: Player = world.read_model(player_address);
            let mut building: Building = world.read_model((player_address, building_id));

            assert(building.level > 0, 'Building not found');
            assert(!building.is_upgrading, 'Already upgrading');

            // Check upgrade resources (next level cost)
            let cost = get_building_cost(building.building_type, building.level + 1);
            assert(player.gold >= cost.gold, 'Not enough gold');
            assert(player.elixir >= cost.elixir, 'Not enough elixir');

            // Deduct resources
            player.gold -= cost.gold;
            player.elixir -= cost.elixir;
            world.write_model(@player);

            // Start upgrade
            let upgrade_time = get_upgrade_time(building.building_type, building.level + 1);
            building.is_upgrading = true;
            building.upgrade_finish_time = current_time + upgrade_time;
            world.write_model(@building);
        }

        fn finish_upgrade(ref self: ContractState, building_id: u32) {
            let mut world = self.world_default();
            let player_address = get_caller_address();
            let current_time = get_block_timestamp();

            // Get building
            let mut building: Building = world.read_model((player_address, building_id));

            assert(building.level > 0, 'Building not found');
            assert(building.is_upgrading, 'Not upgrading');
            assert(current_time >= building.upgrade_finish_time, 'Upgrade not finished');

            // Complete upgrade
            building.level += 1;
            building.is_upgrading = false;
            building.upgrade_finish_time = 0;
            building.health = get_building_health(building.building_type, building.level);
            world.write_model(@building);

            // Update town hall level in player if it's a town hall
            if building.building_type == BuildingType::TownHall {
                let mut player: Player = world.read_model(player_address);
                player.town_hall_level = building.level;
                world.write_model(@player);
            }

            // Update army capacity if it's an army camp
            if building.building_type == BuildingType::ArmyCamp {
                let mut army: Army = world.read_model(player_address);
                let old_capacity = get_army_camp_capacity(building.level - 1);
                let new_capacity = get_army_camp_capacity(building.level);
                army.max_capacity += (new_capacity - old_capacity);
                world.write_model(@army);
            }

            // Emit event
            world.emit_event(@BuildingUpgraded {
                owner: player_address,
                building_id,
                new_level: building.level,
            });
        }

        fn move_building(ref self: ContractState, building_id: u32, new_x: u8, new_y: u8) {
            let mut world = self.world_default();
            let player_address = get_caller_address();

            // Get player and building
            let player: Player = world.read_model(player_address);
            let mut building: Building = world.read_model((player_address, building_id));

            assert(building.level > 0, 'Building not found');
            assert(!building.is_upgrading, 'Cannot move while upgrading');

            // Check position is valid
            let (width, height) = get_building_size(building.building_type);
            assert(new_x + width <= GRID_SIZE && new_y + height <= GRID_SIZE, 'Out of bounds');

            // Check collision (excluding self)
            let has_collision = self.check_collision(@world, player_address, new_x, new_y, width, height, player.building_count, building_id);
            assert(!has_collision, 'Building collision');

            // Move building
            building.x = new_x;
            building.y = new_y;
            world.write_model(@building);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"clash")
        }

        fn count_buildings_of_type(
            self: @ContractState,
            world: @dojo::world::WorldStorage,
            owner: ContractAddress,
            building_type: BuildingType,
            building_count: u32
        ) -> u32 {
            let mut count: u32 = 0;
            let mut i: u32 = 1;
            loop {
                if i > building_count {
                    break;
                }
                let building: Building = world.read_model((owner, i));
                if building.level > 0 && building.building_type == building_type {
                    count += 1;
                }
                i += 1;
            };
            count
        }

        fn check_collision(
            self: @ContractState,
            world: @dojo::world::WorldStorage,
            owner: ContractAddress,
            x: u8,
            y: u8,
            width: u8,
            height: u8,
            building_count: u32,
            exclude_id: u32
        ) -> bool {
            let mut i: u32 = 1;
            loop {
                if i > building_count {
                    break false;
                }

                if i != exclude_id {
                    let building: Building = world.read_model((owner, i));
                    if building.level > 0 {
                        let (b_width, b_height) = get_building_size(building.building_type);

                        // Check AABB collision
                        let overlaps_x = x < building.x + b_width && x + width > building.x;
                        let overlaps_y = y < building.y + b_height && y + height > building.y;

                        if overlaps_x && overlaps_y {
                            break true;
                        }
                    }
                }
                i += 1;
            }
        }
    }
}
