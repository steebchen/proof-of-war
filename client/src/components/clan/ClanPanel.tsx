import { useState, useEffect, useCallback } from 'react'
import { useAccount } from '@starknet-react/core'
import { ToriiQueryBuilder, KeysClause, MemberClause } from '@dojoengine/sdk'
import { addAddressPadding } from 'starknet'
import { useDojo, Player } from '../../providers/DojoProvider'
import { dojoConfig, NO_FEE_DETAILS } from '../../config/dojoConfig'
import { ClashSchemaType, MODELS } from '../../types/schema'
import { useToast } from '../ui/Toast'

interface ClanPanelProps {
  onClose: () => void
}

interface ClanInfo {
  clanId: number
  name: string
  leader: string
  memberCount: number
  maxMembers: number
  totalTrophies: number
  requiredTrophies: number
  isOpen: boolean
}

interface ClanMemberInfo {
  clanId: number
  member: string
  role: string
  joinedAt: bigint
}

// Helper to convert felt252 hex to string
function hexToString(hex: string): string {
  if (!hex || hex === '0x0') return ''
  const hexStr = hex.startsWith('0x') ? hex.slice(2) : hex
  let result = ''
  for (let i = 0; i < hexStr.length; i += 2) {
    const charCode = parseInt(hexStr.slice(i, i + 2), 16)
    if (charCode > 0) {
      result += String.fromCharCode(charCode)
    }
  }
  return result
}

// Helper to convert string to felt252 hex
function stringToFelt252(str: string): string {
  const trimmed = str.slice(0, 31)
  let hex = '0x'
  for (let i = 0; i < trimmed.length; i++) {
    hex += trimmed.charCodeAt(i).toString(16).padStart(2, '0')
  }
  return hex
}

function parseRole(roleData: unknown): string {
  if (typeof roleData === 'string') return roleData
  if (typeof roleData === 'object' && roleData !== null) {
    const obj = roleData as Record<string, unknown>
    if ('variant' in obj) return String(obj.variant)
    const keys = Object.keys(obj)
    if (keys.length === 1) return keys[0]
  }
  return 'Member'
}

function transformClan(data: ClashSchemaType['clash']['Clan']): ClanInfo {
  return {
    clanId: parseInt(data.clan_id ?? '0', 10),
    name: hexToString(data.name),
    leader: data.leader ?? '',
    memberCount: parseInt(data.member_count ?? '0', 10),
    maxMembers: parseInt(data.max_members ?? '50', 10),
    totalTrophies: parseInt(data.total_trophies ?? '0', 10),
    requiredTrophies: parseInt(data.required_trophies ?? '0', 10),
    isOpen: data.is_open ?? true,
  }
}

function transformClanMember(data: ClashSchemaType['clash']['ClanMember']): ClanMemberInfo {
  return {
    clanId: parseInt(data.clan_id ?? '0', 10),
    member: data.member ?? '',
    role: parseRole(data.role),
    joinedAt: BigInt(data.joined_at ?? '0'),
  }
}

const ROLE_ORDER: Record<string, number> = { Leader: 0, CoLeader: 1, Elder: 2, Member: 3 }
const ROLE_COLORS: Record<string, string> = {
  Leader: '#FFD700',
  CoLeader: '#C0C0C0',
  Elder: '#CD7F32',
  Member: '#888',
}

