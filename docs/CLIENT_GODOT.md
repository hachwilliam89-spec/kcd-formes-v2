# Client de jeu Godot — architecture et règles

> Décision : [ADR 0001](adr/0001-client-de-jeu-godot.md). Document vivant : à mettre à jour dans le même commit que tout changement qui le rendrait faux.

## 1. Rôle et périmètre

- `client-godot/` est **le** client de jeu de War Seasons : Android, iOS, web (servi par Next.js sur `/jouer`), desktop.
- Il **affiche** l'état fourni par le serveur et **envoie des intentions** (poser / améliorer une tour, lancer une vague, choisir un bonus…). Il ne calcule **aucune** règle de jeu.
- Next.js garde : accueil, SEO / Open Graph, classement, compte. Il ne contient plus de code de jeu une fois la bascule faite.

## 2. Structure

```
client-godot/
  project.godot           filtre de texture par défaut : Nearest ; variables non typées = erreur
  autoload/               (ordre de chargement = ordre dans project.godot)
    Config.gd             URL du backend (réglage war_seasons/network/api_base_url + surcharges par plateforme)
    Session.gd            token + joueur, stockés dans user:// (chiffré)
    Api.gd                HTTPRequest + JWT → ApiResult ; 401 = session vidée + signal `unauthorized`
    Router.gd             navigation entre écrans (seul endroit qui change de scène)
    Stomp.gd              WebSocketPeer + trames STOMP 1.2 (à venir)
  net/
    ApiResult.gd          résultat d'un appel : ok / status (0 = réseau) / data / error (message du backend)
    dto/                  classes typées des DTO, miroir des records Java (AuthResponseDto…)
  game/
    TickPlayer.gd         rejoue les ticks et émet des signaux (aucun accès aux nœuds visuels)
    Grid.gd               seule conversion case ↔ écran (cell_to_world / world_to_cell)
    entities/             scènes Tower, Enemy, Projectile, Castle (.tscn)
    maps/                 cartes saisonnières en TileMapLayer
  visuals/
    catalog.tres          type d'unité → UnitVisual
    units/*.tres          une ressource UnitVisual par type (animations, échelle, décalages, sons, effets)
  ui/
    theme.tres            LE thème unique de l'UI (déclaré dans project.godot → gui/theme/custom)
    boot/ login/ home/    puis MapSelect, Hud, Coop, Versus, Leaderboard
  assets/                 sprites et sons (source : kcd-assets.tgz, voir scripts/)
  tests/                  gdUnit4
```

## 3. Règles de conception (obligatoires dès le premier commit)

1. **La logique ne dessine pas.** `TickPlayer`, `Api`, `Stomp` n'accèdent jamais aux nœuds visuels. Ils émettent des signaux (`enemy_spawned`, `enemy_moved`, `tower_fired`, `castle_hit`, `wave_ended`…) auxquels les scènes visuelles s'abonnent. C'est la séparation modèle / vue, le pendant côté client de l'hexagonal du backend.
2. **Le visuel est une donnée.** Aucun chemin d'asset en dur dans les scripts. Un type d'unité est rendu via sa ressource `UnitVisual`, trouvée dans `visuals/catalog.tres`. Une refonte graphique = de nouveaux `.tres` et de nouveaux assets, pas de code.
3. **Un seul Theme.** Toute l'UI hérite de `ui/theme.tres`. Aucune surcharge de style locale dans les scènes (`theme_override_*` interdit sauf exception justifiée en commentaire).
4. **Une seule conversion case ↔ écran** : `Grid.gd`. La taille de case est une constante unique.
5. **Mises en page en ancres et conteneurs**, jamais en positions absolues.
6. **GDScript typé partout** (paramètres, retours, variables). Les avertissements de typage sont des erreurs.
7. **Aucune règle de jeu côté client.** Si l'UI a besoin d'une règle (aperçu de pose, coût, cases constructibles), elle la demande à l'API. Ne pas recopier `frontend-web/components/game/constants.ts`.

## 4. Réseau

**REST** (même API que le web, JWT en `Authorization: Bearer …`) :
- `POST /api/v1/auth/register`, `POST /api/v1/auth/login`
- `POST /api/v1/games` · `GET /api/v1/games/{id}`
- `POST /api/v1/games/{id}/towers` · `…/towers/{towerId}/upgrade` · `…/towers/{towerId}/targeting`
- `POST /api/v1/games/{id}/waves/start` · `GET /api/v1/games/{id}/waves/next`
- `POST /api/v1/games/{id}/bonus/choose`
- Contrat de référence : OpenAPI exposé par springdoc (`/swagger-ui/index.html`).

