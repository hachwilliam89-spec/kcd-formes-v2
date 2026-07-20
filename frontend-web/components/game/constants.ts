// Constantes partagées entre la page (rendu serveur possible) et la scène Phaser
// (client uniquement). Isolées ici SANS import de Phaser : les importer depuis
// GameScene.ts forçait le chargement de Phaser côté serveur (SSR), où `navigator`
// n'existe pas → "navigator is not defined".

// COULOIR STRICT (voir GAME_DESIGN 2.6) : bande y=6..8 inconstructible pour les
// tours, obligatoire pour le mur. Le backend reste l'arbitre final ; ces bornes
// servent au filtrage immédiat côté client (voir page.tsx handleCellClick).
export const CORRIDOR_MIN_Y = 6
export const CORRIDOR_MAX_Y = 8
