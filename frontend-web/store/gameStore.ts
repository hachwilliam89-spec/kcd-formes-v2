import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface Tower {
    id: string
    type: 'ARCHER' | 'MAGE' | 'CATAPULT' | 'BALLISTA' | 'WALL'
    x: number
    y: number
    level: number
    damage: number
    range: number
    // Profil de dégâts renvoyé par le backend (voir TowerResponse côté Java) —
    // utilisé par GameScene pour distinguer visuellement zone/mono-cible/continu.
    damageType: 'SINGLE_TARGET' | 'AOE' | 'CONTINUOUS'
    splashRadius: number
    // PV courants / max de la structure elle-même — un Sapeur (ennemi qui dévie
    // du chemin pour détruire une tour, voir GameScene) les réduit en cours de
    // vague ; à 0, la tour est définitivement détruite côté backend.
    hp: number
    maxHp: number
    // Mode de ciblage choisi par le joueur (voir backend TargetingMode) —
    // absent (défaut CLOSEST) pour les tours d'une partie d'avant la feature.
    targetingMode?: 'CLOSEST' | 'FIRST' | 'STRONGEST'
}

interface GameMap {
    width: number
    height: number
    towers: Tower[]
}

interface BonusOption {
    type: string
    label: string
    description: string
}

interface WaveResult {
    waveNumber: number
    goldEarned: number
    castleHp: number
    castleMaxHp: number
    gameStatus: string
    // Palier de bonus (toutes les 5 vagues, voir backend GameService) : si vrai,
    // le joueur doit choisir un bonus avant de pouvoir relancer une vague.
    awaitingBonusChoice: boolean
    availableBonuses: BonusOption[]
}

interface GameState {
    gameId: string | null
    castleId: string | null
    status: string
    waveNumber: number
    gold: number
    castleHp: number
    castleMaxHp: number
    map: GameMap | null
    awaitingBonusChoice: boolean
    availableBonuses: BonusOption[]

    setGame: (game: {
        gameId: string
        castleId: string
        status: string
        waveNumber: number
        gold: number
        castleHp: number
        castleMaxHp: number
        map: GameMap
        awaitingBonusChoice?: boolean
        // Fournies par le backend avec l'état (voir GameResponse) : sans elles,
        // un rechargement pendant un palier rouvrait une modale de choix vide.
        availableBonuses?: BonusOption[]
    }) => void

    addTower: (tower: Tower) => void
    upgradeTower: (tower: Tower) => void
    spendGold: (amount: number) => void
    setCastleHp: (hp: number) => void
    applyWaveResult: (result: WaveResult) => void
    applyBonusChoice: (result: { gold: number; castleHp: number; castleMaxHp: number }) => void
    reset: () => void

    /** Vrai une fois gameId relu depuis localStorage — même besoin que authStore.hasHydrated. */
    hasHydrated: boolean
    setHasHydrated: (hydrated: boolean) => void
}

export const useGameStore = create<GameState>()(persist((set) => ({
    gameId: null,
    castleId: null,
    status: '',
    waveNumber: 0,
    gold: 0,
    castleHp: 100,
    castleMaxHp: 100,
    map: null,
    awaitingBonusChoice: false,
    availableBonuses: [],

    setGame: (game) =>
        set({
            gameId: game.gameId,
            castleId: game.castleId,
            status: game.status,
            waveNumber: game.waveNumber,
            gold: game.gold,
            castleHp: game.castleHp,
            castleMaxHp: game.castleMaxHp,
            map: game.map,
            awaitingBonusChoice: game.awaitingBonusChoice ?? false,
            availableBonuses: game.availableBonuses ?? [],
        }),

    addTower: (tower) =>
        set((state) => ({
            map: state.map
                ? { ...state.map, towers: [...state.map.towers, tower] }
                : null,
        })),

    // Remplace la tour existante (même id) par sa version mise à jour renvoyée par
    // le backend après amélioration (niveau, dégâts, portée recalculés).
    upgradeTower: (tower) =>
        set((state) => ({
            map: state.map
                ? {
                      ...state.map,
                      towers: state.map.towers.map((t) => (t.id === tower.id ? tower : t)),
                  }
                : null,
        })),

    spendGold: (amount) =>
        set((state) => ({ gold: Math.max(0, state.gold - amount) })),

    setCastleHp: (hp) => set({ castleHp: hp }),

    applyWaveResult: (result) =>
        set((state) => ({
            waveNumber: result.waveNumber,
            gold: state.gold + result.goldEarned,
            castleHp: result.castleHp,
            castleMaxHp: result.castleMaxHp,
            status: result.gameStatus,
            awaitingBonusChoice: result.awaitingBonusChoice,
            availableBonuses: result.availableBonuses,
        })),

    // Choix de bonus résolu côté backend (voir ChooseBonusUseCase) : on referme
    // l'invite et on applique l'effet (or/PV château déjà recalculés côté serveur).
    applyBonusChoice: (result) =>
        set({
            gold: result.gold,
            castleHp: result.castleHp,
            castleMaxHp: result.castleMaxHp,
            awaitingBonusChoice: false,
            availableBonuses: [],
        }),

    reset: () =>
        set({
            gameId: null,
            castleId: null,
            status: '',
            waveNumber: 0,
            gold: 0,
            castleHp: 100,
            castleMaxHp: 100,
            map: null,
            awaitingBonusChoice: false,
            availableBonuses: [],
        }),

    hasHydrated: false,
    setHasHydrated: (hydrated) => set({ hasHydrated: hydrated }),
}), {
    name: 'game-storage',
    // Seuls les IDENTIFIANTS survivent au rechargement : tout le reste (map, or,
    // PV, statut...) est refetché depuis le backend au montage (voir
    // useGame.resumeGame) — le serveur est la seule source de vérité, persister
    // des copies locales inviterait à rejouer sur un état périmé.
    partialize: (state) => ({ gameId: state.gameId, castleId: state.castleId }),
    onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true)
    },
}))
