import { useState, useCallback } from 'react'
import { useAccount } from '@starknet-react/core'
import { TroopType, SpellType, dojoConfig, NO_FEE_DETAILS } from '../config/dojoConfig'
import { useDojo, BattleResultData } from '../providers/DojoProvider'

export interface BattleState {
  battleId: number
  defender: string
  status: 'preparing' | 'inProgress' | 'ended'
  destructionPercent: number
  diamondStolen: bigint
  gasStolen: bigint
  tickCount: number
  trophiesChange: number
  troopsDeployed: number
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
      ], NO_FEE_DETAILS)

      // Fetch the battle counter to get the battle ID
      const result = await fetchBattleData()
      const battleId = typeof result === 'number' ? result : null
      if (battleId !== null) {
        const battle: BattleState = {
          battleId,
          defender: defenderAddress,
          status: 'preparing',
          destructionPercent: 0,
          diamondStolen: BigInt(0),
          gasStolen: BigInt(0),
          tickCount: 0,
          trophiesChange: 0,
          troopsDeployed: 0,
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
      ], NO_FEE_DETAILS)

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
      ], NO_FEE_DETAILS)

      // Fetch final battle state from Torii
      const finalBattle = await fetchBattleData(battleId)
      if (finalBattle !== null) {
        const data = finalBattle as BattleResultData
        const endedBattle: BattleState = {
          ...currentBattle,
          status: 'ended',
          destructionPercent: data.destructionPercent,
          diamondStolen: data.diamondStolen,
          gasStolen: data.gasStolen,
          trophiesChange: data.trophiesChange,
          troopsDeployed: data.troopsDeployed,
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

  const deploySpell = useCallback(async (battleId: number, spellType: SpellType, x: number, y: number) => {
    if (!account || !currentBattle) return false

    try {
      await account.execute([
        {
          contractAddress: dojoConfig.combatSystemAddress,
          entrypoint: 'deploy_spell',
          calldata: [battleId, spellType, x, y],
        },
      ], NO_FEE_DETAILS)

      if (currentBattle.status === 'preparing') {
        setCurrentBattle({
          ...currentBattle,
          status: 'inProgress',
        })
      }

      return true
    } catch (error) {
      console.error('Failed to deploy spell:', error)
      return false
    }
  }, [account, currentBattle])

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
    deploySpell,
    resolveBattle,
    cancelAttack,
  }
}
