// Cartes jouables : la DISPOSITION (voies, couloir, cases constructibles, eau,
// château) vient du backend (GET /api/v1/maps/{id}, voir store/catalogStore.ts) ;
// ce fichier ne garde que la PRÉSENTATION propre au web (nom affiché, biome,
// image de terrain) et assemble les deux en MapDef pour le rendu et les aperçus.
import type { Cell, PathData } from './constants'
import type { MapLayout } from '@/store/catalogStore'

export type Biome = 'desert' | 'prairie' | 'snow' | 'spring' | 'autumn'

/** Présentation d'une carte côté web (rien de ce qui touche aux règles). */
type MapPresentation = {
  name: string
  biome: Biome
  image: string          // image de terrain (/sprites/terrain/…), vide = terrain peint au runtime
  proceduralRoad: boolean // route dessinée au runtime plutôt que peinte dans l'image
}

const PRESENTATION: Record<string, MapPresentation> = {
  desert: { name: 'Terres désolées', biome: 'desert', image: '/sprites/terrain/desert_map.png', proceduralRoad: false },
  fourche: { name: 'La Fourche', biome: 'snow', image: '/sprites/terrain/fourche_map.png', proceduralRoad: false },
  spring: { name: 'Les Jardins éveillés', biome: 'spring', image: '', proceduralRoad: false },
  autumn: { name: 'Le Val des feuilles', biome: 'autumn', image: '', proceduralRoad: false },
}

/** Carte inconnue du web (ajoutée côté serveur) : jouable, terrain peint au runtime. */
const fallbackPresentation = (id: string): MapPresentation =>
  ({ name: id, biome: 'prairie', image: '', proceduralRoad: true })

export type MapDef = MapPresentation & {
  id: string
  width: number
  height: number
  lanes: Cell[][]        // points de passage de chaque voie (serveur)
  waypoints: Cell[]      // = lanes[0], départ/arrivée de référence
  halfWidth: number      // demi-largeur du couloir (serveur) : largeur de route dessinée
  wideSpots: Cell[]      // aires d'élargissement de la route (serveur)
  water: Cell[]          // eau infranchissable et inconstructible (serveur)
  /** Emprise du lac (eau, ponts, île) : rectangle englobant l'eau ; null sans lac. */
  lake: { x0: number; y0: number; x1: number; y1: number } | null
  bankCells: Cell[]      // berges inondables (printemps, serveur)
  castle: Cell           // château du joueur, arrivée commune des voies (serveur)
  spawns: Cell[]         // entrées ennemies (serveur)
  path: PathData         // index de la disposition (couloir, constructible, directions)
}

const key = (x: number, y: number) => `${x},${y}`

/**
 * Index de lecture de la disposition renvoyée par le serveur : aucun calcul de
 * règle, seulement des ensembles pour des tests en O(1) et la direction de
 * déplacement le long des chemins fournis (orientation du mur).
 */
function pathDataFromLayout(layout: MapLayout): PathData {
  // Union des chemins des voies, dans l'ordre des voies.
  const pathCells: Cell[] = []
  const seen = new Set<string>()
  for (const lane of layout.lanePaths) {
    for (const c of lane) {
      const k = key(c.x, c.y)
      if (!seen.has(k)) { seen.add(k); pathCells.push(c) }
    }
  }
  // Direction des ennemis à chaque case de chemin : vers la case suivante de sa
  // voie ; la première voie qui passe par une case gagne.
  const pathDir = new Map<string, { dx: number; dy: number }>()
  for (const lane of layout.lanePaths) {
    for (let i = 0; i < lane.length; i++) {
      const a = lane[i]
      const b = lane[Math.min(i + 1, lane.length - 1)]
      const k = key(a.x, a.y)
      if (!pathDir.has(k)) pathDir.set(k, { dx: Math.sign(b.x - a.x), dy: Math.sign(b.y - a.y) })
    }
  }
  // Cases de couloir (appartenance : serveur) rangées dans l'ordre de parcours des
  // voies, puis des aires élargies : le décor semé sur la route (tirage aléatoire
  // déterministe, case par case) reste exactement le même d'une version à l'autre.
  const corridorSet = new Set(layout.corridorCells.map((c) => key(c.x, c.y)))
  const corridorCells: Cell[] = []
  const placed = new Set<string>()
  const take = (x: number, y: number) => {
    const k = key(x, y)
    if (corridorSet.has(k) && !placed.has(k)) { placed.add(k); corridorCells.push({ x, y }) }
  }
  const w = layout.corridorHalfWidth
  for (const p of pathCells) {
    for (let dx = -w; dx <= w; dx++) for (let dy = -w; dy <= w; dy++) take(p.x + dx, p.y + dy)
  }
  for (const c of layout.wideSpots) take(c.x, c.y)
  for (const c of layout.corridorCells) take(c.x, c.y)
  return {
    waypoints: layout.lanes[0] ?? [],
    pathCells,
    corridorSet,
    corridorCells,
    buildableSet: new Set(layout.buildableCells.map((c) => key(c.x, c.y))),
    pathDir,
  }
}

/** Rectangle englobant des cases (null si aucune). */
function boundsOf(cells: Cell[]): MapDef['lake'] {
  if (cells.length === 0) return null
  const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y)
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

/** Assemble disposition serveur + présentation web (appelé une fois au chargement du catalogue). */
export function buildMapDef(layout: MapLayout): MapDef {
  const lanes = layout.lanes.length > 0 ? layout.lanes : [[layout.castle]]
  return {
    ...(PRESENTATION[layout.id] ?? fallbackPresentation(layout.id)),
    id: layout.id,
    width: layout.width,
    height: layout.height,
    lanes,
    waypoints: lanes[0],
    halfWidth: layout.corridorHalfWidth,
    wideSpots: layout.wideSpots,
    water: layout.waterCells,
    lake: boundsOf(layout.waterCells),
    bankCells: layout.bankCells ?? [],
    castle: layout.castle,
    spawns: layout.spawns,
    path: pathDataFromLayout(layout),
  }
}

// Helpers par map : simples lectures de la disposition serveur.
export const mapIsCorridor = (m: MapDef, x: number, y: number) => m.path.corridorSet.has(key(x, y))
/** Constructible = bande au bord des routes. Hors couloir ET hors bande = décor. */
export const mapIsBuildable = (m: MapDef, x: number, y: number) => m.path.buildableSet.has(key(x, y))
/** Direction du chemin (sens des ennemis) à/près d'une case — pour orienter le mur. */
export function mapPathDir(m: MapDef, x: number, y: number): { dx: number; dy: number } {
  const exact = m.path.pathDir.get(key(x, y))
  if (exact) return exact
  let best: { dx: number; dy: number } = { dx: 1, dy: 0 }
  let bestD = Infinity
  for (const p of m.path.pathCells) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d < bestD) { bestD = d; best = m.path.pathDir.get(key(p.x, p.y)) ?? best }
  }
  return best
}
export const mapPathStart = (m: MapDef) => m.waypoints[0]
export const mapPathEnd = (m: MapDef) => m.castle
/** Départs de chaque voie (entrées ennemies) — une carte mono-voie en a une seule. */
export const mapLaneStarts = (m: MapDef): Cell[] => m.lanes.map((lane) => lane[0])
/** Arrivée commune (château). */
export const mapCastle = (m: MapDef): Cell => m.castle
