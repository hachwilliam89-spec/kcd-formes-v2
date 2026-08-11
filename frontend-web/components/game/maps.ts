// Catalogue des maps jouables (solo + multi). Grille fixe 20×16 : seuls le TRACÉ
// (waypoints) et le BIOME (image de terrain + décor) changent d'une map à l'autre.
// Doit rester synchronisé avec le catalogue backend (MapCatalog) — mêmes id + waypoints.
import { Cell, PathData, buildPathData, corridorHas, pathDirectionAtIn } from './constants'

export type Biome = 'desert' | 'prairie' | 'snow'

export type MapDef = {
  id: string
  name: string
  biome: Biome
  image: string        // image de terrain pré-composée (/sprites/terrain/…)
  waypoints: Cell[]
  path: PathData        // dérivé (couloir, cases de chemin, directions)
}

function def(id: string, name: string, biome: Biome, image: string, waypoints: Cell[]): MapDef {
  return { id, name, biome, image, waypoints, path: buildPathData(waypoints) }
}

// ⚠️ Waypoints alignés deux à deux (chaque paille partage x ou y), y ≥ 1 (rangée 0
// = tampon). Doivent être IDENTIQUES côté backend (MapCatalog).
export const GAME_MAPS: MapDef[] = [
  def('desert', 'Terres désolées', 'desert', '/sprites/terrain/desert_map.png', [
    { x: 0, y: 3 }, { x: 17, y: 3 }, { x: 17, y: 8 }, { x: 2, y: 8 }, { x: 2, y: 13 }, { x: 19, y: 13 },
  ]),
  def('prairie', 'Prairie', 'prairie', '/sprites/terrain/prairie_map.png', [
    { x: 0, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 13 }, { x: 17, y: 13 }, { x: 17, y: 6 }, { x: 19, y: 6 },
  ]),
  def('snow', 'Toundra', 'snow', '/sprites/terrain/snow_map.png', [
    { x: 0, y: 13 }, { x: 17, y: 13 }, { x: 17, y: 3 }, { x: 2, y: 3 }, { x: 2, y: 9 }, { x: 19, y: 9 },
  ]),
]

export const DEFAULT_MAP_ID = 'desert'

export function getMapDef(id?: string | null): MapDef {
  return GAME_MAPS.find((m) => m.id === id) ?? GAME_MAPS[0]
}

// Helpers par map (équivalents des globaux de constants.ts mais pour une map donnée).
export const mapIsCorridor = (m: MapDef, x: number, y: number) => corridorHas(m.path, x, y)
export const mapPathDir = (m: MapDef, x: number, y: number) => pathDirectionAtIn(m.path, x, y)
export const mapPathStart = (m: MapDef) => m.waypoints[0]
export const mapPathEnd = (m: MapDef) => m.waypoints[m.waypoints.length - 1]
