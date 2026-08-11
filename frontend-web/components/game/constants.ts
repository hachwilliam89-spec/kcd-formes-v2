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
  { x: 0, y: 2 },   // spawn (haut-gauche)
  { x: 17, y: 2 },  // voie haute -> droite
  { x: 17, y: 7 },  // descente
  { x: 2, y: 7 },   // voie médiane -> gauche
  { x: 2, y: 12 },  // descente
  { x: 19, y: 12 }, // château (bas-droite) — tracé remonté d'1 ligne : bande de pose en bas
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

// Direction de déplacement des ennemis (dx, dy) à chaque case du chemin, pour
// orienter le mur-barrage face au flux. Dérivée des différences entre cases
// consécutives du tracé.
const PATH_DIR: Map<string, { dx: number; dy: number }> = (() => {
  const m = new Map<string, { dx: number; dy: number }>()
  for (let i = 0; i < PATH_CELLS.length; i++) {
    const a = PATH_CELLS[i]
    const b = PATH_CELLS[Math.min(i + 1, PATH_CELLS.length - 1)]
    const dx = Math.sign(b.x - a.x)
    const dy = Math.sign(b.y - a.y)
    m.set(key(a.x, a.y), { dx, dy })
  }
  return m
})()

/**
 * Direction du chemin (sens des ennemis) à/près d'une case — pour orienter le
 * mur. Cherche la case de chemin la plus proche (le mur peut être posé sur une
 * case élargie hors du tracé central). Défaut : vers la droite.
 */
export const pathDirectionAt = (x: number, y: number): { dx: number; dy: number } => {
  const exact = PATH_DIR.get(key(x, y))
  if (exact) return exact
  let best: { dx: number; dy: number } = { dx: 1, dy: 0 }
  let bestD = Infinity
  for (const p of PATH_CELLS) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d < bestD) {
      bestD = d
      best = PATH_DIR.get(key(p.x, p.y)) ?? best
    }
  }
  return best
}
