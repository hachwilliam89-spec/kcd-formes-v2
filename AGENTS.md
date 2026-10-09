# War Seasons (ex-KCD Formes v2) — cap du projet

> Fichier lu automatiquement par Codex (`AGENTS.md`) et par Claude Code (`CLAUDE.md` → `@AGENTS.md`).
> Toute décision structurante est actée ici ou dans `docs/adr/`. **Ne pas dévier de ce cap sans un nouvel ADR validé par Kim.**
> En cas de conflit entre une demande ponctuelle et ce fichier, signaler le conflit avant d'agir.

## Langue et conventions

- Code, commentaires, commits et docs en **français**.
- Commits : `type(portée): description` — types utilisés : `feat`, `fix`, `balance`, `refactor`, `test`, `docs`, `chore`.
- Merges Git **uniquement en terminal**, jamais via l'interface web GitHub (pertes de fichiers constatées).
- Projet **personnel** : le code est poussé sur **GitHub uniquement** (pas sur le GitLab UHA, réservé aux projets d'école).

## Le projet

Tower defense médiéval-fantasy, quatre cartes saisonnières. Solo en survie infinie, coop et versus en temps réel.

| Dossier | Rôle | Stack |
|---|---|---|
| `backend/` | Serveur de jeu autoritaire + API REST + STOMP | Java 21, Spring Boot 4, PostgreSQL 16, Flyway, Maven |
| `frontend-web/` | Client actuel (site + jeu Phaser). Devient **site vitrine** à terme | Next.js 16, React 19, Phaser 4, Tailwind, Zustand |
| `client-godot/` | **Client de jeu cible** : Android, iOS, web, desktop (à créer) | Godot 4, GDScript typé |
| `docs/` | Conception : `GAME_DESIGN`, `MULTIPLAYER`, `BACKEND_ARCHITECTURE`, `SEASONAL_MAPS`, `MAP_ASSETS`, `CLIENT_GODOT`, `adr/` | — |

## Principes non négociables

1. **Serveur autoritaire.** Toute la simulation tourne côté backend. Un client affiche l'état reçu et envoie des intentions ; il ne calcule jamais une règle de jeu.
2. **Architecture hexagonale.** Domaine pur (aucune dépendance Spring, beans déclarés dans `DomainConfig`). Toute règle passe par `domain/`, jamais par un contrôleur, un mapper ou un client. Les adapters vivent dans `infrastructure/`.
3. **Aucune règle dupliquée côté client.** Si un client a besoin d'une règle (cases constructibles, verdict de pose, coûts…), le backend l'expose via l'API. Les constantes marquées « DOIT rester synchronisé avec le backend » dans `frontend-web/components/game/constants.ts` sont une **dette à résorber**, pas un modèle à reproduire.
4. **Un seul client de jeu à terme : Godot.** Pas de second moteur de rendu (ni React Native/Skia, ni réécriture parallèle).
5. **Réutilisation avant duplication** (voir `docs/GAME_DESIGN.md` §7).
6. **Design patterns seulement quand la complexité le justifie**, jamais par principe.

## Décisions actées

| ADR | Décision | Statut |
|---|---|---|
| [0001](docs/adr/0001-client-de-jeu-godot.md) | Client de jeu unique Godot 4 (GDScript) pour mobile + web ; Next.js gardé comme site vitrine | Accepté, sous réserve du spike |

Nouvelle décision structurante → nouvel ADR `docs/adr/NNNN-titre.md` (même format) + ligne dans ce tableau.

## Transition Phaser → Godot

- Tant que le spike Godot n'est pas validé : `frontend-web` évolue normalement.
- **Dès le spike validé** : `frontend-web/components/game/GameScene.ts` est en gel fonctionnel — corrections de bugs uniquement, toute nouvelle feature visuelle va dans `client-godot/`.
- Les changements de gameplay se font dans le backend : ils profitent aux deux clients pendant la transition.
- La version Phaser reste en ligne jusqu'à ce que Godot couvre solo, coop et versus. Ensuite `/jouer` sert l'export web Godot et le code de jeu de Next est supprimé.
- Règles du client Godot : voir `docs/CLIENT_GODOT.md` (à respecter dès le premier commit).

## Façon de travailler

- Expliquer le **pourquoi** des choix, pas seulement le comment.
- Si tu ne peux pas lancer les tests toi-même, donne les commandes exactes à exécuter.
- Mettre à jour la doc concernée (GAME_DESIGN, MULTIPLAYER, CLIENT_GODOT, ADR) **dans le même commit** que le changement qui la rendrait fausse.

## Commandes

```bash
# Backend : tests
cd backend && ./mvnw test

# Front web : lint + build
cd frontend-web && npm run lint && npm run build

# Stack locale complète
docker compose up -d
```

Commandes Godot (tests gdUnit4, exports) : voir `docs/CLIENT_GODOT.md`.
