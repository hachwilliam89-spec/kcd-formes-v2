// Catalogue des maps jouables (solo + multi). Grille fixe 20×16 : le TRACÉ (une ou
// plusieurs voies), le BIOME (image de terrain + décor) et la largeur de couloir
// changent d'une map à l'autre. Doit rester synchronisé avec le catalogue backend
// (MapCatalog) — mêmes id, mêmes voies, même halfWidth.
import { Cell, PathData, buildLanesData, corridorHas, buildableHas, pathDirectionAtIn } from './constants'

export type Biome = 'desert' | 'prairie' | 'snow'

export type MapDef = {
  id: string
  name: string
  biome: Biome
  image: string          // image de terrain (/sprites/terrain/…)
  lanes: Cell[][]        // une voie = liste de waypoints ; plusieurs voies convergent sur le château
  waypoints: Cell[]      // = lanes[0], pour compat (départ/arrivée de référence)
  halfWidth: number      // demi-largeur du couloir (1 = large, 0 = voies fines)
  wideSpots: Cell[]      // aires d'élargissement local du couloir (aires de croisement)
  proceduralRoad: boolean // route dessinée au runtime (multi-voies) plutôt que peinte dans l'image
  path: PathData         // dérivé (couloir union, cases de chemin, directions)
}

/** Carte mono-voie classique (couloir large, route peinte dans l'image). */
function def(id: string, name: string, biome: Biome, image: string, waypoints: Cell[]): MapDef {
  return {
    id, name, biome, image,
    lanes: [waypoints], waypoints, halfWidth: 1, wideSpots: [], proceduralRoad: false,
    path: buildLanesData([waypoints], 1),
  }
}

/** Carte multi-voies (voies fines). La route est bakée dans l'image (comme le désert),
 *  donc proceduralRoad = false. wideSpots = aires larges. */
function defLanes(id: string, name: string, biome: Biome, image: string, lanes: Cell[][], wideSpots: Cell[] = [], halfWidth = 0): MapDef {
  return {
    id, name, biome, image,
    lanes, waypoints: lanes[0], halfWidth, wideSpots, proceduralRoad: false,
    path: buildLanesData(lanes, halfWidth, wideSpots),
  }
}

// ⚠️ Waypoints alignés deux à deux (chaque paire partage x ou y), y ≥ 1 (rangée 0
// = tampon). Doivent être IDENTIQUES côté backend (MapCatalog).
export const GAME_MAPS: MapDef[] = [
  def('desert', 'Terres désolées', 'desert', '/sprites/terrain/desert_map.png', [
    { x: 0, y: 3 }, { x: 17, y: 3 }, { x: 17, y: 8 }, { x: 2, y: 8 }, { x: 2, y: 13 }, { x: 19, y: 13 },
  ]),
  // La Fourche : UNE entrée (0,8), la route se divise en (3,8) en trois branches qui
  // rejoignent le château COLLÉ AU BORD DROIT (19,8) par des angles différents —
  // nord (bord droit descendant), ouest (direct), sud (bord droit montant).
  defLanes('fourche', 'La Fourche', 'snow', '/sprites/terrain/fourche_map.png', [
    [{ x: 0, y: 8 }, { x: 3, y: 8 }, { x: 3, y: 2 }, { x: 19, y: 2 }, { x: 19, y: 8 }],
    [{ x: 0, y: 8 }, { x: 19, y: 8 }],
    [{ x: 0, y: 8 }, { x: 3, y: 8 }, { x: 3, y: 14 }, { x: 19, y: 14 }, { x: 19, y: 8 }],
  ], [
    // Aires de croisement (route élargie vers les bords haut/bas) — IDENTIQUE au backend.
    { x: 9, y: 1 }, { x: 10, y: 1 }, { x: 11, y: 1 }, { x: 12, y: 1 },
    { x: 9, y: 15 }, { x: 10, y: 15 }, { x: 11, y: 15 }, { x: 12, y: 15 },
  ]),
]

export const DEFAULT_MAP_ID = 'desert'

export function getMapDef(id?: string | null): MapDef {
  return GAME_MAPS.find((m) => m.id === id) ?? GAME_MAPS[0]
}

// Helpers par map (équivalents des globaux de constants.ts mais pour une map donnée).
export const mapIsCorridor = (m: MapDef, x: number, y: number) => corridorHas(m.path, x, y)
/** Constructible = bande au bord des routes. Hors couloir ET hors bande = décor. */
export const mapIsBuildable = (m: MapDef, x: number, y: number) => buildableHas(m.path, x, y)
export const mapPathDir = (m: MapDef, x: number, y: number) => pathDirectionAtIn(m.path, x, y)
export const mapPathStart = (m: MapDef) => m.waypoints[0]
export const mapPathEnd = (m: MapDef) => m.waypoints[m.waypoints.length - 1]
/** Départs de chaque voie (entrées ennemies) — une carte mono-voie en a une seule. */
export const mapLaneStarts = (m: MapDef): Cell[] => m.lanes.map((lane) => lane[0])
/** Arrivée commune (château) — dernière case de n'importe quelle voie. */
export const mapCastle = (m: MapDef): Cell => m.lanes[0][m.lanes[0].length - 1]
