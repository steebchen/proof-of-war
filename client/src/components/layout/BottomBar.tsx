import { BuildingType, BUILDING_INFO } from '../../config/dojoConfig'
import { useBuildings } from '../../hooks/useBuildings'
import { useResources } from '../../hooks/useResources'
import { useDojo } from '../../providers/DojoProvider'
import { getBuildingLimits } from '../../utils/buildingLimits'

interface BottomBarProps {
  onOpenArmy: () => void
  onOpenAttack: () => void
}

export function BottomBar({ onOpenArmy, onOpenAttack }: BottomBarProps) {
  const { isPlacing, selectedBuildingType, startPlacing, cancelPlacing } = useBuildings()
  const { canAfford } = useResources()
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
            const affordable = canAfford(building.cost.gold, building.cost.elixir)
            const limitInfo = limits[building.type]
            const atLimit = !limitInfo.canBuild
            const isSelected = isPlacing && selectedBuildingType === building.type
            const isDisabled = !affordable || atLimit

            return (
              <div key={building.type} style={styles.buildingWrapper}>
                <button
                  style={{
                    ...styles.buildingBtn,
                    backgroundColor: building.color,
                    opacity: isDisabled ? 0.5 : 1,
                    border: isSelected ? '3px solid #fff' : '3px solid transparent',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                  }}
                  onClick={() => !isDisabled && (isSelected ? cancelPlacing() : startPlacing(building.type))}
                  disabled={isDisabled}
                  title={`${building.name}\nGold: ${building.cost.gold}\nElixir: ${building.cost.elixir}\nLimit: ${limitInfo.current}/${limitInfo.max}`}
                >
                  <span style={styles.buildingName}>{building.name.slice(0, 2)}</span>
                </button>
                <div
                  style={{
                    ...styles.limitBadge,
                    backgroundColor: atLimit ? '#e74c3c' : 'rgba(0, 0, 0, 0.6)',
                    color: atLimit ? '#fff' : '#aaa',
                  }}
                >
                  {limitInfo.current}/{limitInfo.max}
                </div>
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
  buildingName: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: '12px',
    textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
  },
  limitBadge: {
    fontSize: '10px',
    padding: '1px 4px',
    borderRadius: '4px',
    fontWeight: 'bold',
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
