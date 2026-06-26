import { useRouter } from 'next/navigation'
import { useGameStore } from '@/store/gameStore'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'

export function useGame() {
    const router = useRouter()
    const { player } = useAuthStore()
    const {
        gameId, map, waveNumber, gold, castleHp, castleMaxHp, status,
        setGame, addTower, upgradeTower: upgradeTowerInStore, spendGold, applyWaveResult, reset,
    } = useGameStore()

    async function createGame() {
        const { data } = await api.post('/api/v1/games', {
            castleName: `Château de ${player?.username}`,
        })
        setGame(data)
        return data
    }

    async function placeTower(towerType: string, x: number, y: number, cost: number) {
        if (!gameId) throw new Error('Aucune partie en cours')
        const { data } = await api.post(`/api/v1/games/${gameId}/towers`, {
            towerType,
            x,
            y,
        })
        addTower(data)
        spendGold(cost)
        return data
    }

    async function upgradeTower(towerId: string, cost: number) {
        if (!gameId) throw new Error('Aucune partie en cours')
        const { data } = await api.post(`/api/v1/games/${gameId}/towers/${towerId}/upgrade`)
        upgradeTowerInStore(data)
        spendGold(cost)
        return data
    }

    async function startWave() {
        if (!gameId) throw new Error('Aucune partie en cours')
        const { data } = await api.post(`/api/v1/games/${gameId}/waves/start`)
        applyWaveResult({
            waveNumber: data.number,
            goldEarned: data.goldEarned,
            castleHp: data.castleHp,
            castleMaxHp: data.castleMaxHp,
            gameStatus: data.gameStatus,
        })
        return data
    }

    function resetGame() {
        reset()
        router.push('/')
    }

    // Recharge l'état complet de la partie depuis le backend. Utile après une vague :
    // un Sapeur peut avoir détruit une tour en cours de simulation (mémoire serveur),
    // et seul un refetch de la map donne l'état des tours réellement à jour (PV, suppression).
    async function refreshGame() {
        if (!gameId) throw new Error('Aucune partie en cours')
        const { data } = await api.get(`/api/v1/games/${gameId}`)
        setGame(data)
        return data
    }

    return {
        gameId,
        map,
        waveNumber,
        gold,
        castleHp,
        castleMaxHp,
        status,
        createGame,
        placeTower,
        upgradeTower,
        startWave,
        refreshGame,
        resetGame,
    }
}
