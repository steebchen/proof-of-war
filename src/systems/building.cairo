use starknet::ContractAddress;
use clash_prototype::models::building::BuildingType;

#[starknet::interface]
pub trait IBuilding<T> {
    fn place_building(ref self: T, building_type: BuildingType, x: u8, y: u8);
    fn upgrade_building(ref self: T, building_id: u32);
    fn finish_upgrade(ref self: T, building_id: u32);
    fn move_building(ref self: T, building_id: u32, new_x: u8, new_y: u8);
    fn remove_building(ref self: T, building_id: u32);
    fn repair_building(ref self: T, building_id: u32);
    fn repair_all(ref self: T);
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

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct BuildingRemoved {
    #[key]
    pub owner: ContractAddress,
    pub building_id: u32,
    pub building_type: BuildingType,
    pub refund_diamond: u64,
    pub refund_gas: u64,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct BuildingRepaired {
    #[key]
    pub owner: ContractAddress,
    pub building_id: u32,
    pub cost_diamond: u64,
    pub cost_gas: u64,
}

#[dojo::contract]
pub mod building_system {
    use super::{IBuilding, BuildingPlaced, BuildingUpgraded, BuildingRemoved, BuildingRepaired};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;

    use clash_prototype::models::player::Player;
    use clash_prototype::models::building::{Building, BuildingType, get_building_size};
    use clash_prototype::models::army::Army;
    use clash_prototype::utils::config::{
        GRID_SIZE, get_building_cost, get_building_health, get_max_building_count,
        get_upgrade_time, get_build_time, get_army_camp_capacity, get_max_level
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

            // Check free builder available
            assert(player.free_builders > 0, 'No free builders');

            // Check resources
            let cost = get_building_cost(building_type, 1);
            assert(player.diamond >= cost.diamond, 'Not enough diamond');
            assert(player.gas >= cost.gas, 'Not enough gas');

            // Check position is valid (within grid and doesn't overlap)
            let (width, height) = get_building_size(building_type);
            assert(x + width <= GRID_SIZE && y + height <= GRID_SIZE, 'Out of bounds');

            // Check collision with existing buildings
            let has_collision = self.check_collision(@world, player_address, x, y, width, height, player.building_count, 0);
            assert(!has_collision, 'Building collision');

            // Deduct resources and assign builder
            player.diamond -= cost.diamond;
            player.gas -= cost.gas;
            player.free_builders -= 1;
            player.building_count += 1;
            world.write_model(@player);

            // Create building at level 0 with construction timer
            let build_time = get_build_time(building_type);
            let new_building = Building {
                owner: player_address,
                building_id: player.building_count,
                building_type,
                level: 0,
                x,
                y,
                health: 0,
                is_upgrading: true,
                upgrade_finish_time: current_time + build_time,
                last_collected_at: current_time,
            };
            world.write_model(@new_building);

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
            assert(building.level < get_max_level(building.building_type), 'Max level reached');

            // Check free builder available
            assert(player.free_builders > 0, 'No free builders');

            // Check upgrade resources (next level cost)
            let cost = get_building_cost(building.building_type, building.level + 1);
            assert(player.diamond >= cost.diamond, 'Not enough diamond');
            assert(player.gas >= cost.gas, 'Not enough gas');

            // Deduct resources and assign builder
            player.diamond -= cost.diamond;
            player.gas -= cost.gas;
            player.free_builders -= 1;
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

            assert(building.is_upgrading, 'Not upgrading');
            assert(current_time >= building.upgrade_finish_time, 'Upgrade not finished');

            // Complete upgrade (handles both construction level 0→1 and upgrades)
            building.level += 1;
            building.is_upgrading = false;
            building.upgrade_finish_time = 0;
            building.health = get_building_health(building.building_type, building.level);
            world.write_model(@building);

            // Free the builder
            let mut player: Player = world.read_model(player_address);
            player.free_builders += 1;

            // Update town hall level in player if it's a town hall
            if building.building_type == BuildingType::TownHall {
                player.town_hall_level = building.level;
            }

            world.write_model(@player);

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

        fn remove_building(ref self: ContractState, building_id: u32) {
            let mut world = self.world_default();
            let player_address = get_caller_address();

            // Get player and building
            let mut player: Player = world.read_model(player_address);
            let mut building: Building = world.read_model((player_address, building_id));

            assert(building.level > 0, 'Building not found');
            assert(!building.is_upgrading, 'Cannot remove while upgrading');
            assert(building.building_type != BuildingType::TownHall, 'Cannot remove town hall');

            // Calculate refund (50% of total invested cost for current level)
            let cost = get_building_cost(building.building_type, 1);
            let refund_diamond = cost.diamond / 2;
            let refund_gas = cost.gas / 2;

            // Refund resources
            player.diamond += refund_diamond;
            player.gas += refund_gas;
            world.write_model(@player);

            // Reduce army capacity if removing army camp
            if building.building_type == BuildingType::ArmyCamp {
                let mut army: Army = world.read_model(player_address);
                let camp_capacity = get_army_camp_capacity(building.level);
                if army.max_capacity >= camp_capacity {
                    army.max_capacity -= camp_capacity;
                } else {
                    army.max_capacity = 0;
                }
                world.write_model(@army);
            }

            let removed_type = building.building_type;

            // Soft-delete: set level to 0 and clear data
            building.level = 0;
            building.health = 0;
            building.is_upgrading = false;
            building.upgrade_finish_time = 0;
            world.write_model(@building);

            // Emit event
            world.emit_event(@BuildingRemoved {
                owner: player_address,
                building_id,
                building_type: removed_type,
                refund_diamond,
                refund_gas,
            });
        }

        fn repair_building(ref self: ContractState, building_id: u32) {
            let mut world = self.world_default();
            let player_address = get_caller_address();

            // Get player and building
            let mut player: Player = world.read_model(player_address);
            let mut building: Building = world.read_model((player_address, building_id));

            assert(building.level > 0, 'Building not found');
            assert(!building.is_upgrading, 'Cannot repair while upgrading');

            let max_health = get_building_health(building.building_type, building.level);
            assert(building.health < max_health, 'Building already full health');

            // Repair cost = 25% of building cost scaled by damage ratio
            let cost = get_building_cost(building.building_type, building.level);
            let damage = max_health - building.health;
            let cost_diamond = (cost.diamond * damage.into()) / (max_health.into() * 4);
            let cost_gas = (cost.gas * damage.into()) / (max_health.into() * 4);

            assert(player.diamond >= cost_diamond, 'Not enough diamond');
            assert(player.gas >= cost_gas, 'Not enough gas');

            // Deduct resources
            player.diamond -= cost_diamond;
            player.gas -= cost_gas;
            world.write_model(@player);

            // Repair to full health
            building.health = max_health;
            world.write_model(@building);

            // Emit event
            world.emit_event(@BuildingRepaired {
                owner: player_address,
                building_id,
                cost_diamond,
                cost_gas,
            });
        }

        fn repair_all(ref self: ContractState) {
            let mut world = self.world_default();
            let player_address = get_caller_address();

            let mut player: Player = world.read_model(player_address);
            assert(player.town_hall_level > 0, 'Player not spawned');

            let mut total_cost_diamond: u64 = 0;
            let mut total_cost_gas: u64 = 0;

            // First pass: calculate total cost
            let mut i: u32 = 1;
            loop {
                if i > player.building_count {
                    break;
                }
                let building: Building = world.read_model((player_address, i));
                if building.level > 0 && !building.is_upgrading {
                    let max_health = get_building_health(building.building_type, building.level);
                    if building.health < max_health {
                        let cost = get_building_cost(building.building_type, building.level);
                        let damage = max_health - building.health;
                        total_cost_diamond += (cost.diamond * damage.into()) / (max_health.into() * 4);
                        total_cost_gas += (cost.gas * damage.into()) / (max_health.into() * 4);
                    }
                }
                i += 1;
            };

            assert(total_cost_diamond > 0 || total_cost_gas > 0, 'Nothing to repair');
            assert(player.diamond >= total_cost_diamond, 'Not enough diamond');
            assert(player.gas >= total_cost_gas, 'Not enough gas');

            // Deduct total cost
            player.diamond -= total_cost_diamond;
            player.gas -= total_cost_gas;
            world.write_model(@player);

            // Second pass: repair all buildings
            let mut i: u32 = 1;
            loop {
                if i > player.building_count {
                    break;
                }
                let mut building: Building = world.read_model((player_address, i));
                if building.level > 0 && !building.is_upgrading {
                    let max_health = get_building_health(building.building_type, building.level);
                    if building.health < max_health {
                        building.health = max_health;
                        world.write_model(@building);
                    }
                }
                i += 1;
            };
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
                if (building.level > 0 || building.is_upgrading) && building.building_type == building_type {
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
                    if building.level > 0 || building.is_upgrading {
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
