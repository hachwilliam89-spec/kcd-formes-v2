import { useRouter } from 'next/navigation'
import { useGameStore } from '@/store/gameStore'
import { useAuthStore } from '@/store/authStore'
import api from '@/lib/api'

export function useGame() {
    const router = useRouter()
    const { player } = useAuthStore()
    const {
        gameId, map, waveNumber, gold, castleHp, castleMaxHp, status,
        awaitingBonusChoice, availableBonuses, hasHydrated,
        setGame, addTower, upgradeTower: upgradeTowerInStore, spendGold, applyWaveResult,
        applyBonusChoice, reset,
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
            awaitingBonusChoice: data.awaitingBonusChoice,
            availableBonuses: data.availableBonuses,
        })
        return data
    }

    // Palier de bonus (toutes les 5 vagues) : envoie le choix du joueur au backend,
    // qui applique l'effet et lève le blocage sur le lancement de vague suivant.
    async function chooseBonus(bonusType: string) {
        if (!gameId) throw new Error('Aucune partie en cours')
        const { data } = await api.post(`/api/v1/games/${gameId}/bonus/choose`, { bonusType })
        applyBonusChoice(data)
        // La réponse du choix ne porte que l'or et les PV du château
        // (ChooseBonusResult) : les effets sur la map — TOWER_REPAIR remet les
        // jauges des tours à plein côté serveur — n'y figurent pas. Sans ce
        // refetch, les barres de vie des tours restaient sur l'état d'avant le
        // bonus. Même besoin (et même remède) que les tours détruites par un
        // Sapeur pendant une vague, voir refreshGame.
        await refreshGame()
        return data
    }

    function resetGame() {
        reset()
        router.push('/')
    }

    // Reprise après un rechargement de page : le store ne persiste que le gameId,
    // l'état complet (map, or, PV, statut) est refetché ici depuis le backend.
    // Si la partie n'existe plus côté serveur (base réinitialisée, id d'un autre
    // environnement...), on repart sur un store vierge — le composant recréera
    // alors une partie neuve via createGame.
    async function resumeGame() {
        try {
            return await refreshGame()
        } catch {
            reset()
            return null
        }
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
        awaitingBonusChoice,
        availableBonuses,
        hasHydrated,
        createGame,
        placeTower,
        upgradeTower,
        startWave,
        chooseBonus,
        refreshGame,
        resumeGame,
        resetGame,
    }
}
