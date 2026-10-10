import { create } from 'zustand'
import api from '@/lib/api'
import { buildMapDef, type MapDef } from '@/components/game/maps'
import type { Cell } from '@/components/game/constants'
import type { TerrainForecast } from '@/components/game/seasons'

/**
 * Données de jeu statiques servies par le backend : catalogue des tours
 * (GET /api/v1/towers) et disposition des cartes (GET /api/v1/maps/{id}).
 *
 * Source de vérité unique pour le web (comme pour le client Godot) : coûts,
 * déblocages, stats par niveau, couloir, cases constructibles, voies, eau. Le
 * client les affiche et filtre ses aperçus avec ; il ne les recalcule jamais
 * (AGENTS.md, principe 3). Chargées une fois par session (requêtes publiques),
 * lisibles hors React (GameScene) via useCatalogStore.getState().
 */

export type TowerType = 'ARCHER' | 'MAGE' | 'CATAPULT' | 'BALLISTA' | 'WALL'

/** Miroir de TowerSpecResponse.LevelResponse. upgradeCost = prix du niveau suivant, 0 au max. */
export interface TowerLevelSpec {
    level: number
    damage: number
    range: number
    maxHp: number
    upgradeCost: number
}

/** Miroir de TowerSpecResponse (backend GetTowerCatalogUseCase). */
export interface TowerSpec {
    type: TowerType
    cost: number
    damageType: 'SINGLE_TARGET' | 'AOE' | 'CONTINUOUS'
    attackSpeed: number
    splashRadius: number
    heavyTargetMultiplier: number
    /** Meilleure vague du compte requise (bestWave de /players/me), 0 = d'office. */
    unlockWave: number
    /** OFF_CORRIDOR : bande constructible ; ON_CORRIDOR : sur la route (Mur). */
    placement: 'OFF_CORRIDOR' | 'ON_CORRIDOR'
    /** Nombre maximum posé en même temps, 0 = illimité. */
    maxCount: number
    /** Du niveau 1 au niveau max. */
    levels: TowerLevelSpec[]
}

/** Miroir de MapLayoutResponse (backend GetMapLayoutUseCase). Positions en {x, y}. */
export interface MapLayout {
    id: string
    width: number
    height: number
    terrain: string
    castle: Cell
    spawns: Cell[]
    /** Points de passage de chaque voie (tracé du catalogue). */
    lanes: Cell[][]
    /** Chemin case par case de chaque voie, de l'entrée au château. */
    lanePaths: Cell[][]
    corridorHalfWidth: number
    wideSpots: Cell[]
    corridorCells: Cell[]
    buildableCells: Cell[]
    waterCells: Cell[]
    /** Berges que la crue peut noyer (printemps), vide ailleurs. */
    bankCells: Cell[]
    seasonalRules: SeasonalRules
}

/** Miroir de GetMapLayoutUseCase.SeasonalRules : effets chiffrés des saisons. */
export interface SeasonalRules {
    floodInterval: number
    mudSpeedFactor: number
    fogRangePenalty: number
    hailDamageFactor: number
    fertileGoldFactor: number
    fogDamageTakenFactor: number
}

