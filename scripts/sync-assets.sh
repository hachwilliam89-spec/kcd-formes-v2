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

# 1) Cible : 1er argument = "user@host" OU "host" seul (utilisateur pris dans
#    ~/.ssh/config) OU un alias SSH ; sinon variables d'env.
if [ "${1:-}" != "" ]; then
  ARG="$1"
  if [[ "$ARG" == *"@"* ]]; then VPS_USER="${ARG%@*}"; VPS_HOST="${ARG#*@}"; else VPS_HOST="$ARG"; VPS_USER="${VPS_USER:-}"; fi
  VPS_PORT="${2:-${VPS_PORT:-22}}"
  VPS_APP_DIR="${3:-${VPS_APP_DIR:-~/kcd-formes-v2}}"
else
  VPS_HOST="${VPS_HOST:-}"; VPS_USER="${VPS_USER:-}"
  VPS_PORT="${VPS_PORT:-22}"; VPS_APP_DIR="${VPS_APP_DIR:-~/kcd-formes-v2}"
fi

if [ -z "${VPS_HOST}" ]; then
  echo "Erreur : host requis (argument user@host, host seul, ou VPS_HOST)." >&2
  echo "Ex : ./scripts/sync-assets.sh kcd-formes.fr   ou   deploy@kcd-formes.fr" >&2
  exit 1
fi

# Cible SSH : "user@host" si un utilisateur est fourni, sinon "host" (ssh config).
DEST="${VPS_HOST}"; [ -n "${VPS_USER}" ] && DEST="${VPS_USER}@${VPS_HOST}"
ARCHIVE="kcd-assets.tgz"
SSH="ssh -p ${VPS_PORT} ${DEST}"

echo "▶ 1/4 Empaquetage des assets…"
./scripts/pack-assets.sh "$ARCHIVE"

echo "▶ 2/4 Transfert vers ${DEST}:${VPS_APP_DIR}/ …"
scp -P "${VPS_PORT}" "$ARCHIVE" "${DEST}:${VPS_APP_DIR}/"

echo "▶ 3/4 Dépaquetage sur le VPS…"
$SSH "cd ${VPS_APP_DIR} && ./scripts/unpack-assets.sh ${ARCHIVE}"

echo "▶ 4/4 Rebuild + redémarrage de la stack de prod…"
$SSH "cd ${VPS_APP_DIR} && docker compose -f docker-compose.prod.yml --env-file .env up -d --build --remove-orphans && docker image prune -f"

echo "✅ Assets synchronisés et stack redéployée sur ${VPS_HOST}."
