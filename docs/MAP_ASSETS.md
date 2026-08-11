# Assets à trouver pour la refonte des maps (KCD Formes v2)

Objectif : passer d'un couloir à de vraies maps immersives, avec des variantes
(biomes) et à terme un choix de map en solo/multi.

## Contraintes techniques (pour que ça s'intègre sans douleur)

- **Style** : pixel-art top-down (vue de dessus légèrement 2.5D), médiéval/fantasy,
  cohérent avec les tours/ennemis actuels (pixel-art coloré).
- **Taille de tuile** : idéalement **32×32** ou **64×64** px (la grille est en 40 px
  à l'écran mais tout est mis à l'échelle — 32 ou 64 se redimensionnent proprement).
  Rester sur UNE taille de tuile pour tout le pack.
- **Format** : PNG avec transparence. Soit des fichiers individuels par tuile, soit
  un spritesheet avec une taille de tuile régulière (idéalement + un JSON/atlas).
- **Licence** : CC0 ou licence commerciale permissive (portfolio public) — vérifier
  la redistribution.
- **Palette cohérente** entre terrain, décor et props (éviter le mélange de styles).

## Ce dont j'ai besoin, par catégorie

### 1. Terrain de base (indispensable)
- Herbe (2–3 variantes pour casser la répétition).
- Terre / chemin de terre.
- **Transitions herbe ↔ terre** : bords + coins (idéalement un set "autotile"
  47-blob, ou au minimum 4 coins + 4 bords) — c'est ce qui fait un chemin propre.

### 2. Chemin / route (indispensable)
- Tuiles de chemin : droit (H/V), coins, intersections en T, extrémités.
- (Tu as déjà `road_c1-4`, `road_h`, `road_v` — un vrai set autotile ferait mieux.)

### 3. Décor naturel (le "wow")
- Arbres (2–3 types, quelques tailles) — avec ombre si possible.
- Buissons, arbustes, souches, troncs couchés.
- Herbes hautes, fleurs, champignons.
- Rochers / blocs de pierre (plusieurs tailles).

### 4. Props / structures (ambiance)
- Barrières / clôtures, palissades.
- Torches (**animées** = top pour l'ambiance), lanternes.
- Bannières / drapeaux, tentes, tonneaux, caisses, charrettes.
- Ruines, ponts, pavés — utile pour habiller le chemin.

### 5. Eau (optionnel mais fort)
- Tuiles d'eau + bords/rives (coins) — animée si possible.
- Nénuphars, roseaux.

### 6. Cadre / bordure de map
- Falaises ou eau pour encadrer le champ (que la map ne "flotte" pas dans le vide).

### 7. Ambiance / FX (optionnel)
- Overlay de brume/brouillard, rayons de lumière.
- Particules (poussière, feuilles, lucioles).

### 8. Variantes de biomes (pour les maps multiples, plus tard)
Un même pack couvrant plusieurs thèmes est idéal : **plaine/forêt** (défaut),
**neige**, **désert**, **volcan/lave**, **marais**. Sinon un pack par biome, du
même auteur pour garder la cohérence.

## Où chercher

- **Kenney.nl** (CC0, très propre, "Tiny Town", "Tower Defense", "RPG Urban/Nature").
- **itch.io** (rechercher "top down tileset", "tower defense tileset", "RPG tileset",
  "pixel art nature" — beaucoup de packs gratuits/pas chers).
- **CraftPix** (tu en utilises déjà — ils ont des tilesets TD/RPG top-down).
- **OpenGameArt.org** (CC0/CC-BY).

## Ce que je fais une fois le pack récupéré

1. Découpe/organisation des tuiles dans `public/sprites/terrain` (+ `props`, `decor`).
2. **Autotiling du chemin** (bords/coins nets) au lieu de la route géométrique.
3. Placement du décor sur les bords / cases non constructibles (déterministe).
4. Éléments animés (torches, eau) + ambiance (brume).
5. Système de **maps data-driven** (voir ci-dessous).

## Direction pour les maps multiples / éditeur (phase suivante)

- **Maps décrites en données** : un catalogue de maps (JSON) = { taille grille,
  waypoints du chemin, biome/tileset, placements de décor, points de spawn/château }.
  Le backend gère déjà des waypoints par partie → on ajoute un catalogue de maps.
- **Choix de map** : sélecteur dans l'écran solo et dans le lobby multi (avec
  aperçu façon mini-map), variantes = chemins + biomes différents.
- **Éditeur** (plus tard) : poser le chemin + le décor à la souris, export JSON —
  réutilise le même moteur de rendu.

Commencer par 1 tileset "plaine/forêt" complet suffit pour tout valider ; on
décline ensuite les biomes.
