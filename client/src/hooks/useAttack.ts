import { useState, useCallback } from 'react'
import { useAccount } from '@starknet-react/core'
import { TroopType } from '../config/dojoConfig'

export interface BattleState {
  battleId: number
  defender: string
  status: 'preparing' | 'inProgress' | 'ended'
  destructionPercent: number
  goldStolen: bigint
  elixirStolen: bigint
}

export function useAttack() {
  const { account } = useAccount()
  const [currentBattle, setCurrentBattle] = useState<BattleState | null>(null)
  const [isAttacking, setIsAttacking] = useState(false)

  const startAttack = useCallback(async (defenderAddress: string) => {
    if (!account) return false

    setIsAttacking(true)

    // Create battle state
    const battle: BattleState = {
      battleId: Date.now(), // Temporary ID
      defender: defenderAddress,
      status: 'preparing',
      destructionPercent: 0,
      goldStolen: BigInt(0),
      elixirStolen: BigInt(0),
    }

    setCurrentBattle(battle)

    // TODO: Call contract
    console.log('Starting attack on:', defenderAddress)

    return true
  }, [account])

  const deployTroop = useCallback(async (troopType: TroopType, x: number, y: number) => {
    if (!account || !currentBattle) return false

    // TODO: Call contract
    console.log('Deploying troop:', { troopType, x, y })

    // Update battle status
    if (currentBattle.status === 'preparing') {
      setCurrentBattle({
        ...currentBattle,
        status: 'inProgress',
      })
    }

    return true
  }, [account, currentBattle])

  const processCombat = useCallback(async () => {
    if (!account || !currentBattle) return false

    // TODO: Call contract
    console.log('Processing combat...')

    // Simulate damage
    const newDestruction = Math.min(100, currentBattle.destructionPercent + 10)
    setCurrentBattle({
      ...currentBattle,
      destructionPercent: newDestruction,
      goldStolen: currentBattle.goldStolen + BigInt(50),
      elixirStolen: currentBattle.elixirStolen + BigInt(50),
    })

    return true
  }, [account, currentBattle])

  const endBattle = useCallback(async () => {
    if (!account || !currentBattle) return false

    // TODO: Call contract
    console.log('Ending battle...')

    setCurrentBattle({
      ...currentBattle,
      status: 'ended',
    })

    setIsAttacking(false)

    return true
  }, [account, currentBattle])

  const cancelAttack = useCallback(() => {
    setCurrentBattle(null)
    setIsAttacking(false)
  }, [])

  return {
    isAttacking,
    currentBattle,
    startAttack,
    deployTroop,
    processCombat,
    endBattle,
    cancelAttack,
  }
}
