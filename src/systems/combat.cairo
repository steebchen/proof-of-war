use starknet::ContractAddress;
use clash_prototype::models::troop::TroopType;

#[starknet::interface]
pub trait ICombat<T> {
    fn start_attack(ref self: T, defender: ContractAddress);
    fn deploy_troop(ref self: T, battle_id: u32, troop_type: TroopType, x: u16, y: u16);
    fn resolve_battle(ref self: T, battle_id: u32);
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct BattleStarted {
    #[key]
    pub battle_id: u32,
    pub attacker: ContractAddress,
    pub defender: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct TroopDeployed {
    #[key]
    pub battle_id: u32,
    pub troop_id: u32,
    pub troop_type: TroopType,
    pub x: u16,
    pub y: u16,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct BattleEnded {
    #[key]
    pub battle_id: u32,
    pub attacker: ContractAddress,
    pub defender: ContractAddress,
    pub destruction_percent: u8,
    pub diamond_stolen: u64,
    pub gas_stolen: u64,
}

#[dojo::contract]
pub mod combat_system {
    use super::{ICombat, BattleStarted, TroopDeployed, BattleEnded};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;

    use clash_prototype::models::player::Player;
    use clash_prototype::models::building::{Building, BuildingType};
    use clash_prototype::models::army::Army;
    use clash_prototype::models::troop::{TroopType, get_troop_config};
    use clash_prototype::models::battle::{
        Battle, BattleStatus, DeployedTroop, BattleBuilding, BattleCounter
    };
    use clash_prototype::utils::config::{
        BATTLE_DURATION, TROPHY_WIN_BASE, TROPHY_LOSS_BASE, LOOT_PERCENTAGE,
        TICKS_PER_BATTLE, SHIELD_DURATION, get_defense_stats
    };

    #[abi(embed_v0)]
    impl CombatImpl of ICombat<ContractState> {
        fn start_attack(ref self: ContractState, defender: ContractAddress) {
            let mut world = self.world_default();
            let attacker = get_caller_address();
            let current_time = get_block_timestamp();

            // Validation
            assert(attacker != defender, 'Cannot attack yourself');

            let attacker_player: Player = world.read_model(attacker);
            let defender_player: Player = world.read_model(defender);

            assert(attacker_player.town_hall_level > 0, 'Attacker not spawned');
            assert(defender_player.town_hall_level > 0, 'Defender not found');

            // Check defender is not shielded
            assert(defender_player.shield_until < current_time, 'Defender is shielded');

            // Check attacker has troops
            let attacker_army: Army = world.read_model(attacker);
            assert(attacker_army.total_space_used > 0, 'No troops to attack');

            // Get and increment battle counter
            let mut counter: BattleCounter = world.read_model(0_u8);
            let battle_id = counter.next_battle_id;
            counter.next_battle_id += 1;
            world.write_model(@counter);

            // Calculate loot available
            let diamond_loot = defender_player.diamond * LOOT_PERCENTAGE / 100;
            let gas_loot = defender_player.gas * LOOT_PERCENTAGE / 100;

            // Create battle
            let battle = Battle {
                battle_id,
                attacker,
                defender,
                status: BattleStatus::Preparing,
                started_at: current_time,
                ends_at: current_time + BATTLE_DURATION,
                destruction_percent: 0,
                diamond_stolen: 0,
                gas_stolen: 0,
                attacker_trophies_change: 0,
                defender_trophies_change: 0,
                deployed_troop_count: 0,
                building_count: 0,
                tick_count: 0,
            };
            world.write_model(@battle);

            // Count active buildings first for proper loot distribution
            let mut active_building_count: u32 = 0;
            let mut i: u32 = 1;
            loop {
                if i > defender_player.building_count {
                    break;
                }
                let building: Building = world.read_model((defender, i));
                if building.level > 0 {
                    active_building_count += 1;
                }
                i += 1;
            };

            assert(active_building_count > 0, 'Defender has no buildings');

            // Snapshot defender's buildings with correct loot distribution
            let mut building_count: u32 = 0;
            let mut i: u32 = 1;
            loop {
                if i > defender_player.building_count {
                    break;
                }

                let building: Building = world.read_model((defender, i));
                if building.level > 0 {
                    building_count += 1;

                    // Distribute loot evenly across active buildings only
                    let building_diamond = diamond_loot / active_building_count.into();
                    let building_gas = gas_loot / active_building_count.into();

                    let battle_building = BattleBuilding {
                        battle_id,
                        building_id: i,
                        building_type: building.building_type,
                        level: building.level,
                        x: building.x,
                        y: building.y,
                        max_health: building.health,
                        current_health: building.health,
                        is_destroyed: false,
                        diamond_loot: building_diamond,
                        gas_loot: building_gas,
                    };
                    world.write_model(@battle_building);
                }

                i += 1;
            };

            // Update battle with building count
            let mut battle: Battle = world.read_model(battle_id);
            battle.building_count = building_count;
            world.write_model(@battle);

            // Emit event
            world.emit_event(@BattleStarted {
                battle_id,
                attacker,
                defender,
            });
        }

        fn deploy_troop(ref self: ContractState, battle_id: u32, troop_type: TroopType, x: u16, y: u16) {
            let mut world = self.world_default();
            let player = get_caller_address();
            let current_time = get_block_timestamp();

            // Get battle
            let mut battle: Battle = world.read_model(battle_id);
            assert(battle.attacker == player, 'Not the attacker');
            assert(battle.status == BattleStatus::Preparing || battle.status == BattleStatus::InProgress, 'Battle not active');
            assert(current_time <= battle.ends_at, 'Battle expired');

            // Check bounds (grid is 40x40, but scaled for pixel precision)
            assert(x < 400 && y < 400, 'Out of bounds');

            // Check attacker has this troop type
            let mut army: Army = world.read_model(player);
            let config = get_troop_config(troop_type);

            match troop_type {
                TroopType::Barbarian => {
                    assert(army.barbarians > 0, 'No barbarians');
                    army.barbarians -= 1;
                },
                TroopType::Archer => {
                    assert(army.archers > 0, 'No archers');
                    army.archers -= 1;
                },
            }

            // Update army
            army.total_space_used -= config.housing_space.into();
            world.write_model(@army);

            // Create deployed troop
            let troop_id = battle.deployed_troop_count + 1;
            let deployed = DeployedTroop {
                battle_id,
                troop_id,
                troop_type,
                x,
                y,
                health: config.health,
                is_alive: true,
                target_building_id: 0,
            };
            world.write_model(@deployed);

            // Update battle
            battle.deployed_troop_count += 1;
            if battle.status == BattleStatus::Preparing {
                battle.status = BattleStatus::InProgress;
            }
            world.write_model(@battle);

            // Emit event
            world.emit_event(@TroopDeployed {
                battle_id,
                troop_id,
                troop_type,
                x,
                y,
            });
        }

        fn resolve_battle(ref self: ContractState, battle_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            // Get battle
            let mut battle: Battle = world.read_model(battle_id);
            assert(battle.attacker == caller, 'Not the attacker');
            assert(battle.status == BattleStatus::InProgress, 'Battle not in progress');
            assert(battle.deployed_troop_count > 0, 'No troops deployed');

            // Run simulation for TICKS_PER_BATTLE ticks
            let mut tick: u32 = 0;
            loop {
                if tick >= TICKS_PER_BATTLE {
                    break;
                }
                tick += 1;

                // === 1. Move troops toward targets and attack ===
                let mut troop_idx: u32 = 1;
                loop {
                    if troop_idx > battle.deployed_troop_count {
                        break;
                    }

                    let mut troop: DeployedTroop = world.read_model((battle_id, troop_idx));

                    if troop.is_alive {
                        let config = get_troop_config(troop.troop_type);

                        // Find nearest building if no target or target destroyed
                        if troop.target_building_id > 0 {
                            let current_target: BattleBuilding = world.read_model((battle_id, troop.target_building_id));
                            if current_target.is_destroyed {
                                troop.target_building_id = 0;
                            }
                        }

                        if troop.target_building_id == 0 {
                            let nearest = self.find_nearest_building(@world, battle_id, battle.building_count, troop.x, troop.y);
                            troop.target_building_id = nearest;
                        }

                        // Move toward target or attack
                        if troop.target_building_id > 0 {
                            let mut target: BattleBuilding = world.read_model((battle_id, troop.target_building_id));

                            if !target.is_destroyed {
                                // Calculate distance to target (in pixel coords)
                                let target_x: u32 = target.x.into() * 10;
                                let target_y: u32 = target.y.into() * 10;
                                let troop_x: u32 = troop.x.into();
                                let troop_y: u32 = troop.y.into();

                                let abs_dx: u32 = if troop_x > target_x { troop_x - target_x } else { target_x - troop_x };
                                let abs_dy: u32 = if troop_y > target_y { troop_y - target_y } else { target_y - troop_y };
                                let dist_sq: u32 = abs_dx * abs_dx + abs_dy * abs_dy;

                                let range_px: u32 = config.attack_range.into() * 10;
                                let range_sq: u32 = range_px * range_px;

                                if dist_sq <= range_sq {
                                    // In range — attack
                                    if target.current_health <= config.damage {
                                        target.current_health = 0;
                                        target.is_destroyed = true;

                                        // Loot the building
                                        battle.diamond_stolen += target.diamond_loot;
                                        battle.gas_stolen += target.gas_loot;

                                        // Calculate destruction percentage
                                        let destroyed_count = self.count_destroyed_buildings(@world, battle_id, battle.building_count);
                                        battle.destruction_percent = ((destroyed_count * 100) / battle.building_count).try_into().unwrap();

                                        // Clear target so troop finds a new one next tick
                                        troop.target_building_id = 0;
                                    } else {
                                        target.current_health -= config.damage;
                                    }

                                    world.write_model(@target);
                                } else {
                                    // Not in range — move toward target
                                    let speed: u16 = config.movement_speed.into();
                                    let abs_dx_16: u16 = abs_dx.try_into().unwrap();
                                    let abs_dy_16: u16 = abs_dy.try_into().unwrap();

                                    let (x_move, y_move) = if abs_dx_16 >= abs_dy_16 {
                                        let xm = if speed < abs_dx_16 { speed } else { abs_dx_16 };
                                        let remaining = speed - xm;
                                        let ym = if remaining < abs_dy_16 { remaining } else { abs_dy_16 };
                                        (xm, ym)
                                    } else {
                                        let ym = if speed < abs_dy_16 { speed } else { abs_dy_16 };
                                        let remaining = speed - ym;
                                        let xm = if remaining < abs_dx_16 { remaining } else { abs_dx_16 };
                                        (xm, ym)
                                    };

                                    // Apply direction
                                    if troop_x > target_x {
                                        troop.x -= x_move;
                                    } else {
                                        troop.x += x_move;
                                    }
                                    if troop_y > target_y {
                                        troop.y -= y_move;
                                    } else {
                                        troop.y += y_move;
                                    }
                                }
                            }
                        }

                        world.write_model(@troop);
                    }

                    troop_idx += 1;
                };

                // === 2. Defenses counter-attack (use real stats) ===
                let mut building_idx: u32 = 1;
                loop {
                    if building_idx > battle.building_count {
                        break;
                    }

                    let defense: BattleBuilding = world.read_model((battle_id, building_idx));

                    if !defense.is_destroyed {
                        let is_defense = defense.building_type == BuildingType::Cannon
                            || defense.building_type == BuildingType::ArcherTower;

                        if is_defense {
                            let defense_stats = get_defense_stats(defense.building_type, defense.level);
                            let defense_range_px: u32 = defense_stats.range.into() * 10;
                            let defense_range_sq: u32 = defense_range_px * defense_range_px;

                            // Find nearest alive troop
                            let (nearest_troop_id, nearest_dist) = self.find_nearest_troop(
                                @world, battle_id, battle.deployed_troop_count, defense.x.into(), defense.y.into()
                            );

                            // Only attack if troop is within range
                            if nearest_troop_id > 0 && nearest_dist <= defense_range_sq {
                                let mut target_troop: DeployedTroop = world.read_model((battle_id, nearest_troop_id));

                                if target_troop.is_alive {
                                    if target_troop.health <= defense_stats.damage {
                                        target_troop.health = 0;
                                        target_troop.is_alive = false;
                                    } else {
                                        target_troop.health -= defense_stats.damage;
                                    }
                                    world.write_model(@target_troop);
                                }
                            }
                        }
                    }

                    building_idx += 1;
                };

                // === 3. Check end conditions ===
                if battle.destruction_percent == 100 {
                    break;
                }

                let alive_troops = self.count_alive_troops(@world, battle_id, battle.deployed_troop_count);
                if alive_troops == 0 {
                    break;
                }
            };

            // Record how many ticks the battle ran
            battle.tick_count = tick;

            // Save battle state before ending
            world.write_model(@battle);

            // End battle: transfer loot, calculate trophies
            self._end_battle(ref world, battle_id);
        }
    }

    #[generate_trait]
    impl InternalImpl of InternalTrait {
        fn world_default(self: @ContractState) -> dojo::world::WorldStorage {
            self.world(@"clash")
        }

        fn _end_battle(ref self: ContractState, ref world: dojo::world::WorldStorage, battle_id: u32) {
            let mut battle: Battle = world.read_model(battle_id);

            if battle.status == BattleStatus::Ended {
                return;
            }

            // Get players
            let mut attacker_player: Player = world.read_model(battle.attacker);
            let mut defender_player: Player = world.read_model(battle.defender);

            // Transfer resources
            attacker_player.diamond += battle.diamond_stolen;
            attacker_player.gas += battle.gas_stolen;

            if defender_player.diamond >= battle.diamond_stolen {
                defender_player.diamond -= battle.diamond_stolen;
            } else {
                defender_player.diamond = 0;
            }

            if defender_player.gas >= battle.gas_stolen {
                defender_player.gas -= battle.gas_stolen;
            } else {
                defender_player.gas = 0;
            }

            // Calculate trophy changes based on destruction
            let trophy_change: i32 = if battle.destruction_percent >= 50 {
                TROPHY_WIN_BASE
            } else if battle.destruction_percent >= 25 {
                TROPHY_WIN_BASE / 2
            } else {
                TROPHY_LOSS_BASE / 2
            };

            battle.attacker_trophies_change = trophy_change;
            battle.defender_trophies_change = -trophy_change;

            // Update trophies
            if trophy_change > 0 {
                attacker_player.trophies += trophy_change.try_into().unwrap();
                if defender_player.trophies >= trophy_change.try_into().unwrap() {
                    defender_player.trophies -= trophy_change.try_into().unwrap();
                } else {
                    defender_player.trophies = 0;
                }
            } else {
                let loss: u32 = (-trophy_change).try_into().unwrap();
                if attacker_player.trophies >= loss {
                    attacker_player.trophies -= loss;
                } else {
                    attacker_player.trophies = 0;
                }
                defender_player.trophies += loss;
            }

            // Grant shield to defender after being attacked
            let current_time = get_block_timestamp();
            defender_player.shield_until = current_time + SHIELD_DURATION;

            // Update battle status
            battle.status = BattleStatus::Ended;

            // Save all
            world.write_model(@battle);
            world.write_model(@attacker_player);
            world.write_model(@defender_player);

            // Emit event
            world.emit_event(@BattleEnded {
                battle_id,
                attacker: battle.attacker,
                defender: battle.defender,
                destruction_percent: battle.destruction_percent,
                diamond_stolen: battle.diamond_stolen,
                gas_stolen: battle.gas_stolen,
            });
        }

        fn find_nearest_building(
            self: @ContractState,
            world: @dojo::world::WorldStorage,
            battle_id: u32,
            building_count: u32,
            troop_x: u16,
            troop_y: u16
        ) -> u32 {
            let mut nearest_id: u32 = 0;
            let mut nearest_dist: u32 = 0xFFFFFFFF;

            let mut i: u32 = 1;
            loop {
                if i > building_count {
                    break;
                }

                let building: BattleBuilding = world.read_model((battle_id, i));

                if !building.is_destroyed {
                    let bx: u32 = building.x.into() * 10;
                    let by: u32 = building.y.into() * 10;
                    let tx: u32 = troop_x.into();
                    let ty: u32 = troop_y.into();

                    let dx: u32 = if tx > bx { tx - bx } else { bx - tx };
                    let dy: u32 = if ty > by { ty - by } else { by - ty };
                    let dist = dx * dx + dy * dy;

                    if dist < nearest_dist {
                        nearest_dist = dist;
                        nearest_id = i;
                    }
                }

                i += 1;
            };

            nearest_id
        }

        fn find_nearest_troop(
            self: @ContractState,
            world: @dojo::world::WorldStorage,
            battle_id: u32,
            troop_count: u32,
            building_x: u16,
            building_y: u16
        ) -> (u32, u32) {
            let mut nearest_id: u32 = 0;
            let mut nearest_dist: u32 = 0xFFFFFFFF;

            let mut i: u32 = 1;
            loop {
                if i > troop_count {
                    break;
                }

                let troop: DeployedTroop = world.read_model((battle_id, i));

                if troop.is_alive {
                    let bx: u32 = building_x.into() * 10;
                    let by: u32 = building_y.into() * 10;
                    let tx: u32 = troop.x.into();
                    let ty: u32 = troop.y.into();

                    let dx: u32 = if tx > bx { tx - bx } else { bx - tx };
                    let dy: u32 = if ty > by { ty - by } else { by - ty };
                    let dist = dx * dx + dy * dy;

                    if dist < nearest_dist {
                        nearest_dist = dist;
                        nearest_id = i;
                    }
                }

                i += 1;
            };

            (nearest_id, nearest_dist)
        }

        fn count_destroyed_buildings(
            self: @ContractState,
            world: @dojo::world::WorldStorage,
            battle_id: u32,
            building_count: u32
        ) -> u32 {
            let mut count: u32 = 0;
            let mut i: u32 = 1;
            loop {
                if i > building_count {
                    break;
                }
                let building: BattleBuilding = world.read_model((battle_id, i));
                if building.is_destroyed {
                    count += 1;
                }
                i += 1;
            };
            count
        }

        fn count_alive_troops(
            self: @ContractState,
            world: @dojo::world::WorldStorage,
            battle_id: u32,
            troop_count: u32
        ) -> u32 {
            let mut count: u32 = 0;
            let mut i: u32 = 1;
            loop {
                if i > troop_count {
                    break;
                }
                let troop: DeployedTroop = world.read_model((battle_id, i));
                if troop.is_alive {
                    count += 1;
                }
                i += 1;
            };
            count
        }
    }
}
