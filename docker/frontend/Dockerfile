# ── Frontend Next.js (production, sortie standalone) ───────────────────────
# Contexte de build attendu : ./frontend-web
# IMPORTANT : les assets du jeu (public/sprites/, licence CraftPix) sont
# gitignorés. Ils doivent être PRÉSENTS dans le contexte de build (déposés sur
# la machine qui construit l'image, voir scripts/unpack-assets.sh + DEPLOY.md).
# Ils sont alors bakés dans l'image (usage "art dans le jeu" autorisé par la
# licence) sans jamais transiter par le dépôt git.

# ── Stage 1 : dépendances ─────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ── Stage 2 : build ───────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# URL de l'API injectée au build (variable NEXT_PUBLIC_* → figée dans le bundle).
# Vide = requêtes relatives à l'origine (nginx proxifie /api vers le backend).
ARG NEXT_PUBLIC_API_URL=""
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN npm run build

# ── Stage 3 : runtime ─────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S kcd && adduser -S kcd -G kcd
# Sortie standalone : serveur Node minimal + statiques + public (avec sprites).
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
USER kcd
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
