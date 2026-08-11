// Constantes partagées entre la page (rendu serveur possible) et la scène Phaser
// (client uniquement). Isolées ici SANS import de Phaser : les importer depuis
// GameScene.ts forçait le chargement de Phaser côté serveur (SSR), où `navigator`
// n'existe pas → "navigator is not defined".

export type Cell = { x: number; y: number }

export const GRID_W = 20
export const GRID_H = 16

// Rangée(s) du haut réservée(s) (non constructibles) : tampon pour que les tours
// de la première rangée jouable s'affichent en entier (elles débordent vers le haut).
export const TOP_RESERVED_ROWS = 1

/**
 * Largeur (en cases) de la bande CONSTRUCTIBLE au bord des routes : on ne peut poser
 * une tour QUE sur une case à cette distance (Chebyshev) du couloir. Au-delà = zone
 * morte (décor). DOIT rester synchronisé avec le backend (PathfindingService.BUILD_BAND).
 */
export const BUILD_BAND = 1

/**
 * Marge (Chebyshev) autour de chaque entrée ennemie où l'on ne peut pas bâtir (on ne
 * construit pas à la porte de l'ennemi). Synchronisé avec le backend (SPAWN_NOBUILD).
 */
export const SPAWN_NOBUILD = 4

const key = (x: number, y: number) => `${x},${y}`

// Données de chemin dérivées d'une liste de waypoints (identiques à l'ancien calcul,
// mais paramétrées → réutilisables pour plusieurs maps, voir maps.ts).
export type PathData = {
  waypoints: Cell[]
  pathCells: Cell[]
  corridorSet: Set<string>
  corridorCells: Cell[]
  buildableSet: Set<string>   // bande constructible au bord des routes (hors couloir)
  pathDir: Map<string, { dx: number; dy: number }>
}

/**
 * Bande constructible = anneau de BUILD_BAND cases autour du couloir (hors couloir),
 * SAUF autour des entrées ennemies `starts` (voir SPAWN_NOBUILD).
 */
function computeBuildable(corridorSet: Set<string>, starts: Cell[], gridW: number, gridH: number): Set<string> {
  const nearStart = (x: number, y: number) =>
    starts.some((s) => Math.max(Math.abs(x - s.x), Math.abs(y - s.y)) <= SPAWN_NOBUILD)
  const buildable = new Set<string>()
  for (const k of corridorSet) {
    const [cx, cy] = k.split(',').map(Number)
    for (let dx = -BUILD_BAND; dx <= BUILD_BAND; dx++) {
      for (let dy = -BUILD_BAND; dy <= BUILD_BAND; dy++) {
        const nx = cx + dx
        const ny = cy + dy
        const nk = key(nx, ny)
        if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH && !corridorSet.has(nk) && !nearStart(nx, ny)) {
          buildable.add(nk)
        }
      }
    }
  }
  return buildable
}

/**
 * Construit les données de chemin d'une map à partir de ses waypoints (alignés
 * deux à deux). Doit rester IDENTIQUE au tracé backend, sinon le décor ne collerait
 * pas au déplacement réel des ennemis (calculé côté serveur).
 */
export function buildPathData(waypoints: Cell[], gridW = GRID_W, gridH = GRID_H): PathData {
  // Cases exactes du chemin (segments droits entre waypoints consécutifs).
  const pathCells: Cell[] = []
  const push = (x: number, y: number) => {
    const last = pathCells[pathCells.length - 1]
    if (!last || last.x !== x || last.y !== y) pathCells.push({ x, y })
  }
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    if (a.x === b.x) {
      const step = b.y > a.y ? 1 : -1
      for (let y = a.y; y !== b.y + step; y += step) push(a.x, y)
    } else {
      const step = b.x > a.x ? 1 : -1
      for (let x = a.x; x !== b.x + step; x += step) push(x, a.y)
    }
  }

  // Couloir inconstructible = chemin élargi d'une case (Chebyshev <= 1), comme
  // corridorCells côté backend : c'est aussi la bande "route" rendue à l'écran.
  const corridorSet = new Set<string>()
  for (const p of pathCells) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = p.x + dx
        const ny = p.y + dy
        if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) corridorSet.add(key(nx, ny))
      }
    }
  }
  const corridorCells: Cell[] = Array.from(corridorSet).map((k) => {
    const [x, y] = k.split(',').map(Number)
    return { x, y }
  })

  // Direction de déplacement des ennemis à chaque case du chemin (oriente le mur).
  const pathDir = new Map<string, { dx: number; dy: number }>()
  for (let i = 0; i < pathCells.length; i++) {
    const a = pathCells[i]
    const b = pathCells[Math.min(i + 1, pathCells.length - 1)]
    pathDir.set(key(a.x, a.y), { dx: Math.sign(b.x - a.x), dy: Math.sign(b.y - a.y) })
  }

  const buildableSet = computeBuildable(corridorSet, [waypoints[0]], gridW, gridH)
  return { waypoints, pathCells, corridorSet, corridorCells, buildableSet, pathDir }
}

