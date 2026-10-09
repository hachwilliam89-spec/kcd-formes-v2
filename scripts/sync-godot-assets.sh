#!/usr/bin/env bash
# Prépare les visuels du client Godot à partir du jeu web (source unique).
#
# 1. Copie les sprites sous licence utilisés par le combat (frontend-web/public/sprites,
#    alimenté par le bundle kcd-assets.tgz) dans client-godot/assets/sprites/.
# 2. Exporte, depuis le VRAI GameScene web, le sol et le décor de chaque carte
#    (scripts/visual-export) dans client-godot/assets/baked/, plus la vague du banc
#    de charge (même générateur que scripts/perf-bench) pour l'écran « Banc de perf ».
# Tout est dans client-godot/assets/, ignoré par git — comme côté web, ces fichiers
# ne sont jamais versionnés. Sans eux, le client tourne avec des formes colorées.
#
# Prérequis (une fois) : cd frontend-web && npm ci ; cd scripts/visual-export && npm install ;
# Google Chrome installé (ou BENCH_CHROME=/chemin/vers/chrome).
# Usage : ./scripts/sync-godot-assets.sh   puis   godot --headless --path client-godot --import
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="frontend-web/public/sprites"
DST="client-godot/assets/sprites"

if [ ! -d "$SRC" ]; then
  echo "Assets introuvables dans $SRC : lance d'abord ./scripts/unpack-assets.sh (bundle kcd-assets.tgz)." >&2
  exit 1
fi

rm -rf "$DST"
mkdir -p "$DST/enemies" "$DST/towers" "$DST/effects" "$DST/projectiles"
cp "$SRC"/enemies/*.png "$DST/enemies/"
for t in ARCHER BALLISTA CATAPULT; do
  cp "$SRC/towers/${t}_base.png" "$SRC/towers/${t}_weapon.png" "$DST/towers/"
done
cp "$SRC/towers/MAGE_sheet.png" "$SRC/towers/WALL.png" "$DST/towers/"
cp "$SRC"/effects/*.png "$DST/effects/"
cp "$SRC"/projectiles/*.png "$DST/projectiles/"
echo "Sprites copiés dans $DST ($(find "$DST" -name '*.png' | wc -l | tr -d ' ') fichiers)."

if [ ! -d scripts/visual-export/node_modules ] || [ ! -d frontend-web/node_modules ]; then
  echo "Export du décor ignoré : lance d'abord 'cd frontend-web && npm ci' et 'cd scripts/visual-export && npm install'." >&2
  exit 0
fi
rm -rf client-godot/assets/baked
(cd scripts/visual-export && node export.mjs && node export.mjs --bench --maps desert)
echo "Étape suivante : godot --headless --path client-godot --import"
