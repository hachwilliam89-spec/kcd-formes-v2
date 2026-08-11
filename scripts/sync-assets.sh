#!/usr/bin/env bash
# Synchronise les assets gitignorés (sprites + musiques) vers le VPS ET relance
# la stack de prod — à lancer depuis ta machine de dev (où les assets existent)
# après avoir modifié/ajouté des sprites.
#
# Le déploiement git (deploy.yml) NE met PAS à jour les assets : ce script comble
# ce trou. Flux : pack-assets.sh → scp → unpack-assets.sh + rebuild Docker (SSH).
#
# Config par variables d'env (mêmes noms que les secrets CI) ou par arguments :
#   VPS_HOST (requis), VPS_USER (requis), VPS_PORT (défaut 22),
#   VPS_APP_DIR (défaut ~/kcd-formes-v2)
#
# Usages :
#   VPS_HOST=1.2.3.4 VPS_USER=deploy ./scripts/sync-assets.sh
#   ./scripts/sync-assets.sh deploy@1.2.3.4            # user@host en 1er argument
#   ./scripts/sync-assets.sh deploy@1.2.3.4 2222 ~/app # + port + dossier
set -euo pipefail
cd "$(dirname "$0")/.."

# 1) Cible : argument "user@host" prioritaire, sinon variables d'env.
if [ "${1:-}" != "" ]; then
  TARGET="$1"; VPS_USER="${TARGET%@*}"; VPS_HOST="${TARGET#*@}"
  VPS_PORT="${2:-${VPS_PORT:-22}}"
  VPS_APP_DIR="${3:-${VPS_APP_DIR:-~/kcd-formes-v2}}"
else
  VPS_HOST="${VPS_HOST:-}"; VPS_USER="${VPS_USER:-}"
  VPS_PORT="${VPS_PORT:-22}"; VPS_APP_DIR="${VPS_APP_DIR:-~/kcd-formes-v2}"
fi

if [ -z "${VPS_HOST}" ] || [ -z "${VPS_USER}" ]; then
  echo "Erreur : VPS_HOST et VPS_USER requis (env ou argument user@host)." >&2
  echo "Ex : ./scripts/sync-assets.sh deploy@mon-vps" >&2
  exit 1
fi

ARCHIVE="kcd-assets.tgz"
SSH="ssh -p ${VPS_PORT} ${VPS_USER}@${VPS_HOST}"

echo "▶ 1/4 Empaquetage des assets…"
./scripts/pack-assets.sh "$ARCHIVE"

echo "▶ 2/4 Transfert vers ${VPS_USER}@${VPS_HOST}:${VPS_APP_DIR}/ …"
scp -P "${VPS_PORT}" "$ARCHIVE" "${VPS_USER}@${VPS_HOST}:${VPS_APP_DIR}/"

echo "▶ 3/4 Dépaquetage sur le VPS…"
$SSH "cd ${VPS_APP_DIR} && ./scripts/unpack-assets.sh ${ARCHIVE}"

echo "▶ 4/4 Rebuild + redémarrage de la stack de prod…"
$SSH "cd ${VPS_APP_DIR} && docker compose -f docker-compose.prod.yml --env-file .env up -d --build --remove-orphans && docker image prune -f"

echo "✅ Assets synchronisés et stack redéployée sur ${VPS_HOST}."
