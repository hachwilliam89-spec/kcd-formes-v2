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

tar -czf "$OUT" -C frontend-web/public sprites
echo "OK → $OUT ($(du -h "$OUT" | cut -f1))"
echo "Transfère-le sur le serveur puis lance scripts/unpack-assets.sh là-bas."
