import { TroopType, TROOP_INFO } from '../../config/dojoConfig'
import { useTroops } from '../../hooks/useTroops'

export function TroopsList() {
  const { barbarians, archers, giants, totalSpace, maxCapacity } = useTroops()

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3>Army</h3>
        <span style={styles.capacity}>
          {totalSpace}/{maxCapacity}
        </span>
      </div>

      <div style={styles.troops}>
        <div style={styles.troop}>
          <div
            style={{
              ...styles.icon,
              backgroundColor: TROOP_INFO[TroopType.Barbarian].color,
            }}
          >
            B
          </div>
          <span>{barbarians}</span>
        </div>

        <div style={styles.troop}>
          <div
            style={{
              ...styles.icon,
              backgroundColor: TROOP_INFO[TroopType.Archer].color,
            }}
          >
            A
          </div>
          <span>{archers}</span>
        </div>

        <div style={styles.troop}>
          <div
            style={{
              ...styles.icon,
              backgroundColor: TROOP_INFO[TroopType.Giant].color,
            }}
          >
            G
          </div>
          <span>{giants}</span>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: '8px',
    padding: '12px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  capacity: {
    fontSize: '12px',
    color: '#888',
  },
  troops: {
    display: 'flex',
    gap: '12px',
  },
  troop: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  icon: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 'bold',
    fontSize: '12px',
    color: '#fff',
  },
}
