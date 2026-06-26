import { create } from 'zustand'

interface Tower {
    id: string
    type: 'ARCHER' | 'MAGE' | 'CATAPULT' | 'BALLISTA'
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
}

interface GameMap {
    width: number
    height: number
    towers: Tower[]
}

interface WaveResult {
    waveNumber: number
    goldEarned: number
    castleHp: number
    castleMaxHp: number
    gameStatus: string
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

    setGame: (game: {
        gameId: string
        castleId: string
        status: string
        waveNumber: number
        gold: number
        castleHp: number
        castleMaxHp: number
        map: GameMap
    }) => void

    addTower: (tower: Tower) => void
    upgradeTower: (tower: Tower) => void
    spendGold: (amount: number) => void
    setCastleHp: (hp: number) => void
    applyWaveResult: (result: WaveResult) => void
    reset: () => void
}

export const useGameStore = create<GameState>()((set) => ({
    gameId: null,
    castleId: null,
    status: '',
    waveNumber: 0,
    gold: 0,
    castleHp: 100,
    castleMaxHp: 100,
    map: null,

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
        })),

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
        }),
}))
