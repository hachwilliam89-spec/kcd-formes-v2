#!/usr/bin/env bash
# Restaure les assets du jeu dans frontend-web/public/sprites/ à partir de
# l'archive produite par pack-assets.sh. À lancer sur la machine de build/déploiement
# AVANT `docker compose -f docker-compose.prod.yml build`.
#
# Usage : ./scripts/unpack-assets.sh [kcd-assets.tgz]
set -euo pipefail
cd "$(dirname "$0")/.."

ARCHIVE="${1:-kcd-assets.tgz}"

if [ ! -f "$ARCHIVE" ]; then
  echo "Erreur : archive $ARCHIVE introuvable." >&2
  echo "Génère-la avec ./scripts/pack-assets.sh puis transfère-la ici." >&2
  exit 1
fi

mkdir -p frontend-web/public
tar -xzf "$ARCHIVE" -C frontend-web/public
echo "OK → assets restaurés dans frontend-web/public/ (sprites/ + sounds/music_*.mp3)"
ls frontend-web/public/sprites
ls frontend-web/public/sounds/music_*.mp3 2>/dev/null || true
