import type { Cell } from './constants'

/** État du terrain pendant une vague (miroir de SeasonalTerrain.Snapshot, envoyé par le serveur). */
export interface TerrainSnapshot {
    flooded: boolean
    fog: Cell[]
    mud?: Cell[]          // flaques de boue de la vague (automne) ; absent d'un serveur ancien
    flood?: Cell[]        // berges noyées par la crue de la vague (printemps)
    hail?: boolean        // grêle : ennemis plus vulnérables (printemps, SeasonalRules.hailDamageFactor)
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

// Les règles saisonnières (berges inondables, crues, boue, brume, grêle, bonus
// chiffrés) viennent du serveur : disposition de la carte (bankCells, water,
// seasonalRules) et prévisions (GET /api/v1/maps/{id}/forecast, aperçu de vague,
// snapshots). Voir store/catalogStore.ts. Ce fichier ne garde que les formes de
// ces données et la présentation des saisons.

/** Difficulté affichée au choix de la carte : 1 abordable, 2 rude, 3 redoutable. */
export type MapDifficulty = 1 | 2 | 3

export const MAP_THEMES: Record<string, { season: string; ground: string; road: string; accent: string; challenge: string; difficulty: MapDifficulty }> = {
    desert: { season: 'Été', ground: '#8b734c', road: '#dbbd7d', accent: '#f1d484', difficulty: 1, challenge: 'Un long serpentin, parfait pour apprendre à défendre.' },
    fourche: { season: 'Hiver', ground: '#667f87', road: '#e0edf0', accent: '#bedfe9', difficulty: 2, challenge: 'Trois chemins se rejoignent devant ton château.' },
    spring: { season: 'Printemps', ground: '#405c3c', road: '#c9b68b', accent: '#bce5c0', difficulty: 3, challenge: 'Ton château au milieu du lac, assiégé par deux ponts.' },
    autumn: { season: 'Automne', ground: '#715039', road: '#c89c68', accent: '#f3bd75', difficulty: 2, challenge: 'Un raccourci, de la boue et de la brume qui changent à chaque vague.' },
}
