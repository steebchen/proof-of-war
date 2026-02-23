use starknet::ContractAddress;

#[starknet::interface]
pub trait IClan<T> {
    fn create_clan(ref self: T, name: felt252, required_trophies: u32);
    fn join_clan(ref self: T, clan_id: u32);
    fn leave_clan(ref self: T);
    fn promote_member(ref self: T, clan_id: u32, member: ContractAddress);
    fn demote_member(ref self: T, clan_id: u32, member: ContractAddress);
    fn kick_member(ref self: T, clan_id: u32, member: ContractAddress);
    fn transfer_leadership(ref self: T, clan_id: u32, new_leader: ContractAddress);
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct ClanCreated {
    #[key]
    pub clan_id: u32,
    pub name: felt252,
    pub leader: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct MemberJoined {
    #[key]
    pub clan_id: u32,
    pub member: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct MemberLeft {
    #[key]
    pub clan_id: u32,
    pub member: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct MemberPromoted {
    #[key]
    pub clan_id: u32,
    pub member: ContractAddress,
    pub new_role: clash_prototype::models::clan::ClanRole,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct MemberDemoted {
    #[key]
    pub clan_id: u32,
    pub member: ContractAddress,
    pub new_role: clash_prototype::models::clan::ClanRole,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct MemberKicked {
    #[key]
    pub clan_id: u32,
    pub member: ContractAddress,
    pub kicked_by: ContractAddress,
}

#[derive(Copy, Drop, Serde)]
#[dojo::event]
pub struct LeadershipTransferred {
    #[key]
    pub clan_id: u32,
    pub old_leader: ContractAddress,
    pub new_leader: ContractAddress,
}

#[dojo::contract]
pub mod clan_system {
    use super::{
        IClan, ClanCreated, MemberJoined, MemberLeft, MemberPromoted, MemberDemoted, MemberKicked,
        LeadershipTransferred,
    };
    use starknet::{ContractAddress, get_caller_address, get_block_timestamp};
    use dojo::model::ModelStorage;
    use dojo::event::EventStorage;

    use clash_prototype::models::player::Player;
    use clash_prototype::models::clan::{Clan, ClanMember, ClanCounter, ClanRole};

    const MAX_CLAN_MEMBERS: u16 = 50;

    #[abi(embed_v0)]
    impl ClanImpl of IClan<ContractState> {
        fn create_clan(ref self: ContractState, name: felt252, required_trophies: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let current_time = get_block_timestamp();

            // Validate
            assert(name != 0, 'Clan name cannot be empty');

            let mut player: Player = world.read_model(caller);
            assert(player.town_hall_level > 0, 'Player not spawned');
            assert(player.clan_id == 0, 'Already in a clan');

            // Get and increment clan counter
            let mut counter: ClanCounter = world.read_model(0_u8);
            let clan_id = counter.next_clan_id + 1; // Start from 1 so 0 means no clan
            counter.next_clan_id = clan_id;
            world.write_model(@counter);

            // Create clan
            let clan = Clan {
                clan_id,
                name,
                leader: caller,
                member_count: 1,
                max_members: MAX_CLAN_MEMBERS,
                total_trophies: player.trophies,
                required_trophies,
                is_open: true,
                created_at: current_time,
            };
            world.write_model(@clan);

            // Create clan member entry for leader
            let member = ClanMember {
                clan_id,
                member: caller,
                role: ClanRole::Leader,
                joined_at: current_time,
                donated_troops: 0,
                received_troops: 0,
            };
            world.write_model(@member);

            // Update player's clan_id
            player.clan_id = clan_id;
            world.write_model(@player);

            // Emit event
            world.emit_event(@ClanCreated { clan_id, name, leader: caller });
        }

        fn join_clan(ref self: ContractState, clan_id: u32) {
            let mut world = self.world_default();
            let caller = get_caller_address();
            let current_time = get_block_timestamp();

            let mut player: Player = world.read_model(caller);
            assert(player.town_hall_level > 0, 'Player not spawned');
            assert(player.clan_id == 0, 'Already in a clan');

            let mut clan: Clan = world.read_model(clan_id);
            assert(clan.member_count > 0, 'Clan does not exist');
            assert(clan.is_open, 'Clan is not open');
            assert(clan.member_count < clan.max_members, 'Clan is full');
            assert(player.trophies >= clan.required_trophies, 'Not enough trophies');

            // Create member entry
            let member = ClanMember {
                clan_id,
                member: caller,
                role: ClanRole::Member,
                joined_at: current_time,
                donated_troops: 0,
                received_troops: 0,
            };
            world.write_model(@member);

            // Update clan
            clan.member_count += 1;
            clan.total_trophies += player.trophies;
            world.write_model(@clan);

            // Update player
            player.clan_id = clan_id;
            world.write_model(@player);

            // Emit event
            world.emit_event(@MemberJoined { clan_id, member: caller });
        }

        fn leave_clan(ref self: ContractState) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let mut player: Player = world.read_model(caller);
            assert(player.clan_id > 0, 'Not in a clan');

            let clan_id = player.clan_id;
            let clan_member: ClanMember = world.read_model((clan_id, caller));
            assert(clan_member.role != ClanRole::Leader, 'Leader cannot leave');

            let mut clan: Clan = world.read_model(clan_id);

            // Update clan
            clan.member_count -= 1;
            if clan.total_trophies >= player.trophies {
                clan.total_trophies -= player.trophies;
            } else {
                clan.total_trophies = 0;
            }
            world.write_model(@clan);

            // Clear member entry
            let empty_member = ClanMember {
                clan_id,
                member: caller,
                role: ClanRole::Member,
                joined_at: 0,
                donated_troops: 0,
                received_troops: 0,
            };
            world.write_model(@empty_member);

            // Update player
            player.clan_id = 0;
            world.write_model(@player);

            // Emit event
            world.emit_event(@MemberLeft { clan_id, member: caller });
        }

        fn promote_member(ref self: ContractState, clan_id: u32, member: ContractAddress) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let caller_player: Player = world.read_model(caller);
            assert(caller_player.clan_id == clan_id, 'Not in this clan');

            let caller_member: ClanMember = world.read_model((clan_id, caller));
            assert(
                caller_member.role == ClanRole::Leader || caller_member.role == ClanRole::CoLeader,
                'Not authorized to promote',
            );

            let target_player: Player = world.read_model(member);
            assert(target_player.clan_id == clan_id, 'Member not in clan');

            let mut target_member: ClanMember = world.read_model((clan_id, member));

            // Promote: Member -> Elder -> CoLeader
            assert(
                target_member.role != ClanRole::CoLeader && target_member.role != ClanRole::Leader,
                'Cannot promote further',
            );

            let new_role = if target_member.role == ClanRole::Member {
                ClanRole::Elder
            } else {
                // Elder -> CoLeader: only Leader can do this
                assert(caller_member.role == ClanRole::Leader, 'Only leader promotes CoL');
                ClanRole::CoLeader
            };

            target_member.role = new_role;
            world.write_model(@target_member);

            // Emit event
            world.emit_event(@MemberPromoted { clan_id, member, new_role });
        }

        fn demote_member(ref self: ContractState, clan_id: u32, member: ContractAddress) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let caller_player: Player = world.read_model(caller);
            assert(caller_player.clan_id == clan_id, 'Not in this clan');

            let caller_member: ClanMember = world.read_model((clan_id, caller));
            assert(caller_member.role == ClanRole::Leader, 'Only leader can demote');

            let target_player: Player = world.read_model(member);
            assert(target_player.clan_id == clan_id, 'Member not in clan');

            let mut target_member: ClanMember = world.read_model((clan_id, member));

            // Demote: CoLeader -> Elder -> Member
            assert(
                target_member.role != ClanRole::Member && target_member.role != ClanRole::Leader,
                'Cannot demote further',
            );

            let new_role = if target_member.role == ClanRole::CoLeader {
                ClanRole::Elder
            } else {
                ClanRole::Member
            };

            target_member.role = new_role;
            world.write_model(@target_member);

            // Emit event
            world.emit_event(@MemberDemoted { clan_id, member, new_role });
        }

        fn kick_member(ref self: ContractState, clan_id: u32, member: ContractAddress) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            assert(caller != member, 'Cannot kick yourself');

            let caller_player: Player = world.read_model(caller);
            assert(caller_player.clan_id == clan_id, 'Not in this clan');

            let caller_member: ClanMember = world.read_model((clan_id, caller));
            assert(
                caller_member.role == ClanRole::Leader || caller_member.role == ClanRole::CoLeader,
                'Not authorized to kick',
            );

            let target_player_data: Player = world.read_model(member);
            assert(target_player_data.clan_id == clan_id, 'Member not in clan');

            let target_member: ClanMember = world.read_model((clan_id, member));

            // Cannot kick someone of equal or higher role
            // Leader can kick anyone; CoLeader can kick Elder and Member only
            if caller_member.role == ClanRole::CoLeader {
                assert(
                    target_member.role == ClanRole::Elder || target_member.role == ClanRole::Member,
                    'Cannot kick higher role',
                );
            }
            // Leader cannot be kicked
            assert(target_member.role != ClanRole::Leader, 'Cannot kick leader');

            // Remove member
            let mut target_player: Player = world.read_model(member);
            let mut clan: Clan = world.read_model(clan_id);

            clan.member_count -= 1;
            if clan.total_trophies >= target_player.trophies {
                clan.total_trophies -= target_player.trophies;
            } else {
                clan.total_trophies = 0;
            }
            world.write_model(@clan);

            // Clear member entry
            let empty_member = ClanMember {
                clan_id,
                member,
                role: ClanRole::Member,
                joined_at: 0,
                donated_troops: 0,
                received_troops: 0,
            };
            world.write_model(@empty_member);

            // Update player
            target_player.clan_id = 0;
            world.write_model(@target_player);

            // Emit event
            world.emit_event(@MemberKicked { clan_id, member, kicked_by: caller });
        }

        fn transfer_leadership(ref self: ContractState, clan_id: u32, new_leader: ContractAddress) {
            let mut world = self.world_default();
            let caller = get_caller_address();

            let caller_player: Player = world.read_model(caller);
            assert(caller_player.clan_id == clan_id, 'Not in this clan');

            let mut caller_member: ClanMember = world.read_model((clan_id, caller));
            assert(caller_member.role == ClanRole::Leader, 'Only leader can transfer');

            assert(caller != new_leader, 'Already the leader');

            let target_player: Player = world.read_model(new_leader);
            assert(target_player.clan_id == clan_id, 'Member not in clan');

            let mut target_member: ClanMember = world.read_model((clan_id, new_leader));

            // Transfer leadership
            caller_member.role = ClanRole::CoLeader;
            target_member.role = ClanRole::Leader;
            world.write_model(@caller_member);
            world.write_model(@target_member);

            // Update clan leader
            let mut clan: Clan = world.read_model(clan_id);
            clan.leader = new_leader;
            world.write_model(@clan);

            // Emit event
            world.emit_event(@LeadershipTransferred {
                clan_id,
                old_leader: caller,
                new_leader,
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
