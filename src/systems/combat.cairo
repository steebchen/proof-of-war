use starknet::ContractAddress;
use clash_prototype::models::troop::TroopType;

#[starknet::interface]
pub trait ICombat<T> {
    fn start_attack(ref self: T, defender: ContractAddress);
    fn deploy_troop(ref self: T, battle_id: u32, troop_type: TroopType, x: u16, y: u16);
    fn process_combat(ref self: T, battle_id: u32);
    fn end_battle(ref self: T, battle_id: u32);
}

#[derive(Introspect, Drop, Serde)]
#[dojo::event]
pub struct BattleStarted {
    #[key]
    pub battle_id: u32,
    pub attacker: ContractAddress,
    pub defender: ContractAddress,
}

#[derive(Introspect, Drop, Serde)]
#[dojo::event]
pub struct TroopDeployed {
    #[key]
    pub battle_id: u32,
    pub troop_id: u32,
    pub troop_type: TroopType,
    pub x: u16,
    pub y: u16,
}

#[derive(Introspect, Drop, Serde)]
#[dojo::event]
pub struct BattleEnded {
    #[key]
    pub battle_id: u32,
    pub attacker: ContractAddress,
    pub defender: ContractAddress,
    pub destruction_percent: u8,
    pub gold_stolen: u64,
    pub elixir_stolen: u64,
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
        BATTLE_DURATION, TROPHY_WIN_BASE, TROPHY_LOSS_BASE, LOOT_PERCENTAGE
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

            // Check attacker has troops
            let attacker_army: Army = world.read_model(attacker);
            assert(attacker_army.total_space_used > 0, 'No troops to attack');

            // Get and increment battle counter
            let mut counter: BattleCounter = world.read_model(0_u8);
            let battle_id = counter.next_battle_id;
            counter.next_battle_id += 1;
            world.write_model(@counter);

            // Calculate loot available
            let gold_loot = defender_player.gold * LOOT_PERCENTAGE / 100;
            let elixir_loot = defender_player.elixir * LOOT_PERCENTAGE / 100;

            // Create battle
            let battle = Battle {
                battle_id,
                attacker,
                defender,
                status: BattleStatus::Preparing,
                started_at: current_time,
                ends_at: current_time + BATTLE_DURATION,
                destruction_percent: 0,
                gold_stolen: 0,
                elixir_stolen: 0,
                attacker_trophies_change: 0,
                defender_trophies_change: 0,
                deployed_troop_count: 0,
                building_count: 0,
            };
            world.write_model(@battle);

