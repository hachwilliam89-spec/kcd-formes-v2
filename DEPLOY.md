# Déploiement — KCD Formes v2 (VPS + Docker)

Stack de prod : **Traefik mutualisé du VPS** (entrée 80/443, HTTPS automatique, stack `/opt/edge`) → **frontend** Next.js (standalone) + **backend** Spring Boot → **PostgreSQL**. Ce projet est orchestré par `docker-compose.prod.yml`. Le proxy est partagé avec les autres projets du VPS et vit dans le dépôt `vps-edge` (voir `docs/adr/0002-proxy-mutualise-traefik.md`).

## 1. Les assets (important)

Les graphismes du jeu (`frontend-web/public/sprites/`, licence CraftPix Free) sont **gitignorés** : ils ne sont jamais poussés sur git. La licence autorise leur usage *dans le jeu déployé*, mais pas la redistribution des fichiers sources. On les transfère donc à part et ils sont **bakés dans l'image Docker du front** au build.

Sur ta machine de dev (où les assets existent) :

```bash
./scripts/pack-assets.sh              # crée kcd-assets.tgz
scp kcd-assets.tgz user@vps:~/kcd-formes-v2/
```

Sur le VPS (une seule fois, puis à chaque changement d'assets) :

```bash
cd ~/kcd-formes-v2
./scripts/unpack-assets.sh            # restaure frontend-web/public/sprites/
```

## 2. Configuration

```bash
cp .env.example .env
# Éditer .env : POSTGRES_PASSWORD (fort), JWT_SECRET (≥32 caractères aléatoires),
# SPRING_PROFILES_ACTIVE=prod
```

## 3. Lancer / mettre à jour

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

Prérequis : la stack `/opt/edge` tourne (elle crée le réseau `edge`). Le site est servi en HTTPS sur `kcd-formes.fr` via Traefik. Flyway applique les migrations au démarrage du backend. Aucun conteneur de ce projet ne publie de port : seul Traefik est exposé.

## 4. HTTPS

Géré par le proxy mutualisé (Traefik + Let's Encrypt) : rien à configurer dans ce dépôt. Les routes du projet sont les labels `traefik.*` de `docker-compose.prod.yml` : `/api` et `/ws` vers le backend, tout le reste vers le front.

## 5. CI/CD (GitHub Actions)

- **`backend-ci.yml`** : tests backend (existant).
- **`frontend-ci.yml`** : lint + typecheck + build du front (sans assets, ça suffit).
- **`deploy.yml`** : à chaque push sur `main`, se connecte en SSH au VPS et relance la stack. Secrets à définir dans *Settings → Secrets and variables → Actions* :
  - `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (clé privée), `VPS_PORT` (optionnel), `VPS_APP_DIR` (optionnel, défaut `~/kcd-formes-v2`).
  - Prérequis : dépôt déjà cloné sur le VPS et assets déjà déposés (étape 1).

Flux conseillé : on développe sur `develop`, et un merge `develop → main` déclenche le déploiement.