**STOMP** sur WebSocket brut `/ws` (pas de SockJS) :
- Trame `CONNECT` avec l'en-tête `Authorization: Bearer <token>` (comme `frontend-web/hooks/useCoop.ts`).
- Abonnements : `/user/queue/match`, `/user/queue/errors`, `/topic/match/{id}`, `/topic/match/{id}/state`, `/topic/match/{id}/chat`.
- Chaque trame se termine par un octet NULL ; gérer les heartbeats et la reconnexion (réabonnement idempotent, comme côté web).
- Détails du protocole de match : `docs/MULTIPLAYER.md`.

**URL du backend** : configurable (dev : IP du Mac sur le réseau local ou `10.0.2.2` depuis l'émulateur Android ; prod : `https://kcd-formes.fr`). En export web servi sur le même domaine, utiliser l'origine courante.

## 5. Prérequis backend

- [ ] Exposer les règles de pose (cases constructibles par carte et/ou verdict de pose) pour supprimer la duplication côté clients.
- [ ] Vérifier l'acceptation des connexions WebSocket des clients natifs (en-tête `Origin`) dans `WebSocketConfig`, et ajouter les origines de dev nécessaires.

## 6. Assets et rendu

- Pixel art : filtre Nearest (réglage projet), rendu GL Compatibility (web + mobile).
- **Provisoire (spike)** : résolution de base 640×360, étirement `canvas_items`, aspect `expand`, paysage forcé (capteur). À confirmer à la fin du spike.
- Taille des cibles tactiles : portée par les marges des StyleBox du Theme, pas par des tailles posées nœud par nœud.
- Polices : MedievalSharp, Pixelify Sans (comme le web).
- Audio : bus SFX et musique séparés, réglages persistés dans `user://`.

## 7. Tests, CI, distribution

- Tests unitaires : gdUnit4 (au minimum `TickPlayer`, `Grid`, désérialisation des DTO, parseur STOMP).
- CI : GitHub Actions, Godot en mode headless (`godot --headless --export-release <preset> <sortie>`).
  - Export web → fichiers statiques servis par Caddy sous `/jouer`.
  - Export Android → APK signé (keystore en secret CI), servi en téléchargement comme celui d'Equilibre.
  - iOS : Xcode sur le Mac, compte Apple Developer seulement au moment de publier.
- **Après un clone (ou si `.godot/` a été supprimé)** : `godot --headless --path client-godot --import` une fois, sinon les `class_name` (ApiResult, DTO…) ne sont pas encore enregistrés et les autoloads échouent au parsing. Ouvrir le projet dans l'éditeur a le même effet.
- Lancer en local (backend sur `localhost:8080`) : `godot --path client-godot` (ou ouvrir `client-godot/project.godot` dans l'éditeur, F5).
- Vérifier que tout compile sans erreur : `godot --headless --path client-godot --import`.
- Test sur téléphone en dev : surcharger l'URL dans `project.godot` (`network/api_base_url.android="http://<IP-du-Mac>:8080"`). Android bloque le HTTP en clair par défaut : à vérifier au premier export.
- Commandes de tests (gdUnit4) et d'export : à consigner ici quand elles seront en place.

## 8. Jalons

- [ ] **Spike** (≤ 1 semaine) : connexion REST, une carte, replay d'une vague solo, export Android + web, mesures sur téléphone. Critères d'arrêt : ADR 0001.
  - [x] Ossature + connexion / inscription / session persistée (2026-10-09)
  - [ ] Une carte + replay d'une vague solo
  - [ ] Exports Android + web, mesures sur téléphone
- [ ] Prérequis backend (§5).
- [ ] Solo complet : HUD, tutoriel, son, quatre saisons.
- [ ] Coop puis versus (STOMP).
- [ ] Bascule : `/jouer` sert l'export web Godot, suppression du code de jeu de `frontend-web`.
- [ ] Distribution : APK, puis stores.

## 9. Questions ouvertes

- Résolution de base et mode d'étirement (§6).
- Sur le web : connexion dans Godot, ou passage du JWT depuis Next.js vers l'export web ?
- Distribution iOS : oui / non, et quand.
