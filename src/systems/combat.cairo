use starknet::ContractAddress;
use clash_prototype::models::troop::TroopType;
use clash_prototype::models::battle::SpellType;

#[starknet::interface]
pub trait ICombat<T> {
    fn start_attack(ref self: T, defender: ContractAddress);
    fn deploy_troop(ref self: T, battle_id: u32, troop_type: TroopType, x: u16, y: u16);
    fn deploy_spell(ref self: T, battle_id: u32, spell_type: SpellType, x: u16, y: u16);
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
pub struct SpellDeployed {
    #[key]
    pub battle_id: u32,
    pub spell_id: u32,
    pub spell_type: SpellType,
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
    use super::{ICombat, BattleStarted, TroopDeployed, SpellDeployed, BattleEnded};
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;

    use clash_prototype::models::player::Player;
    use clash_prototype::models::building::{Building, BuildingType};
    use clash_prototype::models::army::Army;
    use clash_prototype::models::troop::{TroopType, get_troop_config, targets_defenses};
    use clash_prototype::models::battle::{
        Battle, BattleStatus, DeployedTroop, BattleBuilding, BattleCounter, SpellType, DeployedSpell
    };
    use clash_prototype::utils::config::{
        BATTLE_DURATION, TROPHY_WIN_BASE, TROPHY_LOSS_BASE, LOOT_PERCENTAGE, LOOT_PROTECTION,
        TICKS_PER_BATTLE, SHIELD_DURATION, get_defense_stats, get_building_health,
        SPELL_UNLOCK_TH_LEVEL, MAX_SPELLS_PER_BATTLE, SPELL_RADIUS,
        LIGHTNING_COST_DIAMOND, LIGHTNING_DAMAGE, HEAL_COST_DIAMOND, HEAL_AMOUNT, RAGE_COST_DIAMOND,
        ATTACK_COOLDOWN
    };

