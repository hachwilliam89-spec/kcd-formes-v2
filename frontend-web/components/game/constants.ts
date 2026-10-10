// Constantes partagées entre la page (rendu serveur possible) et la scène Phaser
// (client uniquement). Isolées ici SANS import de Phaser : les importer depuis
// GameScene.ts forçait le chargement de Phaser côté serveur (SSR), où `navigator`
// n'existe pas → "navigator is not defined".
//
// Les règles de jeu (couloir, cases constructibles, coûts, portées, limite de
// murs) ne vivent plus ici : elles viennent du backend (store/catalogStore.ts).

export type Cell = { x: number; y: number }

// Rangée(s) du haut réservée(s) (non constructibles) : tampon d'affichage propre
// au web, pour que les tours de la première rangée jouable s'affichent en entier
// (elles débordent vers le haut).
export const TOP_RESERVED_ROWS = 1

const key = (x: number, y: number) => `${x},${y}`

/**
 * Index de lecture de la disposition d'une carte servie par le backend (voir
 * maps.ts, pathDataFromLayout) : ensembles pour des tests en O(1), chemins et
 * directions de déplacement. Aucune règle n'y est recalculée.
 */
export type PathData = {
  waypoints: Cell[]
  pathCells: Cell[]
  corridorSet: Set<string>
  corridorCells: Cell[]
  buildableSet: Set<string>   // bande constructible au bord des routes (hors couloir)
  pathDir: Map<string, { dx: number; dy: number }>
}

/** Une case est-elle sur le couloir (donc inconstructible pour une tour) ? */
export const corridorHas = (data: PathData, x: number, y: number) => data.corridorSet.has(key(x, y))

/** Une case est-elle constructible (bande au bord des routes) ? Sinon = décor. */
export const buildableHas = (data: PathData, x: number, y: number) => data.buildableSet.has(key(x, y))
