// Constantes partagées entre la page (rendu serveur possible) et la scène Phaser
// (client uniquement). Isolées ici SANS import de Phaser : les importer depuis
// GameScene.ts forçait le chargement de Phaser côté serveur (SSR), où `navigator`
// n'existe pas → "navigator is not defined".

export type Cell = { x: number; y: number }

export const GRID_W = 20
export const GRID_H = 15

// CHEMIN SERPENTIN (voir GAME_DESIGN 2.6 + GameService.createGame côté backend,
// qui reste l'arbitre final). Waypoints alignés deux à deux : le tracé réel est
// la concaténation des segments droits qui les relient. Doit rester IDENTIQUE
// aux waypoints du backend, sinon le décor ne collerait pas au déplacement réel
// des ennemis (calculé côté serveur).
export const WAYPOINTS: Cell[] = [
  { x: 0, y: 3 },   // spawn (haut-gauche)
  { x: 17, y: 3 },  // voie haute -> droite
  { x: 17, y: 8 },  // descente
  { x: 2, y: 8 },   // voie médiane -> gauche
  { x: 2, y: 13 },  // descente
  { x: 19, y: 13 }, // château (bas-droite)
]

export const PATH_START = WAYPOINTS[0]
export const PATH_END = WAYPOINTS[WAYPOINTS.length - 1]

const key = (x: number, y: number) => `${x},${y}`

// Cases exactes du chemin (segments droits entre waypoints consécutifs).
export const PATH_CELLS: Cell[] = (() => {
  const cells: Cell[] = []
  const push = (x: number, y: number) => {
    const last = cells[cells.length - 1]
    if (!last || last.x !== x || last.y !== y) cells.push({ x, y })
  }
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    const a = WAYPOINTS[i]
    const b = WAYPOINTS[i + 1]
    if (a.x === b.x) {
      const step = b.y > a.y ? 1 : -1
      for (let y = a.y; y !== b.y + step; y += step) push(a.x, y)
    } else {
      const step = b.x > a.x ? 1 : -1
      for (let x = a.x; x !== b.x + step; x += step) push(x, a.y)
    }
  }
  return cells
})()

// Couloir inconstructible = chemin élargi d'une case (distance de Chebyshev <= 1),
// exactement comme corridorCells côté backend : c'est aussi la bande de "route"
// (terre) rendue à l'écran, correspondant à la bande de déplacement réelle des
// ennemis (laneOffset ±0.8).
export const CORRIDOR_CELL_SET: Set<string> = (() => {
  const set = new Set<string>()
  for (const p of PATH_CELLS) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = p.x + dx
        const ny = p.y + dy
        if (nx >= 0 && nx < GRID_W && ny >= 0 && ny < GRID_H) set.add(key(nx, ny))
      }
    }
  }
  return set
})()

export const CORRIDOR_CELLS: Cell[] = Array.from(CORRIDOR_CELL_SET).map((k) => {
  const [x, y] = k.split(',').map(Number)
  return { x, y }
})

/** Une case est-elle sur le couloir (donc inconstructible pour une tour) ? */
export const isCorridorCell = (x: number, y: number) => CORRIDOR_CELL_SET.has(key(x, y))