    #[abi(embed_v0)]
    impl CombatImpl of ICombat<ContractState> {
        fn start_attack(ref self: ContractState, defender: ContractAddress) {
            let mut world = self.world_default();
            let attacker = get_caller_address();
            let current_time = get_block_timestamp();

            // Validation
            assert(attacker != defender, 'Cannot attack yourself');

            let mut attacker_player: Player = world.read_model(attacker);
            let defender_player: Player = world.read_model(defender);

            assert(attacker_player.town_hall_level > 0, 'Attacker not spawned');
            assert(defender_player.town_hall_level > 0, 'Defender not found');

            // Check attack cooldown
            assert(current_time >= attacker_player.last_attack_at + ATTACK_COOLDOWN, 'Attack on cooldown');

            // Check defender is not shielded
            assert(defender_player.shield_until < current_time, 'Defender is shielded');

            // Check attacker has troops
            let attacker_army: Army = world.read_model(attacker);
            assert(attacker_army.total_space_used > 0, 'No troops to attack');

            // Set last attack timestamp
            attacker_player.last_attack_at = current_time;
            world.write_model(@attacker_player);

            // Get and increment battle counter
            let mut counter: BattleCounter = world.read_model(0_u8);
            let battle_id = counter.next_battle_id;
            counter.next_battle_id += 1;
            world.write_model(@counter);

            // Calculate loot available (only resources above protection threshold can be looted)
            let lootable_diamond = if defender_player.diamond > LOOT_PROTECTION {
                defender_player.diamond - LOOT_PROTECTION
            } else {
                0
            };
            let lootable_gas = if defender_player.gas > LOOT_PROTECTION {
                defender_player.gas - LOOT_PROTECTION
            } else {
                0
            };
            let diamond_loot = lootable_diamond * LOOT_PERCENTAGE / 100;
            let gas_loot = lootable_gas * LOOT_PERCENTAGE / 100;

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
                deployed_spell_count: 0,
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
                TroopType::Giant => {
                    assert(army.giants > 0, 'No giants');
                    army.giants -= 1;
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
                damage_multiplier: 1,
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

        fn deploy_spell(ref self: ContractState, battle_id: u32, spell_type: SpellType, x: u16, y: u16) {
            let mut world = self.world_default();
            let player = get_caller_address();
            let current_time = get_block_timestamp();

            // Get battle
            let mut battle: Battle = world.read_model(battle_id);
            assert(battle.attacker == player, 'Not the attacker');
            assert(battle.status == BattleStatus::Preparing || battle.status == BattleStatus::InProgress, 'Battle not active');
            assert(current_time <= battle.ends_at, 'Battle expired');
            assert(battle.deployed_spell_count < MAX_SPELLS_PER_BATTLE, 'Max spells reached');

            // Check bounds
            assert(x < 400 && y < 400, 'Out of bounds');

            // Check TH level requirement and deduct cost
            let mut attacker: Player = world.read_model(player);
            assert(attacker.town_hall_level >= SPELL_UNLOCK_TH_LEVEL, 'TH level too low for spells');
            let cost = match spell_type {
                SpellType::Lightning => LIGHTNING_COST_DIAMOND,
                SpellType::Heal => HEAL_COST_DIAMOND,
                SpellType::Rage => RAGE_COST_DIAMOND,
            };
            assert(attacker.diamond >= cost, 'Not enough diamond');
            attacker.diamond -= cost;
            world.write_model(@attacker);

            // Create deployed spell
            let spell_id = battle.deployed_spell_count + 1;
            let spell = DeployedSpell {
                battle_id,
                spell_id,
                spell_type,
                x,
                y,
            };
            world.write_model(@spell);

            // Update battle
            battle.deployed_spell_count += 1;
            if battle.status == BattleStatus::Preparing {
                battle.status = BattleStatus::InProgress;
            }
            world.write_model(@battle);

            // Emit event
            world.emit_event(@SpellDeployed {
                battle_id,
                spell_id,
                spell_type,
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

            // === Apply spells before simulation ===
            let mut spell_idx: u32 = 1;
            loop {
                if spell_idx > battle.deployed_spell_count {
                    break;
                }
                let spell: DeployedSpell = world.read_model((battle_id, spell_idx));
                let radius_sq: u32 = SPELL_RADIUS * SPELL_RADIUS;

                match spell.spell_type {
                    SpellType::Lightning => {
                        // Deal damage to all buildings in radius
                        let mut bi: u32 = 1;
                        loop {
                            if bi > battle.building_count {
                                break;
                            }
                            let mut building: BattleBuilding = world.read_model((battle_id, bi));
                            if !building.is_destroyed {
                                let bx: u32 = building.x.into() * 10;
                                let by: u32 = building.y.into() * 10;
                                let sx: u32 = spell.x.into();
                                let sy: u32 = spell.y.into();
                                let dx: u32 = if sx > bx { sx - bx } else { bx - sx };
                                let dy: u32 = if sy > by { sy - by } else { by - sy };
                                let dist_sq = dx * dx + dy * dy;
                                if dist_sq <= radius_sq {
                                    if building.current_health <= LIGHTNING_DAMAGE {
                                        building.current_health = 0;
                                        building.is_destroyed = true;
                                        battle.diamond_stolen += building.diamond_loot;
                                        battle.gas_stolen += building.gas_loot;
                                        let destroyed_count = self.count_destroyed_buildings(@world, battle_id, battle.building_count);
                                        battle.destruction_percent = ((destroyed_count * 100) / battle.building_count).try_into().unwrap();
                                    } else {
                                        building.current_health -= LIGHTNING_DAMAGE;
                                    }
                                    world.write_model(@building);
                                }
                            }
                            bi += 1;
                        };
                    },
                    SpellType::Heal => {
                        // Heal all troops in radius
                        let mut ti: u32 = 1;
                        loop {
                            if ti > battle.deployed_troop_count {
                                break;
                            }
                            let mut troop: DeployedTroop = world.read_model((battle_id, ti));
                            if troop.is_alive {
                                let tx: u32 = troop.x.into();
                                let ty: u32 = troop.y.into();
                                let sx: u32 = spell.x.into();
                                let sy: u32 = spell.y.into();
                                let dx: u32 = if sx > tx { sx - tx } else { tx - sx };
                                let dy: u32 = if sy > ty { sy - ty } else { ty - sy };
                                let dist_sq = dx * dx + dy * dy;
                                if dist_sq <= radius_sq {
                                    let config = get_troop_config(troop.troop_type);
                                    let new_health = troop.health + HEAL_AMOUNT;
                                    troop.health = if new_health > config.health { config.health } else { new_health };
                                    world.write_model(@troop);
                                }
                            }
                            ti += 1;
                        };
                    },
                    SpellType::Rage => {
                        // Double damage for all troops in radius
                        let mut ti: u32 = 1;
                        loop {
                            if ti > battle.deployed_troop_count {
                                break;
                            }
                            let mut troop: DeployedTroop = world.read_model((battle_id, ti));
                            if troop.is_alive {
                                let tx: u32 = troop.x.into();
                                let ty: u32 = troop.y.into();
                                let sx: u32 = spell.x.into();
                                let sy: u32 = spell.y.into();
                                let dx: u32 = if sx > tx { sx - tx } else { tx - sx };
                                let dy: u32 = if sy > ty { sy - ty } else { ty - sy };
                                let dist_sq = dx * dx + dy * dy;
                                if dist_sq <= radius_sq {
                                    troop.damage_multiplier = 2;
                                    world.write_model(@troop);
                                }
                            }
                            ti += 1;
                        };
                    },
                }
                spell_idx += 1;
            };

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
                            // Giants target defenses first, then fallback to any building
                            if targets_defenses(troop.troop_type) {
                                let defense = self.find_nearest_defense(@world, battle_id, battle.building_count, troop.x, troop.y);
                                if defense > 0 {
                                    troop.target_building_id = defense;
                                } else {
                                    troop.target_building_id = self.find_nearest_building(@world, battle_id, battle.building_count, troop.x, troop.y);
                                }
                            } else {
                                troop.target_building_id = self.find_nearest_building(@world, battle_id, battle.building_count, troop.x, troop.y);
                            }

                            // Melee troops must break through walls blocking their path
                            if troop.target_building_id > 0 && config.attack_range == 1 {
                                let path_target: BattleBuilding = world.read_model((battle_id, troop.target_building_id));
                                let blocking_wall = self.find_blocking_wall(
                                    @world, battle_id, battle.building_count,
                                    troop.x, troop.y,
                                    path_target.x, path_target.y,
                                );
                                if blocking_wall > 0 {
                                    troop.target_building_id = blocking_wall;
                                }
                            }
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
                                    // In range — attack (apply damage multiplier from rage spell)
                                    let effective_damage = config.damage * troop.damage_multiplier.into();
                                    if target.current_health <= effective_damage {
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
                                        target.current_health -= effective_damage;
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

            // Apply battle damage to defender's real buildings
            let mut b_idx: u32 = 1;
            loop {
                if b_idx > battle.building_count {
                    break;
                }
                let battle_building: BattleBuilding = world.read_model((battle_id, b_idx));
                // Find the real building using the battle_building's building_id
                let mut real_building: Building = world.read_model((battle.defender, battle_building.building_id));
                if real_building.level > 0 {
                    let max_health = get_building_health(real_building.building_type, real_building.level);
                    if battle_building.is_destroyed {
                        // Destroyed buildings go to 1 HP (not 0, so they still exist but need repair)
                        real_building.health = 1;
                    } else if battle_building.current_health < battle_building.max_health {
                        // Apply proportional damage
                        let damage_ratio_num = battle_building.max_health - battle_building.current_health;
                        let new_health = max_health - (max_health * damage_ratio_num / battle_building.max_health);
                        real_building.health = if new_health < 1 { 1 } else { new_health };
                    }
                    world.write_model(@real_building);
                }
                b_idx += 1;
            };

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

                // Skip walls — troops don't directly target walls; melee troops
                // break through blocking walls via find_blocking_wall instead
                if !building.is_destroyed && building.building_type != BuildingType::Wall {
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

        fn find_nearest_defense(
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
                    let is_defense = building.building_type == BuildingType::Cannon
                        || building.building_type == BuildingType::ArcherTower;

                    if is_defense {
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
                }

                i += 1;
            };

            nearest_id
        }

        fn find_blocking_wall(
            self: @ContractState,
            world: @dojo::world::WorldStorage,
            battle_id: u32,
            building_count: u32,
            troop_x: u16,
            troop_y: u16,
            target_grid_x: u8,
            target_grid_y: u8,
        ) -> u32 {
            let mut nearest_wall_id: u32 = 0;
            let mut nearest_dist_sq: u64 = 0xFFFFFFFFFFFFFFFF;

            let tx: i64 = troop_x.into();
            let ty: i64 = troop_y.into();
            let tgt_x: i64 = target_grid_x.into() * 10;
            let tgt_y: i64 = target_grid_y.into() * 10;

            // Direction vector from troop to target
            let dir_x: i64 = tgt_x - tx;
            let dir_y: i64 = tgt_y - ty;
            let dist_sq: i64 = dir_x * dir_x + dir_y * dir_y;

            if dist_sq == 0 {
                return 0;
            }

            // Corridor width: walls within 15px (1.5 tiles) perpendicular distance block
            let corridor: i64 = 15;

            let mut i: u32 = 1;
            loop {
                if i > building_count {
                    break;
                }

                let building: BattleBuilding = world.read_model((battle_id, i));

                if !building.is_destroyed && building.building_type == BuildingType::Wall {
                    let wx: i64 = building.x.into() * 10;
                    let wy: i64 = building.y.into() * 10;

                    // Vector from troop to wall
                    let tw_x: i64 = wx - tx;
                    let tw_y: i64 = wy - ty;

                    // Dot product: positive means wall is ahead (toward target)
                    let dot: i64 = tw_x * dir_x + tw_y * dir_y;

                    if dot > 0 {
                        // Wall must be closer to troop than target
                        let wall_dist: i64 = tw_x * tw_x + tw_y * tw_y;

                        if wall_dist < dist_sq {
                            // Cross product for perpendicular distance check
                            // |cross| / sqrt(dist_sq) < corridor
                            // => cross^2 < corridor^2 * dist_sq
                            let cross: i64 = tw_x * dir_y - tw_y * dir_x;

                            if cross * cross < corridor * corridor * dist_sq {
                                let wd: u64 = wall_dist.try_into().unwrap();
                                if wd < nearest_dist_sq {
                                    nearest_dist_sq = wd;
                                    nearest_wall_id = i;
                                }
                            }
                        }
                    }
                }

                i += 1;
            };

            nearest_wall_id
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