/**
 * Données de chemin d'une carte à PLUSIEURS voies (toutes terminant sur le château).
 * Le couloir est l'union des voies, élargie de `halfWidth` (Chebyshev) : halfWidth 0
 * = voies fines d'1 case (plus de terrain constructible entre les voies). Doit rester
 * synchronisé avec le backend (MapCatalog + PathfindingService.corridorCells).
 */
export function buildLanesData(lanes: Cell[][], halfWidth = 1, wideSpots: Cell[] = [], gridW = GRID_W, gridH = GRID_H): PathData {
  const lanePaths = lanes.map((wp) => buildPathData(wp, gridW, gridH))

  // Union des cases de chemin de toutes les voies.
  const pathCells: Cell[] = []
  const seen = new Set<string>()
  for (const lp of lanePaths) {
    for (const c of lp.pathCells) {
      const k = key(c.x, c.y)
      if (!seen.has(k)) { seen.add(k); pathCells.push(c) }
    }
  }

  // Couloir = union élargie de halfWidth.
  const corridorSet = new Set<string>()
  for (const p of pathCells) {
    for (let dx = -halfWidth; dx <= halfWidth; dx++) {
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        const nx = p.x + dx
        const ny = p.y + dy
        if (nx >= 0 && nx < gridW && ny >= 0 && ny < gridH) corridorSet.add(key(nx, ny))
      }
    }
  }
  // Aires d'élargissement local (aires de croisement) : cases de route en plus des
  // voies (voir backend GameMap.wideSpots) — synchronisé avec le catalogue.
  for (const w of wideSpots) {
    if (w.x >= 0 && w.x < gridW && w.y >= 0 && w.y < gridH) corridorSet.add(key(w.x, w.y))
  }
  const corridorCells: Cell[] = Array.from(corridorSet).map((k) => {
    const [x, y] = k.split(',').map(Number)
    return { x, y }
  })

  // Direction : la première voie qui définit une case gagne (les cellules partagées
  // près du château ont une direction cohérente vers l'arrivée).
  const pathDir = new Map<string, { dx: number; dy: number }>()
  for (const lp of lanePaths) {
    for (const [k, v] of lp.pathDir) {
      if (!pathDir.has(k)) pathDir.set(k, v)
    }
  }

  const buildableSet = computeBuildable(corridorSet, lanes.map((l) => l[0]), gridW, gridH)
  return { waypoints: lanes[0], pathCells, corridorSet, corridorCells, buildableSet, pathDir }
}

/** Une case est-elle sur le couloir (donc inconstructible pour une tour) ? */
export const corridorHas = (data: PathData, x: number, y: number) => data.corridorSet.has(key(x, y))

/** Une case est-elle constructible (bande au bord des routes) ? Sinon = décor. */
export const buildableHas = (data: PathData, x: number, y: number) => data.buildableSet.has(key(x, y))

/** Direction du chemin (sens des ennemis) à/près d'une case — pour orienter le mur. */
export function pathDirectionAtIn(data: PathData, x: number, y: number): { dx: number; dy: number } {
  const exact = data.pathDir.get(key(x, y))
  if (exact) return exact
  let best: { dx: number; dy: number } = { dx: 1, dy: 0 }
  let bestD = Infinity
  for (const p of data.pathCells) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d < bestD) { bestD = d; best = data.pathDir.get(key(p.x, p.y)) ?? best }
  }
  return best
}

// ── Map par défaut (désert) — rétrocompat : ces exports globaux restent la map
// désert historique. Les autres maps passent par maps.ts (catalogue).
export const WAYPOINTS: Cell[] = [
  { x: 0, y: 3 },   // spawn (haut-gauche) — rangée 0 = tampon non constructible
  { x: 17, y: 3 },  // voie haute -> droite
  { x: 17, y: 8 },  // descente
  { x: 2, y: 8 },   // voie médiane -> gauche
  { x: 2, y: 13 },  // descente
  { x: 19, y: 13 }, // château (bas-droite)
]

const DEFAULT_PATH = buildPathData(WAYPOINTS)
export const PATH_START = WAYPOINTS[0]
export const PATH_END = WAYPOINTS[WAYPOINTS.length - 1]
export const PATH_CELLS = DEFAULT_PATH.pathCells
export const CORRIDOR_CELL_SET = DEFAULT_PATH.corridorSet
export const CORRIDOR_CELLS = DEFAULT_PATH.corridorCells
export const isCorridorCell = (x: number, y: number) => corridorHas(DEFAULT_PATH, x, y)
export const pathDirectionAt = (x: number, y: number) => pathDirectionAtIn(DEFAULT_PATH, x, y)
