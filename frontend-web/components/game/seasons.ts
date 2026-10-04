import type { Cell } from './constants'

export interface TerrainSnapshot {
    flooded: boolean
    burning: Cell[]
    burned: Cell[]
    disabledTowers: string[]
}
export interface TerrainForecast {
    type: 'NONE' | 'SPRING' | 'AUTUMN'
    flooded: boolean
    affectedCells: Cell[]
}

// Miroirs de SeasonalTerrain : zones fixes ; les états actifs arrivent du serveur.
export const FLOOD_CELLS: Cell[] = [6, 8, 10].flatMap(y => Array.from({ length: 7 }, (_, i) => ({ x: i + 8, y })))
export const LEAF_CELLS: Cell[] = [
    ...Array.from({ length: 4 }, (_, i) => ({ x: i + 6, y: 3 })),
    ...Array.from({ length: 4 }, (_, i) => ({ x: i + 10, y: 7 })),
    ...Array.from({ length: 4 }, (_, i) => ({ x: i + 6, y: 12 })),
]
export const MAP_THEMES: Record<string, { season: string; ground: string; road: string; accent: string; challenge: string }> = {
    desert: { season: 'Été', ground: '#8b734c', road: '#dbbd7d', accent: '#f1d484', challenge: 'Un long parcours pour maîtriser votre défense.' },
    fourche: { season: 'Hiver', ground: '#667f87', road: '#e0edf0', accent: '#bedfe9', challenge: 'Trois branches à couvrir autour du château.' },
    spring: { season: 'Printemps', ground: '#405c3c', road: '#c9b68b', accent: '#bce5c0', challenge: 'Crue aux vagues 3, 6, 9… : les tours des berges bleues ne tirent plus pendant la vague.' },
    autumn: { season: 'Automne', ground: '#715039', road: '#c89c68', accent: '#f3bd75', challenge: 'Les impacts de catapulte enflamment les feuilles : une seule combustion par zone et par vague.' },
}
