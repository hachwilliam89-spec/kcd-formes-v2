import { create } from 'zustand'

interface Tower {
    id: string
    type: 'ARCHER' | 'MAGE' | 'CATAPULT' | 'BALLISTA'
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
