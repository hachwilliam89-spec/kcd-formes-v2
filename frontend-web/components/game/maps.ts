// Catalogue des maps jouables (solo + multi). Grille fixe 20×16 : le TRACÉ (une ou
// plusieurs voies), le BIOME (image de terrain + décor) et la largeur de couloir
// changent d'une map à l'autre. Doit rester synchronisé avec le catalogue backend
// (MapCatalog) — mêmes id, mêmes voies, même halfWidth.
import { Cell, PathData, buildLanesData, corridorHas, pathDirectionAtIn } from './constants'

export type Biome = 'desert' | 'prairie' | 'snow'

export type MapDef = {
  id: string
  name: string
  biome: Biome
  image: string          // image de terrain (/sprites/terrain/…)
  lanes: Cell[][]        // une voie = liste de waypoints ; plusieurs voies convergent sur le château
  waypoints: Cell[]      // = lanes[0], pour compat (départ/arrivée de référence)
  halfWidth: number      // demi-largeur du couloir (1 = large, 0 = voies fines)
  proceduralRoad: boolean // route dessinée au runtime (multi-voies) plutôt que peinte dans l'image
  path: PathData         // dérivé (couloir union, cases de chemin, directions)
}

/** Carte mono-voie classique (couloir large, route peinte dans l'image). */
function def(id: string, name: string, biome: Biome, image: string, waypoints: Cell[]): MapDef {
  return {
    id, name, biome, image,
    lanes: [waypoints], waypoints, halfWidth: 1, proceduralRoad: false,
    path: buildLanesData([waypoints], 1),
  }
}

/** Carte multi-voies (voies fines, route dessinée au runtime). */
function defLanes(id: string, name: string, biome: Biome, image: string, lanes: Cell[][], halfWidth = 0): MapDef {
  return {
    id, name, biome, image,
    lanes, waypoints: lanes[0], halfWidth, proceduralRoad: true,
    path: buildLanesData(lanes, halfWidth),
  }
}

// ⚠️ Waypoints alignés deux à deux (chaque paire partage x ou y), y ≥ 1 (rangée 0
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
  // L'Y : deux entrées (haut-gauche / bas-gauche) qui fusionnent en (8,8) puis une
  // approche finale commune vers le château (19,8). Voies fines (halfWidth 0).
  defLanes('ygrec', "L'Y", 'desert', '/sprites/terrain/ygrec_map.png', [
    [{ x: 0, y: 3 }, { x: 8, y: 3 }, { x: 8, y: 8 }, { x: 19, y: 8 }],
    [{ x: 0, y: 13 }, { x: 8, y: 13 }, { x: 8, y: 8 }, { x: 19, y: 8 }],
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
/** Départs de chaque voie (entrées ennemies) — une carte mono-voie en a une seule. */
export const mapLaneStarts = (m: MapDef): Cell[] => m.lanes.map((lane) => lane[0])
/** Arrivée commune (château) — dernière case de n'importe quelle voie. */
export const mapCastle = (m: MapDef): Cell => m.lanes[0][m.lanes[0].length - 1]
