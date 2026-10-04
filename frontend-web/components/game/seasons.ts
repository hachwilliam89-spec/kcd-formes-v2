import type { Cell } from './constants'

/** État du terrain pendant une vague (miroir de SeasonalTerrain.Snapshot, envoyé par le serveur). */
export interface TerrainSnapshot {
    flooded: boolean
    fog: Cell[]
    mud?: Cell[]          // flaques de boue de la vague (automne) ; absent d'un serveur ancien
    flood?: Cell[]        // berges noyées par la crue de la vague (printemps)
    hail?: boolean        // grêle : ennemis +25 % de dégâts subis (printemps)
    disabledTowers: string[]
    foggedTowers: string[]
}

/** Annonce d'une vague à venir (miroir de SeasonalTerrain.Forecast, dans l'aperçu de vague). */
export interface TerrainForecast {
    type: 'NONE' | 'SPRING' | 'AUTUMN'
    flooded: boolean
    affectedCells: Cell[] // berges (printemps) ou boue de la vague (automne)
    fogCells: Cell[]      // bancs de brume prévus (automne)
    hail?: boolean        // grêle prévue (printemps)
}

// Miroirs des règles de SeasonalTerrain (le serveur reste l'arbitre) : zones fixes
// et constantes, pour l'affichage et les cercles de portée.
export const FLOOD_INTERVAL = 3
export const MUD_SPEED_FACTOR = 0.6 // sauf géants (Troll, boss), qui la traversent sans ralentir
export const FOG_RANGE_PENALTY = 1

const rect = (x0: number, y0: number, x1: number, y1: number): Cell[] => {
    const cells: Cell[] = []
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push({ x, y })
    return cells
}
const union = (...parts: Cell[][]): Cell[] => {
    const seen = new Set<string>()
    return parts.flat().filter((c) => { const k = `${c.x},${c.y}`; return seen.has(k) ? false : (seen.add(k), true) })
}

/**
 * Lac du printemps : douves de part et d'autre de l'île du château (10,8). Eau
 * infranchissable et inconstructible — miroir de SeasonalTerrain.WATER_CELLS. Les deux
 * ponts (nord et sud) sont les cases de route qui traversent le lac.
 */
export const WATER_CELLS: Cell[] = union(rect(7, 6, 8, 10), rect(12, 6, 13, 10))
/** Emprise du lac (eau + ponts + île) : x=7..13, y=6..10. */
export const LAKE = { x0: 7, y0: 6, x1: 13, y1: 10 }

// Rives du lac (printemps) : chaque crue en noie une partie, dans un sens qui change.
const BANK_WEST = rect(6, 5, 6, 11), BANK_EAST = rect(14, 5, 14, 11)
const BANK_NORTH = union(rect(6, 5, 8, 5), rect(12, 5, 14, 5)), BANK_SOUTH = union(rect(6, 11, 8, 11), rect(12, 11, 14, 11))
/** Toutes les berges que la crue peut noyer — miroir de SeasonalTerrain.bankCells. */
export const BANK_CELLS: Cell[] = union(BANK_WEST, BANK_EAST, BANK_NORTH, BANK_SOUTH)
const FLOOD_SEQUENCE: Cell[][] = [
    union(BANK_WEST, BANK_EAST), BANK_NORTH, BANK_SOUTH, union(BANK_WEST, BANK_EAST),
    union(BANK_NORTH, BANK_SOUTH), BANK_SOUTH, BANK_NORTH, union(BANK_NORTH, BANK_SOUTH),
]
/**
 * Berges noyées à une vague (miroir de SeasonalTerrain.floodCells). En jeu, le front
 * affiche celles du serveur ; ce miroir sert aux aperçus (banc).
 */
export const floodCellsFor = (wave: number): Cell[] =>
    wave > 0 && wave % FLOOD_INTERVAL === 0 ? FLOOD_SEQUENCE[(wave / FLOOD_INTERVAL - 1) % FLOOD_SEQUENCE.length] : []
export const HAIL_DAMAGE_BONUS = 25 // % de dégâts en plus pendant la grêle (SeasonalTerrain.HAIL_DAMAGE_FACTOR)

/** Emplacements de flaques de boue (automne) : 6 sur le serpentin, 2 sur le raccourci. */
const MUD_SERPENTINE: Cell[][] = [
    rect(12, 2, 14, 4), rect(15, 4, 17, 6), rect(12, 7, 14, 9), rect(4, 7, 6, 9), rect(2, 9, 4, 11), rect(5, 12, 7, 14),
]
const MUD_SHORTCUT: Cell[][] = [rect(8, 5, 10, 6), rect(8, 10, 10, 11)]
const MUD_TRIOS: number[][] = []
for (let i = 0; i < MUD_SERPENTINE.length; i++) for (let j = i + 1; j < MUD_SERPENTINE.length; j++) for (let k = j + 1; k < MUD_SERPENTINE.length; k++) MUD_TRIOS.push([i, j, k])

/**
 * Boue d'une vague : une flaque sur le raccourci + trois sur le serpentin, tirage fixe
 * (miroir de SeasonalTerrain.mudCells). En jeu, le front affiche celle du serveur ;
 * ce miroir sert aux aperçus (sélection de carte, banc).
 */
export const mudCellsFor = (wave: number): Cell[] => {
    if (wave < 1) return []
    const draws = MUD_SHORTCUT.length * MUD_TRIOS.length
    const index = (((wave * 7 + 3) % draws) + draws) % draws
    return union(MUD_SHORTCUT[index % MUD_SHORTCUT.length], ...MUD_TRIOS[Math.floor(index / MUD_SHORTCUT.length)].map((s) => MUD_SERPENTINE[s]))
}

/** Cycle des bancs de brume (vagues 1, 2, 3 puis on recommence) — miroir de FOG_CYCLE. */
export const FOG_CYCLE: Cell[][] = [
    union(rect(5, 1, 10, 6), rect(12, 10, 18, 11)), // nord-ouest + sud-est
    union(rect(11, 1, 16, 6), rect(0, 11, 8, 15)),  // nord-est + sud-ouest
    union(rect(5, 4, 15, 6), rect(17, 1, 19, 11)),  // centre + flanc est
]
export const fogCellsFor = (wave: number): Cell[] => (wave >= 1 ? FOG_CYCLE[(wave - 1) % FOG_CYCLE.length] : [])

/** Difficulté affichée au choix de la carte : 1 abordable, 2 rude, 3 redoutable. */
export type MapDifficulty = 1 | 2 | 3

export const MAP_THEMES: Record<string, { season: string; ground: string; road: string; accent: string; challenge: string; difficulty: MapDifficulty }> = {
    desert: { season: 'Été', ground: '#8b734c', road: '#dbbd7d', accent: '#f1d484', difficulty: 1, challenge: 'Un long serpentin, parfait pour apprendre à défendre.' },
    fourche: { season: 'Hiver', ground: '#667f87', road: '#e0edf0', accent: '#bedfe9', difficulty: 2, challenge: 'Trois chemins se rejoignent devant ton château.' },
    spring: { season: 'Printemps', ground: '#405c3c', road: '#c9b68b', accent: '#bce5c0', difficulty: 3, challenge: 'Ton château au milieu du lac, assiégé par deux ponts.' },
    autumn: { season: 'Automne', ground: '#715039', road: '#c89c68', accent: '#f3bd75', difficulty: 2, challenge: 'Un raccourci, de la boue et de la brume qui changent à chaque vague.' },
}
