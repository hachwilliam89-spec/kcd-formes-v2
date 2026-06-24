import { create } from 'zustand'

interface Tower {
    id: string
    type: 'ARCHER' | 'MAGE' | 'CATAPULT'
    x: number
    y: number
    level: number
    damage: number
    range: number
}

interface GameMap {
    width: number
    height: number
    towers: Tower[]
}

interface GameState {
    gameId: string | null
    castleId: string | null
    status: string
    waveNumber: number
    gold: number
    map: GameMap | null

    setGame: (game: {
        gameId: string
        castleId: string
        status: string
        waveNumber: number
        gold: number
        map: GameMap
    }) => void

    addTower: (tower: Tower) => void
    incrementWave: () => void
    reset: () => void
}

export const useGameStore = create<GameState>()((set) => ({
    gameId: null,
    castleId: null,
    status: '',
    waveNumber: 0,
    gold: 0,
    map: null,

    setGame: (game) =>
        set({
            gameId: game.gameId,
            castleId: game.castleId,
            status: game.status,
            waveNumber: game.waveNumber,
            gold: game.gold,
            map: game.map,
        }),

    addTower: (tower) =>
        set((state) => ({
            map: state.map
                ? { ...state.map, towers: [...state.map.towers, tower] }
                : null,
        })),

    incrementWave: () =>
        set((state) => ({ waveNumber: state.waveNumber + 1 })),

    reset: () =>
        set({
            gameId: null,
            castleId: null,
            status: '',
            waveNumber: 0,
            gold: 0,
            map: null,
        }),
}))