/** Contenu brut des deux endpoints : aussi le format injecté par les outils hors ligne. */
export interface CatalogData {
    towers: TowerSpec[]
    maps: MapLayout[]
    /**
     * Prévisions saisonnières par carte (GET /api/v1/maps/{id}/forecast), index = vague - 1.
     * Le jeu charge la vague 1 (aperçu du choix de carte) ; les outils peuvent en fournir plus.
     */
    forecasts?: Record<string, TerrainForecast[]>
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface CatalogState {
    towers: TowerSpec[]
    /** Cartes dans l'ordre du serveur, disposition + présentation (voir maps.ts). */
    maps: MapDef[]
    seasonalRules: SeasonalRules | null
    forecasts: Record<string, TerrainForecast[]>
    status: Status
    /** Charge le catalogue s'il ne l'est pas déjà (idempotent, relance après une erreur). */
    load: () => Promise<void>
    /** Données fournies directement (outils hors ligne : export visuel, banc de perf). */
    seed: (data: CatalogData) => void
}

let pending: Promise<void> | null = null

export const useCatalogStore = create<CatalogState>()((set, get) => ({
    towers: [],
    maps: [],
    seasonalRules: null,
    forecasts: {},
    status: 'idle',

    load: () => {
        if (get().status === 'ready') return Promise.resolve()
        if (pending) return pending
        set({ status: 'loading' })
        pending = (async () => {
            try {
                const [towers, ids] = await Promise.all([
                    api.get<TowerSpec[]>('/api/v1/towers'),
                    api.get<string[]>('/api/v1/maps'),
                ])
                const [layouts, firstWaves] = await Promise.all([
                    Promise.all(ids.data.map((id) => api.get<MapLayout>(`/api/v1/maps/${encodeURIComponent(id)}`))),
                    Promise.all(ids.data.map((id) => api.get<TerrainForecast>(`/api/v1/maps/${encodeURIComponent(id)}/forecast?wave=1`))),
                ])
                const forecasts: Record<string, TerrainForecast[]> = {}
                ids.data.forEach((id, i) => { forecasts[id] = [firstWaves[i].data] })
                get().seed({ towers: towers.data, maps: layouts.map((r) => r.data), forecasts })
            } catch {
                set({ status: 'error' })
            } finally {
                pending = null
            }
        })()
        return pending
    },

    seed: (data) => set({
        towers: data.towers,
        maps: data.maps.map(buildMapDef),
        seasonalRules: data.maps[0]?.seasonalRules ?? null,
        forecasts: data.forecasts ?? {},
        status: 'ready',
    }),
}))

/**
 * Hook des pages de jeu : déclenche le chargement et indique l'état. Le jeu ne
 * s'affiche qu'une fois `ready` (GameScene lit le catalogue dès sa création).
 */
export function useCatalog() {
    const status = useCatalogStore((s) => s.status)
    const towers = useCatalogStore((s) => s.towers)
    const maps = useCatalogStore((s) => s.maps)
    const load = useCatalogStore((s) => s.load)
    return { status, towers, maps, load }
}

// ── Accès hors React (GameScene, règles d'aperçu) ────────────────────────────

/** Toutes les cartes chargées, dans l'ordre du serveur. */
export const getMaps = (): MapDef[] => useCatalogStore.getState().maps

/**
 * Carte par id ; la première du catalogue si l'id est inconnu ou absent.
 * Le catalogue doit être chargé (les pages attendent `ready` avant d'afficher le jeu).
 */
export function getMapDef(id?: string | null): MapDef {
    const maps = getMaps()
    const map = maps.find((m) => m.id === id) ?? maps[0]
    if (!map) throw new Error('Catalogue des cartes non chargé (useCatalogStore.load)')
    return map
}

/**
 * Effets chiffrés des saisons (serveur). Valeurs neutres tant que le catalogue n'est
 * pas chargé : aucune pénalité ni bonus affiché à tort.
 */
export function getSeasonalRules(): SeasonalRules {
    return useCatalogStore.getState().seasonalRules ?? {
        floodInterval: 0, mudSpeedFactor: 1, fogRangePenalty: 0,
        hailDamageFactor: 1, fertileGoldFactor: 1, fogDamageTakenFactor: 1,
    }
}

/** Prévision saisonnière d'une vague sur une carte, si le catalogue la fournit. */
export const getForecast = (mapId: string, wave: number): TerrainForecast | undefined =>
    useCatalogStore.getState().forecasts[mapId]?.[wave - 1]

/** Vagues de crue lisibles (« 3, 6, 9… ») d'après l'intervalle du serveur. */
export function floodWavesLabel(): string {
    const n = getSeasonalRules().floodInterval
    return n > 0 ? `${n}, ${2 * n}, ${3 * n}…` : '—'
}

/** Écart en pour cent d'un multiplicateur (1.25 → 25, 0.45 → 55). */
export const percentOff = (factor: number) => Math.round(Math.abs(factor - 1) * 100)

/** Spécification d'un type de tour, undefined si le catalogue ne la connaît pas. */
export const getTowerSpec = (type: string): TowerSpec | undefined =>
    useCatalogStore.getState().towers.find((t) => t.type === type)

/** Stats d'une tour à un niveau donné (borné aux niveaux connus). */
export function towerLevel(spec: TowerSpec, level = 1): TowerLevelSpec | undefined {
    if (spec.levels.length === 0) return undefined
    return spec.levels[Math.min(Math.max(level, 1), spec.levels.length) - 1]
}

/** Portée (cases) d'un type de tour à un niveau donné, 0 si inconnue ou sans tir (Mur). */
export function towerRangeAt(type: string, level = 1): number {
    const spec = getTowerSpec(type)
    // Portée nulle au niveau 1 = structure sans tir (Mur) : aucun cercle, quel que soit le niveau.
    if (!spec || (spec.levels[0]?.range ?? 0) <= 0) return 0
    return towerLevel(spec, level)?.range ?? 0
}