export function ClanPanel({ onClose }: ClanPanelProps) {
  const { account, address } = useAccount()
  const { sdk, player, setPlayer, fetchAllPlayers, refreshData } = useDojo()
  const { addToast } = useToast()

  const [view, setView] = useState<'main' | 'create' | 'browse'>('main')
  const [loading, setLoading] = useState(false)

  // Create clan form
  const [clanName, setClanName] = useState('')
  const [requiredTrophies, setRequiredTrophies] = useState(0)

  // Clan data
  const [clan, setClan] = useState<ClanInfo | null>(null)
  const [members, setMembers] = useState<ClanMemberInfo[]>([])
  const [myRole, setMyRole] = useState<string>('Member')
  const [allClans, setAllClans] = useState<ClanInfo[]>([])
  const [allPlayers, setAllPlayers] = useState<Player[]>([])

  // Fetch clan data on mount when in a clan
  useEffect(() => {
    if (sdk && player && player.clanId > 0) {
      fetchClanData(player.clanId)
    }
  }, [sdk, player?.clanId])

  const fetchClanData = useCallback(async (clanId: number) => {
    if (!sdk) return
    setLoading(true)
    try {
      // Fetch clan info
      const clanQuery = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          KeysClause([MODELS.Clan], [clanId.toString()], 'FixedLen').build()
        )
      const clanResponse = await sdk.getEntities({ query: clanQuery })
      for (const entity of clanResponse.getItems()) {
        const data = entity.models?.clash?.Clan
        if (data) {
          setClan(transformClan(data as ClashSchemaType['clash']['Clan']))
          break
        }
      }

      // Fetch members using MemberClause on clan_id
      const memberQuery = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          MemberClause(MODELS.ClanMember, 'clan_id', 'Eq', clanId.toString()).build()
        )
        .withLimit(50)
      const memberResponse = await sdk.getEntities({ query: memberQuery })
      const fetchedMembers: ClanMemberInfo[] = []
      for (const entity of memberResponse.getItems()) {
        const data = entity.models?.clash?.ClanMember
        if (data) {
          const m = transformClanMember(data as ClashSchemaType['clash']['ClanMember'])
          if (m.role !== 'None' && m.member !== '0x0') {
            fetchedMembers.push(m)
          }
        }
      }
      fetchedMembers.sort((a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3))
      setMembers(fetchedMembers)

      // Find my role
      if (address) {
        const paddedAddr = addAddressPadding(address).toLowerCase()
        const me = fetchedMembers.find(m => addAddressPadding(m.member).toLowerCase() === paddedAddr)
        setMyRole(me?.role ?? 'Member')
      }

      // Fetch player names for member list
      const players = await fetchAllPlayers()
      setAllPlayers(players)
    } catch (err) {
      console.error('Failed to fetch clan data:', err)
    } finally {
      setLoading(false)
    }
  }, [sdk, address, fetchAllPlayers])

  const fetchBrowseClans = useCallback(async () => {
    if (!sdk) return
    setLoading(true)
    try {
      const query = new ToriiQueryBuilder<ClashSchemaType>()
        .withClause(
          KeysClause([MODELS.Clan], [], 'VariableLen').build()
        )
        .withLimit(50)
      const response = await sdk.getEntities({ query })
      const clans: ClanInfo[] = []
      for (const entity of response.getItems()) {
        const data = entity.models?.clash?.Clan
        if (data) {
          const c = transformClan(data as ClashSchemaType['clash']['Clan'])
          if (c.clanId > 0 && c.memberCount > 0) {
            clans.push(c)
          }
        }
      }
      clans.sort((a, b) => b.totalTrophies - a.totalTrophies)
      setAllClans(clans)
    } catch (err) {
      console.error('Failed to fetch clans:', err)
    } finally {
      setLoading(false)
    }
  }, [sdk])

  const handleCreateClan = async () => {
    if (!account || !player) return
    const name = clanName.trim()
    if (!name) {
      addToast('Enter a clan name', 'error')
      return
    }

    setLoading(true)
    try {
      await account.execute([{
        contractAddress: dojoConfig.clanSystemAddress,
        entrypoint: 'create_clan',
        calldata: [stringToFelt252(name), requiredTrophies],
      }], NO_FEE_DETAILS)

      addToast(`Clan "${name}" created!`)
      setClanName('')
      setRequiredTrophies(0)
      setView('main')

      // Poll for updated player data
      setTimeout(() => refreshData(), 1500)
    } catch (err) {
      console.error('Failed to create clan:', err)
      addToast('Failed to create clan', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinClan = async (clanId: number) => {
    if (!account || !player) return
    setLoading(true)
    try {
      await account.execute([{
        contractAddress: dojoConfig.clanSystemAddress,
        entrypoint: 'join_clan',
        calldata: [clanId],
      }], NO_FEE_DETAILS)

      addToast('Joined clan!')
      setView('main')
      setTimeout(() => refreshData(), 1500)
    } catch (err) {
      console.error('Failed to join clan:', err)
      addToast('Failed to join clan', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleLeaveClan = async () => {
    if (!account || !player) return
    setLoading(true)
    try {
      await account.execute([{
        contractAddress: dojoConfig.clanSystemAddress,
        entrypoint: 'leave_clan',
        calldata: [],
      }], NO_FEE_DETAILS)

      addToast('Left clan')
      setClan(null)
      setMembers([])
      setPlayer({ ...player, clanId: 0 })
      setTimeout(() => refreshData(), 1500)
    } catch (err) {
      console.error('Failed to leave clan:', err)
      addToast('Failed to leave clan', 'error')
    } finally {
      setLoading(false)
    }
  }

  const handlePromoteMember = async (memberAddress: string) => {
    if (!account || !player || !clan) return
    try {
      await account.execute([{
        contractAddress: dojoConfig.clanSystemAddress,
        entrypoint: 'promote_member',
        calldata: [clan.clanId, memberAddress],
      }], NO_FEE_DETAILS)
      addToast('Member promoted!')
      setTimeout(() => fetchClanData(clan.clanId), 1500)
    } catch (err) {
      console.error('Failed to promote:', err)
      addToast('Failed to promote member', 'error')
    }
  }

  const handleDemoteMember = async (memberAddress: string) => {
    if (!account || !player || !clan) return
    try {
      await account.execute([{
        contractAddress: dojoConfig.clanSystemAddress,
        entrypoint: 'demote_member',
        calldata: [clan.clanId, memberAddress],
      }], NO_FEE_DETAILS)
      addToast('Member demoted')
      setTimeout(() => fetchClanData(clan.clanId), 1500)
    } catch (err) {
      console.error('Failed to demote:', err)
      addToast('Failed to demote member', 'error')
    }
  }

  const handleKickMember = async (memberAddress: string) => {
    if (!account || !player || !clan) return
    try {
      await account.execute([{
        contractAddress: dojoConfig.clanSystemAddress,
        entrypoint: 'kick_member',
        calldata: [clan.clanId, memberAddress],
      }], NO_FEE_DETAILS)
      addToast('Member kicked')
      setTimeout(() => fetchClanData(clan.clanId), 1500)
    } catch (err) {
      console.error('Failed to kick:', err)
      addToast('Failed to kick member', 'error')
    }
  }

  const handleTransferLeadership = async (memberAddress: string) => {
    if (!account || !player || !clan) return
    try {
      await account.execute([{
        contractAddress: dojoConfig.clanSystemAddress,
        entrypoint: 'transfer_leadership',
        calldata: [clan.clanId, memberAddress],
      }], NO_FEE_DETAILS)
      addToast('Leadership transferred!')
      setTimeout(() => fetchClanData(clan.clanId), 1500)
    } catch (err) {
      console.error('Failed to transfer leadership:', err)
      addToast('Failed to transfer leadership', 'error')
    }
  }

  const getMemberName = (addr: string): string => {
    const padded = addAddressPadding(addr).toLowerCase()
    const p = allPlayers.find(pl => addAddressPadding(pl.address).toLowerCase() === padded)
    return p?.username || `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }

  const isMe = (addr: string): boolean => {
    if (!address) return false
    return addAddressPadding(addr).toLowerCase() === addAddressPadding(address).toLowerCase()
  }

  const inClan = player && player.clanId > 0

  // Render create clan form
  const renderCreateForm = () => (
    <div>
      <div style={styles.subHeader}>
        <button style={styles.backBtn} onClick={() => setView('main')}>Back</button>
        <h3 style={{ margin: 0 }}>Create Clan</h3>
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Clan Name</label>
        <input
          type="text"
          placeholder="Enter clan name..."
          value={clanName}
          onChange={(e) => setClanName(e.target.value)}
          maxLength={31}
          style={styles.input}
        />
      </div>
      <div style={styles.formGroup}>
        <label style={styles.label}>Required Trophies to Join</label>
        <input
          type="number"
          min={0}
          value={requiredTrophies}
          onChange={(e) => setRequiredTrophies(Math.max(0, parseInt(e.target.value) || 0))}
          style={styles.input}
        />
      </div>
      <button
        style={{ ...styles.primaryBtn, opacity: loading || !clanName.trim() ? 0.5 : 1 }}
        onClick={handleCreateClan}
        disabled={loading || !clanName.trim()}
      >
        {loading ? 'Creating...' : 'Create Clan'}
      </button>
    </div>
  )

  // Render browse clans
  const renderBrowseClans = () => (
    <div>
      <div style={styles.subHeader}>
        <button style={styles.backBtn} onClick={() => setView('main')}>Back</button>
        <h3 style={{ margin: 0 }}>Browse Clans</h3>
      </div>
      {loading ? (
        <div style={styles.centered}>Loading clans...</div>
      ) : allClans.length === 0 ? (
        <div style={styles.centered}>No clans found. Be the first to create one!</div>
      ) : (
        <div style={styles.clanList}>
          {allClans.map(c => {
            const canJoin = (player?.trophies ?? 0) >= c.requiredTrophies && c.memberCount < c.maxMembers && c.isOpen
            return (
              <div key={c.clanId} style={styles.clanRow}>
                <div style={styles.clanRowInfo}>
                  <span style={styles.clanRowName}>{c.name}</span>
                  <span style={styles.clanRowDetails}>
                    {c.memberCount}/{c.maxMembers} members | {c.totalTrophies} trophies
                    {c.requiredTrophies > 0 && ` | ${c.requiredTrophies} req`}
                  </span>
                </div>
                <button
                  style={{ ...styles.joinBtn, opacity: canJoin ? 1 : 0.4 }}
                  onClick={() => canJoin && handleJoinClan(c.clanId)}
                  disabled={!canJoin}
                >
                  Join
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  // Render clan info (when in a clan)
  const renderClanInfo = () => (
    <div>
      {loading && !clan ? (
        <div style={styles.centered}>Loading clan data...</div>
      ) : clan ? (
        <>
          <div style={styles.clanHeader}>
            <h3 style={{ margin: 0, color: '#1abc9c' }}>{clan.name}</h3>
            <div style={styles.clanStats}>
              <span>{clan.memberCount}/{clan.maxMembers} members</span>
              <span style={{ color: '#FFD700' }}>{clan.totalTrophies} trophies</span>
              {clan.requiredTrophies > 0 && (
                <span style={{ color: '#aaa' }}>Req: {clan.requiredTrophies}</span>
              )}
            </div>
          </div>

          <div style={styles.memberSection}>
            <h4 style={{ margin: '0 0 8px 0', color: '#aaa', fontSize: '12px', textTransform: 'uppercase' }}>
              Members
            </h4>
            {members.map(m => {
              const isSelf = isMe(m.member)
              const canManage = !isSelf && (myRole === 'Leader' || (myRole === 'CoLeader' && m.role !== 'Leader' && m.role !== 'CoLeader'))
              const canPromote = canManage && m.role !== 'CoLeader'
              const canDemote = myRole === 'Leader' && !isSelf && (m.role === 'CoLeader' || m.role === 'Elder')
              const canKick = canManage
              const canTransfer = myRole === 'Leader' && !isSelf

              return (
                <div key={m.member} style={{
                  ...styles.memberRow,
                  backgroundColor: isSelf ? 'rgba(26, 188, 156, 0.1)' : 'rgba(255,255,255,0.03)',
                  border: isSelf ? '1px solid rgba(26, 188, 156, 0.3)' : '1px solid transparent',
                }}>
                  <div style={styles.memberInfo}>
                    <div style={styles.memberNameRow}>
                      <span style={{ fontWeight: 'bold' }}>{getMemberName(m.member)}</span>
                      {isSelf && <span style={styles.youBadge}>YOU</span>}
                    </div>
                    <span style={{
                      fontSize: '11px',
                      color: ROLE_COLORS[m.role] ?? '#888',
                      fontWeight: 'bold',
                    }}>
                      {m.role}
                    </span>
                  </div>
                  {(canPromote || canDemote || canKick || canTransfer) && (
                    <div style={styles.memberActions}>
                      {canPromote && (
                        <button style={styles.smallBtn} onClick={() => handlePromoteMember(m.member)}>
                          Promote
                        </button>
                      )}
                      {canDemote && (
                        <button style={{ ...styles.smallBtn, backgroundColor: '#e67e22' }} onClick={() => handleDemoteMember(m.member)}>
                          Demote
                        </button>
                      )}
                      {canKick && (
                        <button style={{ ...styles.smallBtn, backgroundColor: '#e74c3c' }} onClick={() => handleKickMember(m.member)}>
                          Kick
                        </button>
                      )}
                      {canTransfer && (
                        <button style={{ ...styles.smallBtn, backgroundColor: '#9b59b6' }} onClick={() => handleTransferLeadership(m.member)}>
                          Transfer
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {myRole !== 'Leader' && (
            <button style={styles.leaveBtn} onClick={handleLeaveClan}>
              Leave Clan
            </button>
          )}
        </>
      ) : (
        <div style={styles.centered}>Clan not found</div>
      )}
    </div>
  )

  // Render no-clan main view
  const renderNoClan = () => (
    <div style={styles.noClan}>
      <p style={{ color: '#aaa', marginBottom: '20px' }}>You are not in a clan yet.</p>
      <div style={styles.noClanButtons}>
        <button style={styles.primaryBtn} onClick={() => setView('create')}>
          Create Clan
        </button>
        <button style={{ ...styles.primaryBtn, backgroundColor: '#3498db' }} onClick={() => { setView('browse'); fetchBrowseClans() }}>
          Browse Clans
        </button>
      </div>
    </div>
  )

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={{ margin: 0, color: '#1abc9c' }}>Clan</h2>
          <button style={styles.closeBtn} onClick={onClose}>X</button>
        </div>

        {view === 'create' ? renderCreateForm()
          : view === 'browse' ? renderBrowseClans()
          : inClan ? renderClanInfo()
          : renderNoClan()}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    backgroundColor: '#1a1a2e',
    borderRadius: '16px',
    border: '2px solid #1abc9c',
    padding: '20px',
    width: '90vw',
    maxWidth: '550px',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px',
  },
  closeBtn: {
    backgroundColor: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: '50%',
    width: '30px',
    height: '30px',
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  subHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  backBtn: {
    padding: '6px 12px',
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  centered: {
    textAlign: 'center',
    padding: '32px',
    color: '#888',
  },
  noClan: {
    textAlign: 'center',
    padding: '20px 0',
  },
  noClanButtons: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    color: '#aaa',
    fontSize: '13px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    borderRadius: '8px',
    border: '2px solid #0f3460',
    backgroundColor: '#16213e',
    color: '#fff',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
  },
  primaryBtn: {
    padding: '12px 28px',
    backgroundColor: '#1abc9c',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '15px',
  },
  clanList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  clanRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: '8px',
  },
  clanRowInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  clanRowName: {
    fontWeight: 'bold',
    color: '#fff',
    fontSize: '15px',
  },
  clanRowDetails: {
    fontSize: '12px',
    color: '#888',
  },
  joinBtn: {
    padding: '8px 20px',
    backgroundColor: '#1abc9c',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '13px',
  },
  clanHeader: {
    padding: '12px',
    backgroundColor: 'rgba(26, 188, 156, 0.1)',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  clanStats: {
    display: 'flex',
    gap: '16px',
    marginTop: '8px',
    fontSize: '13px',
    color: '#aaa',
  },
  memberSection: {
    marginBottom: '16px',
  },
  memberRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderRadius: '6px',
    marginBottom: '4px',
  },
  memberInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  memberNameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  youBadge: {
    padding: '1px 6px',
    backgroundColor: '#1abc9c',
    color: '#000',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 'bold',
  },
  memberActions: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
  },
  smallBtn: {
    padding: '4px 10px',
    backgroundColor: '#27ae60',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 'bold',
  },
  leaveBtn: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#e74c3c',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px',
  },
}
