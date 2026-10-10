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
  net/
    ApiResult.gd          résultat d'un appel : ok / status (0 = réseau) / data / error (message du backend)
    StompClient.gd        WebSocketPeer + trames STOMP 1.2 (CONNECT avec le JWT, abonnements renvoyés à chaque reconnexion)
    dto/                  classes typées des DTO, miroir des records Java (AuthResponseDto…)
  game/
    Game.tscn / Game.gd   écran de jeu (contrôleur) : carte, création de partie, pose au tap, vagues, bonus
    Grid.gd               seule conversion case ↔ espace local (CELL_SIZE = 16 ; ennemis : entier = centre de case)
    TickPlayer.gd         rejoue les ticks à 120 ms, interpole les ennemis, signaux tick_played / finished ; mode direct (play_live / push) pour le multijoueur
    TowerBar.gd           barre de construction depuis le catalogue serveur, partagée solo / coop
    coop/Coop.tscn        écran coop : lobby (créer, rejoindre par code, prêt, démarrer) + plateau live, pose, bonus, chat, écran de fin ; reconnexion et reprise
    coop/SnapshotFeed.gd  snapshots live → ticks rejouables par TickPlayer / BattleView (même rendu qu'en solo) ; détecte les trous du flux
    coop/ChatBox.gd       chat de match (fil + saisie), réutilisable par le versus ; texte des joueurs jamais interprété en BBCode
    map/MapView.gd        vue provisoire de la carte (cases colorées) — remplaçable par une vue à tuiles
    battle/BattleView.gd  vue du combat, reproduction de GameScene.ts : décor, tours, ennemis, tirs, impacts, triés par profondeur
    battle/DecorSet.gd    sol + décor exportés du web (assets/baked/<carte>/)
    entities/             scènes Tower, Enemy, Projectile, Castle avec sprites — à venir
  visuals/
    MapPalette.gd + map_palette_default.tres   couleurs de la vue de carte provisoire
    MapNames.gd           libellés affichés des cartes (les ids viennent de l'API)
    VisualCatalog.gd + visual_catalog.tres   catalogue des visuels du combat (valeurs reprises de GameScene.ts) :
      TowerVisual.gd      socle + arme pivotante, planche animée (Mage) ou image orientée (Mur), projectile, impact
      EnemyVisual.gd      planche 96 px (marche / mort / attaque), taille, décalage, barre de vie, anneau au sol
      EffectVisual.gd     impacts et projectiles animés
    TextureCache.gd       chargement tolérant : asset absent → null → forme de repli
  ui/
    theme.tres            LE thème unique de l'UI (déclaré dans project.godot → gui/theme/custom)
    boot/ login/ home/    puis MapSelect, Hud, Coop, Versus, Leaderboard
  assets/                 HORS GIT, généré par scripts/sync-godot-assets.sh :
    sprites/              sprites sous licence copiés de frontend-web/public/sprites
    baked/<carte>/        sol (ground.png) + décor (decor.json, textures/) exportés du vrai GameScene web
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
- `GET /api/v1/maps` (ids) · `GET /api/v1/maps/{mapId}` (disposition : château, entrées, points de passage et chemin case par case de chaque voie, demi-largeur du couloir, aires élargies, couloir, cases constructibles, eau) · `GET /api/v1/maps/{mapId}/forecast?wave=N` (prévision saisonnière d'une vague) · `GET /api/v1/towers` (catalogue des tours) · `GET /api/v1/versus/sends` (envois du versus : coût, revenu passif) — **sources de vérité**, publiques en lecture (aucun token), partagées avec le web
- `POST /api/v1/games` · `GET /api/v1/games/{id}`
- `POST /api/v1/games/{id}/towers` · `…/towers/{towerId}/upgrade` · `…/towers/{towerId}/targeting`
- `POST /api/v1/games/{id}/waves/start` · `GET /api/v1/games/{id}/waves/next`
- `POST /api/v1/games/{id}/bonus/choose`
- Contrat de référence : OpenAPI exposé par springdoc (`/swagger-ui/index.html`).

**STOMP** sur WebSocket brut `/ws` (pas de SockJS) :
- Trame `CONNECT` avec l'en-tête `Authorization: Bearer <token>` (comme `frontend-web/hooks/useCoop.ts`).
- Abonnements : `/user/queue/match`, `/user/queue/errors`, `/topic/match/{id}`, `/topic/match/{id}/state`, `/topic/match/{id}/chat`.
- Chaque trame se termine par un octet NULL (découpe en octets : une String Godot ne contient pas de caractère nul) ; heart-beat `0,0` (le broker simple de Spring n'en émet pas) ; reconnexion au bout de 3 s avec renvoi de tous les abonnements.
- `Origin` : le WebSocket natif de Godot (desktop, Android, iOS) n'envoie pas d'en-tête `Origin`, ce que Spring accepte (seules les origines présentes sont filtrées par `setAllowedOrigins`) ; l'export web est servi par le même domaine que l'API.
- Snapshots live (`/topic/match/{id}/state`, un par tick de 120 ms) : `SnapshotFeed` en fait des ticks pour `TickPlayer` en mode direct (retard borné à 3 ticks). Le snapshot ne dit ni pourquoi un ennemi disparaît ni qui vise qui : déduit pour le choix de l'animation seulement (présentation). Il porte aussi les options de bonus (`bonusOptions`, libellés du serveur) quand un bonus attend.
- Robustesse : chien de garde (partie en cours sans snapshot depuis 4 s → connexion rouverte, pour une connexion restée « ouverte » sur un réseau mobile coupé ou une appli suspendue) ; trou dans le flux (> 8 ticks) → le plateau repart du snapshot reçu, sans animer de morts fictives ; code de la partie gardé dans `user://multi.cfg` et prérempli à la réouverture de l'écran (rejoindre une partie dont on est membre la reprend, `Match.addPlayer`), effacé en quittant ou à la fin.
- Détails du protocole de match : `docs/MULTIPLAYER.md`.

**URL du backend** : configurable (dev : IP du Mac sur le réseau local ou `10.0.2.2` depuis l'émulateur Android ; prod : `https://kcd-formes.fr`). En export web servi sur le même domaine, utiliser l'origine courante.

## 5. Prérequis backend

- [x] Exposer la disposition des cartes, cases constructibles comprises : `GET /api/v1/maps/{mapId}` (`GetMapLayoutUseCase` → `MapLayoutService` → `MapController`).
- [ ] Verdict de pose propre à une partie (tours posées, crue, limite de murs) si l'aperçu client en a besoin au-delà de « constructible + case libre ».
- [x] Catalogue des tours exposé par l'API : `GET /api/v1/towers` (`GetTowerCatalogUseCase` → `TowerCatalogService` → `TowerController`) : coût, profil de dégâts, déblocage (`unlockWave`, comparé au `bestWave` de `/players/me`), règle de pose (`OFF_CORRIDOR` / `ON_CORRIDOR`), plafond (`maxCount`, 6 murs) et stats par niveau calculées par une vraie `Tower`. La règle « sur le couloir » vit dans `TowerType.placedOnCorridor()`, lue par `PlaceTowerService` et par le catalogue.
- [x] Client Godot : barre de construction construite depuis le catalogue (coût, verrou « vague N », compteur de murs, grisée si l'or manque), Mur posé sur la route, Baliste proposée une fois débloquée, annonce des déblocages en fin de vague.
- [x] `frontend-web` branché sur `/api/v1/towers` et `/api/v1/maps` (`store/catalogStore.ts`, chargé une fois) : solo, coop, versus et `GameScene` ne recopient plus ni coûts, ni stats, ni portées, ni limite de murs, ni tracés, couloirs ou cases constructibles. `maps.ts` ne garde que la présentation (nom, biome, image). Les outils `scripts/visual-export` et `scripts/perf-bench` lisent le même catalogue (backend lancé, ou `--catalog`).
- [x] Mécaniques saisonnières exposées : la disposition d'une carte porte `bankCells` (berges inondables) et `seasonalRules` (intervalle des crues, pénalité de portée de la brume, multiplicateurs de grêle, d'or au printemps, de protection dans la brume) ; `GET /api/v1/maps/{id}/forecast?wave=N` donne la prévision d'une vague (crue, boue, brume, grêle). Le web ne recopie plus aucune zone ni constante (`seasons.ts` ne garde que les types et les thèmes) ; le client Godot s'en servira pour le printemps et l'automne.
- [x] Catalogue des envois du versus exposé : `GET /api/v1/versus/sends` (`GetSendCatalogUseCase` → `SendCatalogService` → `SendController`), lu dans `SendCatalog` comme `MatchService.sendCreep`. Le web ne recopie plus ni la liste, ni les coûts, ni les revenus (`app/versus/page.tsx` ne garde que les libellés). Plus aucune règle dupliquée côté client.
- [x] Connexion STOMP du client natif (sans `Origin`) acceptée par le vrai backend : partie coop Godot + web validée dans les deux sens (2026-10-10).

## 6. Assets et rendu

- Pixel art : filtre Nearest (réglage projet), rendu GL Compatibility (web + mobile).
- **Le rendu reproduit le jeu web, il ne le réinvente pas.** Source unique des visuels : le web.
  - Sol et décor (terrain, emplacements, ruines, arbres, châteaux et portails peints par code) : **exportés du vrai `GameScene`** par `scripts/visual-export` (Chrome headless) — rien n'est redessiné à la main.
  - Tours, ennemis, tirs : mêmes fichiers et mêmes paramètres que `GameScene.ts` (`ROT_WEAPON`, `TOWER_ANIM`, `ENEMY_SCALE`, `PROJECTILES`, `TOWER_IMPACT`, `drawEnemies`, `placeTowerParts`, `drawEffects`), stockés dans `visual_catalog.tres`.
  - Profondeur : même règle que le web (`1 + pied / 100`), barres de vie au-dessus des unités, puis projectiles et impacts.
  - `Grid.CELL_SIZE = 40`, comme le web : tailles et positions en pixels reprises telles quelles.
- **Vérification** : `npm run export -- --reference` capture le web pendant une vague déterministe ; la même vague rejouée par Godot est comparée image par image (écart moyen mesuré le 2026-10-09 : 0,6 à 3,6 / 255 sur les 4 cartes, hors météo).
- **Pas encore reproduit** : météo (neige, pluie, grêle, brume, mirage), terrain saisonnier dynamique (crue, boue), tirs du château, effets de boss et de siège, son.
- **Assets sous licence (CraftPix) jamais versionnés**, comme côté web : `client-godot/assets/` est ignoré par git. Les visuels référencent les fichiers par **chemin texte** : sans eux (clone frais, CI, Codex), le jeu tourne avec des formes colorées au lieu de planter.
- Conséquence : un export qui doit contenir les vrais visuels se fait sur une machine qui a les assets (le Mac), ou en CI après restauration du bundle depuis un stockage privé.
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
- **Visuels réels** : `./scripts/sync-godot-assets.sh` (prérequis une fois : `cd frontend-web && npm ci`, `cd scripts/visual-export && npm install`, Google Chrome ; à chaque fois : backend lancé, `docker compose up -d`, qui sert la disposition des cartes — autre adresse : `API_URL=…`) puis l'import ci-dessous. Sans ça : formes colorées.
- **Après un clone (ou si `.godot/` a été supprimé)** : `godot --headless --path client-godot --import` une fois, sinon les `class_name` (ApiResult, DTO…) ne sont pas encore enregistrés et les autoloads échouent au parsing. Ouvrir le projet dans l'éditeur a le même effet.
- Lancer en local (backend sur `localhost:8080`) : `godot --path client-godot` (ou ouvrir `client-godot/project.godot` dans l'éditeur, F5).
- Vérifier que tout compile sans erreur : `godot --headless --path client-godot --import`.
- Test sur téléphone en dev : surcharger l'URL dans `project.godot` (`network/api_base_url.android="http://<IP-du-Mac>:8080"`). Android bloque le HTTP en clair par défaut : à vérifier au premier export.
- **Exports** (préréglages dans `client-godot/export_presets.cfg`, sans secret ; à lancer sur une machine qui a les assets) :
  ```bash
  mkdir -p client-godot/build/android client-godot/build/web && touch client-godot/build/.gdignore
  godot --headless --path client-godot --export-debug "Android" build/android/war-seasons.apk
  godot --headless --path client-godot --export-release "Web" build/web/index.html
  ```
  Android : arm64, permission INTERNET, API de prod (`network/api_base_url.android`). Web : sans threads (pas d'en-têtes COOP/COEP), `index.wasm` ≈ 40 Mo non compressé (≈ 10 Mo gzip), `index.pck` ≈ 11 Mo avec les assets.
- **Banc de perf** (`game/bench/`, bouton « Banc de perf » visible si `war_seasons/debug/show_fps`, ou `-- --bench` / `?bench`) : rejoue hors ligne la vague du banc web (`scripts/perf-bench/wave.ts`, partagé : 200 ennemis, 32 tours, graine 1, jusqu'à 129 à l'écran) avec les vraies vues du jeu. Mesure : durée des images (ce que voit le joueur), CPU du jeu (rejeu + dessin, chronométré dans `BattleView`), CPU et GPU de rendu. Résultat à l'écran, dans la console (`BENCH {...}`) et dans `user://bench_*.json`. Durée = somme des images (une mise en arrière-plan ne fausse plus le FPS) ; les sorties de l'appli pendant la mesure sont comptées (`interruptions`) : une mesure valable en a 0.
- **Tester l'export web sur un téléphone** : Godot web exige un contexte sécurisé (HTTPS ou `localhost`), une IP locale en HTTP est refusée. Servir `build/web` (`python3 -m http.server 8060 -d client-godot/build/web`) et l'exposer en HTTPS par un tunnel temporaire (`cloudflared tunnel --url http://localhost:8060`), puis ouvrir `https://<tunnel>/?bench`, téléphone en paysage, sans quitter le navigateur pendant la mesure.
- Tests unitaires gdUnit4 : pas encore en place (les vérifications du spike sont faites par des scènes de test jetables).

## 8. Jalons

- [ ] **Spike** (≤ 1 semaine) : connexion REST, une carte, replay d'une vague solo, export Android + web, mesures sur téléphone. Critères d'arrêt : ADR 0001.
  - [x] Ossature + connexion / inscription / session persistée (2026-10-09)
  - [x] Carte : disposition chargée depuis `GET /api/v1/maps/{id}`, affichée à l'échelle de l'écran, tap → nature de la case, choix parmi les 4 cartes (2026-10-09)
  - [x] Partie : création, pose de tours au tap (Archer, Mage, Catapulte), replay des vagues à 120 ms avec interpolation, tirs et morts, palier de bonus, défaite et nouvelle partie (2026-10-09)
  - [x] Visuels identiques au web : sol et décor exportés du vrai GameScene, tours (socle + arme qui vise, Mage animé), ennemis, tirs et impacts, vérifiés par comparaison d'images ; compteur FPS en jeu (`war_seasons/debug/show_fps`) (2026-10-09)
  - [x] Exports Android + web configurés, banc de perf identique au banc web (2026-10-09)
  - [x] Barre de construction depuis le catalogue serveur (Mur, Baliste, coûts, déblocages) ; fiche de la tour touchée : stats → niveau suivant, amélioration, priorité de tir (2026-10-10)
  - [x] STOMP : `StompClient` (WebSocketPeer, STOMP 1.2) + écran coop (lobby, partie live, pose, bonus), testés contre un serveur STOMP simulé (2026-10-10)
  - [x] STOMP contre le vrai backend (local) : partie coop Godot ↔ web dans les deux sens, lobby, démarrage, carte choisie (La Fourche) chargée, poses de tours synchronisées et or partagé (2026-10-10). Non testés : reconnexion après coupure, bonus.
  - [x] Coop complète : chat, bonus aux libellés du serveur (un choix à la fois), écran de fin (vague atteinte, aussi en rejoignant une partie déjà terminée : `wave` de l'état du match ; nouvelle partie, accueil), reconnexion après coupure, chien de garde, reprise par code après un arrêt de l'appli ; testés contre un serveur STOMP simulé (2026-10-10)
  - [ ] Mesures sur téléphone → conclusion dans l'ADR 0001

### Mesures du banc (même vague : 200 ennemis, 32 tours, graine 1)

| Date | Client | Machine | Images (moy / p95) | FPS moy | CPU jeu moy | CPU rendu moy | Remarque |
|---|---|---|---|---|---|---|---|
| 2026-10-09 | Web (Phaser), `perf-bench` | conteneur sans GPU (SwiftShader) | — | — | 1,97 ms (`game.step`, jeu + soumission du rendu) | inclus | référence |
| 2026-10-09 | Godot natif | conteneur sans GPU (llvmpipe) | 34 / — ms | 29 | 2,88 ms (p95 6,2) | 2,55 ms | GPU émulé 22,9 ms : non représentatif |
| 2026-10-09 | Godot web (wasm) | conteneur sans GPU (SwiftShader) | — | 7 | ≈ 3,9 ms (`BattleView`) | — | rendu logiciel du navigateur : non représentatif |
| 2026-10-09 | Godot web (wasm) | iPhone de Kim, Safari (modèle à préciser) | 16,7 / 16,7 ms (p99 16,7, max 25,3) | 60,0 | 2,43 ms (p95 4,00) | 1,52 ms | 8035 images, 7 > 16,7 ms, 0 > 33 ms, 0 interruption, 129 ennemis max ; GPU non mesurable en WebGL |
| à faire | Godot Android | Android milieu de gamme (à emprunter : Kim a un iPhone) | | | | | **critère ADR : ≥ 60 FPS** |
| à faire | Godot iOS natif | iPhone de Kim | | | | | facultatif pour le spike (Xcode + compte Apple) |

Lecture : sur CPU, Godot consomme ≈ 2,7× plus que Phaser sur cette scène (≈ 5,4 ms contre 1,97 ms), tout en restant loin du budget de 16,7 ms. Si le téléphone ne tient pas 60 FPS, piste connue : passer `BattleView` du dessin immédiat en GDScript à des nœuds `Sprite2D` triés par le moteur (y-sort en C++).
- [ ] Prérequis backend (§5).
- [ ] Solo complet : HUD, tutoriel, son, quatre saisons.
- [x] Coop complète (chat, fin de partie, reconnexion en cours de vague).
- [ ] Versus (STOMP) : envois depuis `GET /api/v1/versus/sends`, plateau adverse réduit.
- [ ] Bascule : `/jouer` sert l'export web Godot, suppression du code de jeu de `frontend-web`.
- [ ] Distribution : APK, puis stores.

## 9. Questions ouvertes

- Résolution de base et mode d'étirement (§6).
- Sur le web : connexion dans Godot, ou passage du JWT depuis Next.js vers l'export web ?
- Distribution iOS : oui / non, et quand.
