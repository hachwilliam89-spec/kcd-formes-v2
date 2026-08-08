#!/usr/bin/env bash
# Empaquette les assets du jeu (gitignorés, licence CraftPix) dans une archive
# à transférer PRIVÉMENT vers la machine de build/déploiement (scp, stockage
# privé…). Les assets ne transitent jamais par git.
#
# Usage : ./scripts/pack-assets.sh            (crée kcd-assets.tgz)
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="frontend-web/public/sprites"
OUT="${1:-kcd-assets.tgz}"

if [ ! -d "$SRC" ]; then
  echo "Erreur : $SRC introuvable (assets manquants ?)." >&2
  exit 1
fi

# Sprites (licence CraftPix) + musiques de fond sous licence (music_*.mp3).
# Les bruitages SFX maison sont dans git, pas besoin de les empaqueter.
PATHS=(sprites)
for m in frontend-web/public/sounds/music_*.mp3; do
  [ -e "$m" ] && PATHS+=("sounds/$(basename "$m")")
done

tar -czf "$OUT" -C frontend-web/public "${PATHS[@]}"
echo "OK → $OUT ($(du -h "$OUT" | cut -f1))"
echo "Contenu : ${PATHS[*]}"
echo "Transfère-le sur le serveur puis lance scripts/unpack-assets.sh là-bas."
