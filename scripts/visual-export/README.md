# Export visuel — du jeu web vers le client Godot

Le client Godot (`client-godot/`) affiche le décor **exactement** comme le jeu web,
sans recopier son code de dessin : cet outil charge la **vraie** `GameScene`
(Phaser) dans Chrome, sans tours ni vague, et relève ce qu'elle a construit :

- `ground.png` : tout ce qui est sous les unités (profondeur < 0,5) — terrain, route,
  emplacements constructibles, décor posé au sol ;
- `decor.json` + `textures/` : les éléments posés parmi les unités (château,
  portails animés, arbres, plantes…) avec leur position, ancrage, taille, teinte,
  profondeur et animation. Godot les trie avec les tours et les ennemis selon la
  même règle que le web (profondeur = 1 + pied / 100).

La météo (profondeur ≥ 50) n'est pas exportée.

Sortie : `client-godot/assets/baked/<carte>/` (ignoré par git : dérivé d'assets sous licence).

## Utilisation

Normalement via `./scripts/sync-godot-assets.sh`. À la main :

```bash
cd scripts/visual-export
npm install                           # une fois (esbuild, playwright-core)
npm run export                        # les 4 cartes
npm run export -- --maps spring       # une carte
npm run export -- --reference --out /tmp/ref   # captures du web pendant une vague
                                               # déterministe + ses ticks (comparaison)
```

Prérequis : `frontend-web/node_modules` installé, assets présents
(`frontend-web/public/sprites`), Google Chrome (ou `BENCH_CHROME=/chemin/vers/chrome`).
Sans GPU (CI) : `--software`.
