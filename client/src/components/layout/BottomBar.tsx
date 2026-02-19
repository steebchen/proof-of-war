import { BuildingType, BUILDING_INFO, BUILDING_SPRITES } from '../../config/dojoConfig'
import { useBuildings } from '../../hooks/useBuildings'
import { useResources } from '../../hooks/useResources'
import { useDojo } from '../../providers/DojoProvider'
import { getBuildingLimits } from '../../utils/buildingLimits'

interface BottomBarProps {
  onOpenArmy: () => void
  onOpenAttack: () => void
  onOpenLeaderboard: () => void
  onOpenBattleLog: () => void
}

export function BottomBar({ onOpenArmy, onOpenAttack, onOpenLeaderboard, onOpenBattleLog }: BottomBarProps) {
  const { isPlacing, selectedBuildingType, startPlacing, cancelPlacing } = useBuildings()
  const { diamond, gas, canAfford } = useResources()
  const { player, buildings } = useDojo()

  const townHallLevel = player?.townHallLevel ?? 1
  const limits = getBuildingLimits(buildings, townHallLevel)

  // Buildings available for placement (exclude TownHall)
  const availableBuildings = Object.entries(BUILDING_INFO)
    .filter(([key]) => Number(key) !== BuildingType.TownHall)
    .map(([key, info]) => ({
      type: Number(key) as BuildingType,
      ...info,
    }))

  return (
    <div style={styles.container}>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Buildings</h3>
        <div style={styles.buildingGrid}>
          {availableBuildings.map((building) => {
            const affordable = canAfford(building.cost.diamond, building.cost.gas)
            const limitInfo = limits[building.type]
            const atLimit = !limitInfo.canBuild
            const noWorkers = (player?.freeBuilders ?? 0) <= 0
            const isSelected = isPlacing && selectedBuildingType === building.type
            const isDisabled = !affordable || atLimit || noWorkers

            // Determine disabled reason
            let disabledReason = ''
            if (atLimit) {
              disabledReason = 'Max built'
            } else if (noWorkers) {
              disabledReason = 'No free workers'
            } else if (!affordable) {
              if (building.cost.diamond > 0 && diamond < BigInt(building.cost.diamond)) {
                disabledReason = `Need ${building.cost.diamond - Number(diamond)} diamond`
              } else if (building.cost.gas > 0 && gas < BigInt(building.cost.gas)) {
                disabledReason = `Need ${building.cost.gas - Number(gas)} gas`
              }
            }

            return (
              <div key={building.type} style={styles.buildingWrapper}>
                <button
                  style={{
                    ...styles.buildingBtn,
                    backgroundColor: BUILDING_SPRITES[building.type] ? 'rgba(0,0,0,0.3)' : building.color,
                    opacity: isDisabled ? 0.5 : 1,
                    border: isSelected ? '3px solid #fff' : '3px solid transparent',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                  }}
                  onClick={() => !isDisabled && (isSelected ? cancelPlacing() : startPlacing(building.type))}
                  disabled={isDisabled}
                >
                  {BUILDING_SPRITES[building.type] ? (
                    <img
                      src={BUILDING_SPRITES[building.type]}
                      alt={building.name}
                      style={styles.buildingSprite}
                    />
                  ) : (
                    <span style={styles.buildingName}>{building.name.slice(0, 2)}</span>
                  )}
                </button>
                <div style={styles.buildingLabel}>{building.name}</div>
                {/* Cost display */}
                <div style={styles.costRow}>
                  {building.cost.diamond > 0 && (
                    <span style={styles.diamondCost}>{building.cost.diamond}d</span>
                  )}
                  {building.cost.gas > 0 && (
                    <span style={styles.gasCost}>{building.cost.gas}g</span>
                  )}
                </div>
                {/* Limit badge */}
                <div
                  style={{
                    ...styles.limitBadge,
                    backgroundColor: atLimit ? '#e74c3c' : 'rgba(0, 0, 0, 0.6)',
                    color: atLimit ? '#fff' : '#aaa',
                  }}
                >
                  {limitInfo.current}/{limitInfo.max}
                </div>
                {/* Disabled reason */}
                {isDisabled && disabledReason && (
                  <div style={styles.disabledReason}>{disabledReason}</div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Actions</h3>
        <div style={styles.actionButtons}>
          <button style={styles.actionBtn} onClick={onOpenArmy}>
            Army
          </button>
          <button style={{ ...styles.actionBtn, backgroundColor: '#e74c3c' }} onClick={onOpenAttack}>
            Attack
          </button>
          <button style={{ ...styles.actionBtn, backgroundColor: '#f39c12' }} onClick={onOpenLeaderboard}>
            Ranks
          </button>
          <button style={{ ...styles.actionBtn, backgroundColor: '#9b59b6' }} onClick={onOpenBattleLog}>
            Log
          </button>
        </div>
      </div>

      {isPlacing && (
        <div style={styles.placingIndicator}>
          <span>Placing: {selectedBuildingType !== null && BUILDING_INFO[selectedBuildingType as BuildingType]?.name}</span>
          <button style={styles.cancelBtn} onClick={cancelPlacing}>
            Cancel (ESC)
          </button>
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    backgroundColor: '#16213e',
    borderTop: '2px solid #0f3460',
    position: 'relative',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionTitle: {
    fontSize: '12px',
    color: '#888',
    textTransform: 'uppercase',
    margin: 0,
  },
  buildingGrid: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
  },
  buildingWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
  },
  buildingBtn: {
    width: '48px',
    height: '48px',
    borderRadius: '8px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.1s, opacity 0.1s',
  },
  buildingSprite: {
    width: '40px',
    height: '40px',
    objectFit: 'contain',
    imageRendering: 'pixelated',
  } as React.CSSProperties,
  buildingName: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '12px',
    textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
  },
  buildingLabel: {
    fontSize: '9px',
    color: '#ccc',
    textAlign: 'center',
    marginTop: '2px',
    lineHeight: '1.1',
  },
  costRow: {
    display: 'flex',
    gap: '4px',
    fontSize: '10px',
    fontWeight: 'bold',
  },
  diamondCost: {
    color: '#FFD700',
  },
  gasCost: {
    color: '#DA70D6',
  },
  limitBadge: {
    fontSize: '10px',
    padding: '1px 4px',
    borderRadius: '4px',
    fontWeight: 'bold',
  },
  disabledReason: {
    fontSize: '9px',
    color: '#e74c3c',
    fontWeight: 'bold',
    textAlign: 'center',
    maxWidth: '60px',
    lineHeight: '1.1',
  },
  actionButtons: {
    display: 'flex',
    gap: '8px',
  },
  actionBtn: {
    padding: '12px 24px',
    backgroundColor: '#3498db',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '14px',
  },
  placingIndicator: {
    position: 'absolute',
    top: '-40px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: '#27ae60',
    padding: '8px 16px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    color: '#fff',
    fontWeight: 'bold',
  },
  cancelBtn: {
    padding: '4px 8px',
    backgroundColor: 'rgba(255,255,255,0.2)',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
  },
}
