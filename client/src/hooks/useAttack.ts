import { useState, useCallback } from 'react'
import { useAccount } from '@starknet-react/core'
import { TroopType, dojoConfig } from '../config/dojoConfig'
import { useDojo } from '../providers/DojoProvider'

export interface BattleState {
  battleId: number
  defender: string
  status: 'preparing' | 'inProgress' | 'ended'
  destructionPercent: number
  diamondStolen: bigint
  gasStolen: bigint
  tickCount: number
}

const noFeeDetails = {
  resourceBounds: {
    l1_gas: { max_amount: 0n, max_price_per_unit: 0n },
    l2_gas: { max_amount: 0n, max_price_per_unit: 0n },
    l1_data_gas: { max_amount: 0n, max_price_per_unit: 0n },
  },
}

export function useAttack() {
  const { account } = useAccount()
  const { fetchBattleData } = useDojo()
  const [currentBattle, setCurrentBattle] = useState<BattleState | null>(null)
  const [isAttacking, setIsAttacking] = useState(false)

  const startAttack = useCallback(async (defenderAddress: string): Promise<number | null> => {
    if (!account) return null

    setIsAttacking(true)

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.combatSystemAddress,
          entrypoint: 'start_attack',
          calldata: [defenderAddress],
        },
      ], noFeeDetails)

      // Fetch the battle counter to get the battle ID
      const battleId = await fetchBattleData()
      if (battleId !== null) {
        const battle: BattleState = {
          battleId,
          defender: defenderAddress,
          status: 'preparing',
          destructionPercent: 0,
          diamondStolen: BigInt(0),
          gasStolen: BigInt(0),
          tickCount: 0,
        }
        setCurrentBattle(battle)
      }
      return battleId
    } catch (error) {
      console.error('Failed to start attack:', error)
      setIsAttacking(false)
      return null
    }
  }, [account, fetchBattleData])

  const deployTroop = useCallback(async (battleId: number, troopType: TroopType, x: number, y: number) => {
    if (!account || !currentBattle) return false

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.combatSystemAddress,
          entrypoint: 'deploy_troop',
          calldata: [battleId, troopType, x, y],
        },
      ], noFeeDetails)

      // Update battle status
      if (currentBattle.status === 'preparing') {
        setCurrentBattle({
          ...currentBattle,
          status: 'inProgress',
        })
      }

      return true
    } catch (error) {
      console.error('Failed to deploy troop:', error)
      return false
    }
  }, [account, currentBattle])

  const resolveBattle = useCallback(async (battleId: number): Promise<BattleState | null> => {
    if (!account || !currentBattle) return null

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.combatSystemAddress,
          entrypoint: 'resolve_battle',
          calldata: [battleId],
        },
      ], noFeeDetails)

      // Fetch final battle state from Torii
      const finalBattle = await fetchBattleData(battleId)
      if (finalBattle !== null) {
        const endedBattle: BattleState = {
          ...currentBattle,
          status: 'ended',
          destructionPercent: finalBattle as number, // Will be replaced with proper data
        }
        setCurrentBattle(endedBattle)
        setIsAttacking(false)
        return endedBattle
      }

      return null
    } catch (error) {
      console.error('Failed to resolve battle:', error)
      return null
    }
  }, [account, currentBattle, fetchBattleData])

  const cancelAttack = useCallback(() => {
    setCurrentBattle(null)
    setIsAttacking(false)
  }, [])

  return {
    isAttacking,
    currentBattle,
    setCurrentBattle,
    startAttack,
    deployTroop,
    resolveBattle,
    cancelAttack,
  }
}
