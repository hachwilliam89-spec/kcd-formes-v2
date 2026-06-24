import { useRouter } from 'next/navigation'
import { useGameStore } from '@/store/gameStore'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'

export function useGame() {
    const router = useRouter()
    const { player } = useAuthStore()
    const { gameId, map, waveNumber, gold, setGame, addTower, incrementWave, reset } = useGameStore()

    async function createGame() {
        const { data } = await api.post('/api/v1/games', {
            castleName: `Château de ${player?.username}`,
        })
        setGame(data)
        return data
    }

    async function placeTower(towerType: string, x: number, y: number) {
        if (!gameId) throw new Error('Aucune partie en cours')
        const { data } = await api.post(`/api/v1/games/${gameId}/towers`, {
            towerType,
            x,
            y,
        })
        addTower(data)
        return data
    }

    async function startWave() {
        if (!gameId) throw new Error('Aucune partie en cours')
        const { data } = await api.post(`/api/v1/games/${gameId}/waves/start`)
        incrementWave()
        return data
    }

    function resetGame() {
        reset()
        router.push('/')
    }

    return {
        gameId,
        map,
        waveNumber,
        gold,
        createGame,
        placeTower,
        startWave,
        resetGame,
    }
}