            // Snapshot defender's buildings
            let mut building_count: u32 = 0;
            let mut i: u32 = 1;
            loop {
                if i > defender_player.building_count {
                    break;
                }

                let building: Building = world.read_model((defender, i));
                if building.level > 0 {
                    building_count += 1;

                    // Distribute loot across buildings proportionally
                    let building_gold = gold_loot / defender_player.building_count.into();
                    let building_elixir = elixir_loot / defender_player.building_count.into();

                    let battle_building = BattleBuilding {
                        battle_id,
                        building_id: i,
                        building_type: building.building_type,
                        x: building.x,
                        y: building.y,
                        max_health: building.health,
                        current_health: building.health,
                        is_destroyed: false,
                        gold_loot: building_gold,
                        elixir_loot: building_elixir,
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

            // Get battle
            let mut battle: Battle = world.read_model(battle_id);
            assert(battle.attacker == player, 'Not the attacker');
            assert(battle.status == BattleStatus::Preparing || battle.status == BattleStatus::InProgress, 'Battle not active');

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

        fn process_combat(ref self: ContractState, battle_id: u32) {
            let mut world = self.world_default();
            let current_time = get_block_timestamp();

            // Get battle
            let mut battle: Battle = world.read_model(battle_id);
            assert(battle.status == BattleStatus::InProgress, 'Battle not in progress');

            // Process each deployed troop
            let mut troop_idx: u32 = 1;
            loop {
                if troop_idx > battle.deployed_troop_count {
                    break;
                }

                let mut troop: DeployedTroop = world.read_model((battle_id, troop_idx));

                if troop.is_alive {
                    let config = get_troop_config(troop.troop_type);

                    // Find nearest building if no target
                    if troop.target_building_id == 0 {
                        let nearest = self.find_nearest_building(@world, battle_id, battle.building_count, troop.x, troop.y);
                        troop.target_building_id = nearest;
                        world.write_model(@troop);
                    }

                    // Attack target building
                    if troop.target_building_id > 0 {
                        let mut target: BattleBuilding = world.read_model((battle_id, troop.target_building_id));

                        if !target.is_destroyed {
                            // Deal damage
                            if target.current_health <= config.damage {
                                target.current_health = 0;
                                target.is_destroyed = true;

                                // Loot the building
                                battle.gold_stolen += target.gold_loot;
                                battle.elixir_stolen += target.elixir_loot;

                                // Calculate destruction percentage
                                let destroyed_count = self.count_destroyed_buildings(@world, battle_id, battle.building_count);
                                battle.destruction_percent = ((destroyed_count * 100) / battle.building_count).try_into().unwrap();

                                // Clear troop's target so it finds a new one
                                troop.target_building_id = 0;
                                world.write_model(@troop);
                            } else {
                                target.current_health -= config.damage;
                            }

                            world.write_model(@target);
                        } else {
                            // Target destroyed, find new target
                            troop.target_building_id = 0;
                            world.write_model(@troop);
                        }
                    }
                }

                troop_idx += 1;
            };

            // Process defense attacks on troops
            let mut building_idx: u32 = 1;
            loop {
                if building_idx > battle.building_count {
                    break;
                }

                let defense: BattleBuilding = world.read_model((battle_id, building_idx));

                if !defense.is_destroyed {
                    // Check if it's a defense building
                    let is_defense = defense.building_type == BuildingType::Cannon
                        || defense.building_type == BuildingType::ArcherTower;

                    if is_defense {
                        // Find and attack nearest troop
                        let (nearest_troop_id, _) = self.find_nearest_troop(
                            @world, battle_id, battle.deployed_troop_count, defense.x.into(), defense.y.into()
                        );

                        if nearest_troop_id > 0 {
                            let mut target_troop: DeployedTroop = world.read_model((battle_id, nearest_troop_id));

                            if target_troop.is_alive {
                                // Deal damage (simplified: 10 damage per tick)
                                let defense_damage: u32 = 10;
                                if target_troop.health <= defense_damage {
                                    target_troop.health = 0;
                                    target_troop.is_alive = false;
                                } else {
                                    target_troop.health -= defense_damage;
                                }
                                world.write_model(@target_troop);
                            }
                        }
                    }
                }

                building_idx += 1;
            };

            // Update battle
            world.write_model(@battle);

            // Check if battle should end
            if current_time >= battle.ends_at || battle.destruction_percent == 100 {
                self._end_battle(ref world, battle_id);
            }

            // Check if all troops are dead
            let alive_troops = self.count_alive_troops(@world, battle_id, battle.deployed_troop_count);
            if alive_troops == 0 && battle.deployed_troop_count > 0 {
                self._end_battle(ref world, battle_id);
            }
        }

        fn end_battle(ref self: ContractState, battle_id: u32) {
            let mut world = self.world_default();
            let current_time = get_block_timestamp();

            let battle: Battle = world.read_model(battle_id);
            assert(battle.status == BattleStatus::InProgress || battle.status == BattleStatus::Preparing, 'Battle already ended');

            // Allow ending if time is up or caller is attacker
            let caller = get_caller_address();
            assert(current_time >= battle.ends_at || caller == battle.attacker, 'Cannot end yet');

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
            attacker_player.gold += battle.gold_stolen;
            attacker_player.elixir += battle.elixir_stolen;

            if defender_player.gold >= battle.gold_stolen {
                defender_player.gold -= battle.gold_stolen;
            } else {
                defender_player.gold = 0;
            }

            if defender_player.elixir >= battle.elixir_stolen {
                defender_player.elixir -= battle.elixir_stolen;
            } else {
                defender_player.elixir = 0;
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
                gold_stolen: battle.gold_stolen,
                elixir_stolen: battle.elixir_stolen,
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
                    // Calculate squared distance (no sqrt needed for comparison)
                    let dx: u32 = if troop_x > building.x.into() * 10 {
                        (troop_x - building.x.into() * 10).into()
                    } else {
                        (building.x.into() * 10 - troop_x).into()
                    };
                    let dy: u32 = if troop_y > building.y.into() * 10 {
                        (troop_y - building.y.into() * 10).into()
                    } else {
                        (building.y.into() * 10 - troop_y).into()
                    };
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
                    let dx: u32 = if troop.x > building_x * 10 {
                        (troop.x - building_x * 10).into()
                    } else {
                        (building_x * 10 - troop.x).into()
                    };
                    let dy: u32 = if troop.y > building_y * 10 {
                        (troop.y - building_y * 10).into()
                    } else {
                        (building_y * 10 - troop.y).into()
                    };
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
