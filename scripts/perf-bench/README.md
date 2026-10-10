# Banc de charge — GameScene

Mesure le coût CPU du rendu du jeu sur une **vague massive reproductible**, pour
vérifier qu'une modification de la scène ne dégrade pas les performances (ou
chiffrer un gain). Mesurer avant d'optimiser.

Le banc charge la **vraie** `GameScene` du front (aucune copie), pose des tours
sur la bande constructible et rejoue une vague synthétique (déplacements le long
du chemin, tirs selon la portée réelle des tours, morts, arrivées au château)
exactement comme le solo (`playWave`). Même graine → même vague, d'un run à l'autre.

## Installation

Prérequis : les dépendances du front installées (`frontend-web/node_modules`), les
assets présents (`frontend-web/public/sprites`, voir `scripts/unpack-assets.sh`),
Google Chrome installé et le backend lancé (`docker compose up -d`) : la disposition
des cartes et le catalogue des tours viennent de l'API (`--api <url>`, ou
`--catalog <fichier.json>` sans backend).

```bash
cd scripts/perf-bench
npm install
```

Le banc a ses propres dépendances (esbuild, playwright-core) : il ne touche ni au
`package-lock.json` du front, ni à la CI, ni au build de production.

## Utilisation

```bash
npm run bench                          # vague de 200 ennemis, 32 tours, carte désert
npm run bench -- --idle                # coût fixe d'une image, sans vague
npm run bench -- --map fourche         # carte enneigée
npm run bench -- --enemies 300 --profile   # + fonctions les plus coûteuses
npm run bench -- --headed              # fenêtre visible : vrai GPU, vraie vsync
```

| Option | Défaut | Effet |
|---|---|---|
| `--enemies N` | 200 | taille de la vague (≈ 130 à l'écran au pic pour 200) |
| `--towers N` | 32 | tours posées (types et niveaux variés) |
| `--map` | `desert` | `desert`, `fourche`, `spring` ou `autumn` |
| `--seed N` | 1 | graine de la vague |
| `--idle` | — | mesure 8 s sans vague (calques fixes, météo) |
| `--profile` | — | profil CPU pendant la mesure : top 15 des fonctions |
| `--headed` | — | Chrome visible plutôt que sans affichage |
| `--software` | — | rendu logiciel SwiftShader (machine sans GPU, CI) |
| `--json` | — | sortie brute |

Chrome est lancé via le canal `chrome` de Playwright ; pour un autre navigateur
Chromium : `BENCH_CHROME=/chemin/vers/chrome npm run bench`.

## Lire le résultat

```
CPU par image : moyenne 1,54 ms · médiane 1,2 · p95 3,8 · p99 6,6 · max 10,8
Images > 8 ms : 2 · > 16,7 ms (60 fps perdu) : 0
Compilations de shaders pendant la mesure : 0
```

- **CPU par image** : temps de `game.step` (mise à jour + soumission du rendu) sur
  le fil principal. Au-delà de ~16,7 ms, l'image rate le 60 fps.
- **p95 / p99 / max** : les à-coups comptent plus que la moyenne.
- **Compilations de shaders** : doit rester à 0 — chacune bloque le rendu
  (voir `GameScene.prewarmShaders`).
- **Comparer sur la même machine et le même mode** (avant / après une
  modification) : les valeurs absolues dépendent fortement du GPU et du mode
  (sans affichage, logiciel…).

## Repères (rendu logiciel, octobre 2026)

| Mesure | Avant optimisations | Après |
|---|---|---|
| Image sans vague | 7,7 ms | 0,6 ms |
| Vague de 200 ennemis, moyenne | 8,9 ms | 1,7 ms |
| Vague de 200 ennemis, max | 260 ms | 14 ms |

Causes trouvées avec ce banc : calques `Graphics` statiques re-tessellés à chaque
image (quadrillage des parcelles : ~78 % d'une image) et compilations de shaders
en pleine vague.

## Aperçu manuel des saisons

```bash
node scripts/perf-bench/run.mjs --serve --seasonal --map spring
```

À lancer depuis la racine : ouvrir l’URL affichée, choisir une carte et les boutons
repos / annonce / crue / feu / cendres / fin de vague. Aucun navigateur n’est lancé
par `--serve`. Les états sont synthétiques : ils vérifient le rendu de la vraie scène,
pas les règles métier (couvertes par `SeasonalTerrainTest`). La mesure de 8 secondes
porte uniquement sur le rendu de l’état affiché ; ce n’est pas une mesure de combat chargé.

`--serve` sans `--seasonal` sert le banc habituel, pour un pilotage manuel.
