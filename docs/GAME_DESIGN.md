# KCD Formes v2 — Document de game design

> Document vivant : à mettre à jour à chaque décision de gameplay qui change ou affine ce qui suit. Versionné avec le code (git), pas un artefact figé.

Dernière mise à jour : 2026-06-26 (premier boss + palier de bonus)

## 1. Vision et piliers

- **Parties courtes** : pas de grind, une session se joue en quelques minutes.
- **Survie** : la difficulté monte sans fin, pas de "victoire" figée — l'objectif est d'aller le plus loin possible.
- **Compétitif** : comparer ses performances aux autres joueurs (classement, défi, puis duel direct).

Toute décision de gameplay ci-dessous doit rester cohérente avec ces trois piliers. En cas de doute sur une future fonctionnalité, se demander si elle raccourcit/allonge une partie, renforce/casse la survie infinie, ou ajoute/retire de la comparaison entre joueurs.

## 2. Mode solo

- Boucle infinie : les vagues s'enchaînent sans fin, avec une difficulté croissante (réutilise `WaveFactory` existant).
- Pas de condition de victoire fixe. La partie se termine quand le château tombe (`Castle.isDestroyed()`).
- **Score = numéro de la vague la plus loin atteinte.**
- Économie **par partie** : or de départ fixe identique à chaque run (250), aucun report de l'or restant d'une partie à l'autre (équité, évite le pay-to-win et la dérive de difficulté). Valeur remontée de 100 à 250 après retour d'expérience : 100 ne permettait de poser qu'1-2 tours d'entrée de gamme, ce qui rendait les premières vagues trop punitives.
- **Progression de compte (meta)**, séparée de l'économie de run : déblocages (nouvelles tours, cosmétiques) liés aux meilleurs scores atteints, jamais à l'or accumulé en partie. Ces deux économies (run vs compte) doivent rester des concepts distincts dans le code, pour ne jamais avoir à faire de migration si l'une évolue indépendamment de l'autre.

### 2.1 Roster d'ennemis solo

- **Goblin** : chair à canon, toujours présent dès la vague 1.
- **Orc**, **Troll** : ennemis "élite", débloqués à partir d'un seuil de vague (voir 2.2).
- **Chevalier noir (Dark Knight)** : mini-boss à cadence fixe (toutes les 5 vagues une fois débloqué) — point d'extension naturel vers un futur vrai boss (voir 2.2).
- **Sapeur** : dévie du chemin pour foncer sur la tour la plus proche et la détruire à coups de dégâts de siège (la case redevient constructible) ; s'il survit à sa cible, il enchaîne sur la tour suivante la plus proche, et ainsi de suite jusqu'à ce qu'il ne reste plus aucune tour sur la map — ce n'est qu'à ce moment-là qu'il reprend sa route vers le château. Débloqué dans le même mix "élite" qu'Orc/Troll. Dégâts de siège 12 → 8 : premier ajustement piloté par le harnais (voir 2.5) — à 12, le churn de tours détruites/rachetées étouffait l'économie et rendait le boss vague 10 inatteignable (mort médiane vague 7 tous builds confondus).
- **Boss (Seigneur de guerre / `BOSS_WARLORD`)** : premier vrai boss du jeu, voir 2.3.
- `goldReward` de chaque type calibré au fil de plusieurs passes d'équilibrage (dernier ajustement : +20 % sur tous les types, pour rendre la vague 10 atteignable sans la garantir) — c'est cette valeur qui sert aussi de "coût de menace" dans le système de budget décrit ci-dessous.

### 2.2 Génération des vagues : seed par partie + composition aléatoire encadrée

- Chaque partie reçoit un **seed** tiré une seule fois à sa création (`GameEntity.seed`). La composition d'une vague varie d'une partie à l'autre (seed différent), mais reste reproductible au sein d'une même partie (même seed + même numéro de vague => même résultat).
- La composition n'est plus un compte fixe par type d'ennemi : Orc/Troll/Sapeur sont distribués via un **budget de menace** (calculé à partir des anciens comptes déterministes × `goldReward`), réparti aléatoirement entre les trois types — ce qui mélange à la fois la composition ET l'ordre d'apparition, sans changer le niveau de difficulté global calibré précédemment.
- Le seuil de déblocage d'Orc/Troll/Sapeur est lui-même légèrement aléatoire par partie (jitter borné, vague 2 à 4) ; idem pour le Chevalier noir (vague 9 à 11). Bornes choisies pour garantir que la vague 1 reste toujours 100 % Goblin et que la vague 6 contient toujours le mix élite, quel que soit le seed.
- La cadence d'apparition (intervalle entre deux ennemis) est également jitterée plutôt que strictement métronomique.
- **L'ordre de spawn est mélangé globalement** (hors boss, qui ouvre toujours sa vague) : sans ça, les segments sortaient en blocs — tous les Goblins d'abord, morts avant d'avoir servi, puis les élites face à des tours rechargées. Mélangés, les Goblins font écran au milieu des vraies menaces et absorbent des tirs utiles. Reproductible par seed.
- **Implémentation en pattern Composite** (`WaveSegment` et ses implémentations `EnemyBurst`, `SequentialSegments`, `ThreatBudgetMix`, `WeightedChoice`) : permet de faire évoluer la composition des vagues sans toucher à `WaveFactory`. `WeightedChoice` reste disponible mais non branché : le premier boss (2.3) utilise une cadence fixe (`EnemyBurst` toutes les 10 vagues, même logique que le Chevalier noir) plutôt qu'un tirage probabiliste — `WeightedChoice` reste le point d'extension naturel si un futur boss doit apparaître de façon aléatoire plutôt qu'à cadence fixe.

### 2.3 Premier boss : Seigneur de guerre (`BOSS_WARLORD`)

- **Cadence** : apparaît toutes les 10 vagues (`WaveFactory.BOSS_MILESTONE_INTERVAL`), avec l'escorte d'ennemis classiques générée normalement pour cette vague (Goblins + mix Orc/Troll/Sapeur) — jamais dans une vague dédiée au boss seul. Il **ouvre la vague** (premier spawn) : entrée immédiate, et l'escorte spawnée derrière le rattrape et traverse son aura de soin. Le Chevalier noir n'apparaît pas sur ces vagues-là (pas d'empilement de deux mini-boss).
- **PV** : très supérieurs aux autres types (900 de base), encore amplifiés par le scaling multiplicatif par vague déjà en place — à la vague 10, il dépasse largement les PV d'un Troll de la même vague.
- **Mécanique unique** : ne dévie jamais du chemin (contrairement au Sapeur) et avance toujours **pile au centre du couloir** (jamais en file décalée, contrairement aux autres ennemis) — sa zone de menace reste symétrique et prévisible. À la place, toutes les `abilityIntervalTicks` (40 ticks), il déclenche une pulsation sur place qui (1) soigne chaque ennemi proche dans `auraRadius` (3 cases) d'une fraction de ses PV max (`auraHealRatio`, 6 %), et (2) inflige `aoeDamage` (15) à chaque tour dans `aoeRadius` (3 cases — aligné sur l'aura : avec le couloir strict, les tours légales sont à 2 cases du chemin, un rayon de 2 ne touchait en pratique jamais rien depuis le centre) — potentiellement plusieurs tours en une seule pulsation — et l'**étourdit** `stunDurationTicks` (25 ticks) : la tour cesse de tirer (voile gris à l'écran). Entre les pulses, il canalise en marchant un **rayon continu** type tour Mage inversée (`rayDamage`, 2/tick, rayon violet à l'écran) sur la tour la plus proche dans le même rayon de menace — pression constante qui achève les tours déjà entamées. Vitesse 0.07 → 0.08 pour raccourcir d'autant la fenêtre où on peut le focaliser. Le boss est ainsi une **zone morte mobile** qui neutralise la défense sur son passage, pas un sac de PV : on le gère en l'encadrant à distance, pas en empilant du DPS au contact. L'étourdissement est un état de combat éphémère (simulation uniquement, jamais persisté sur la tour) ; deux boss qui pulsent la même tour rafraîchissent l'effet sans l'empiler.
- **Montée en puissance entre récurrences** : le nombre de boss augmente légèrement à chaque réapparition (1 puis 2 à partir de la 3ᵉ occurrence, vague 30) ; ses PV grimpent surtout via le scaling par vague déjà existant.
- **Implémentation** : `EnemyType.BOSS_WARLORD` porte les paramètres d'aura/AoE ; `WaveSimulationService.handleBossAbilityTick` exécute la pulsation (modélisé sur `handleSapperTick`, le même fichier) ; le frontend l'anime via `BossAbilityEvent` (anneau vert pour le soin, orange pour l'attaque de zone) et le distingue visuellement par une couleur et une taille dédiées (`GameScene`).

### 2.4 Palier de bonus (toutes les 5 vagues)

- Tous les 5 paliers de vague (`GameService.BONUS_MILESTONE_INTERVAL`), le lancement de la vague suivante est bloqué jusqu'à ce que le joueur choisisse un bonus parmi plusieurs options (`BonusType`) : injection d'or proportionnelle à la vague atteinte, réparation complète du château, ou réparation de toutes les tours endommagées.
- Choix unique par palier, sans effet automatique — le joueur garde la main sur la stratégie (or immédiat vs résilience défensive).
- Implémentation : `ChooseBonusUseCase` / `GameService.chooseBonus`, flag `GameEntity.awaitingBonusChoice` persisté, modale de choix bloquante côté frontend.

### 2.5 Outillage d'équilibrage : harnais de simulation

- **`BalanceHarnessTest`** (`backend/src/test/.../balance/`) : joue des parties complètes (jusqu'à 40 vagues × 20 seeds) contre des setups de tours de référence pilotés par un bot d'achat simple, et imprime un rapport agrégé — vague de mort médiane/min/max, taux de survie aux vagues 10/20/30, tours perdues (dont sur vagues à boss), or final.
- **Règle de travail** : toute passe d'équilibrage (PV, goldReward, cadences, paramètres du boss...) se valide en lançant le harnais avant/après (`./mvnw test -Dtest=BalanceHarnessTest`) et en comparant les rapports — plus de tuning au ressenti seul.
- Ses assertions sont volontairement lâches (invariants insensibles au tuning, ex. « tout setup fait mieux que ne rien poser ») : les tests de comportement restent dans `WaveSimulationServiceTest` / `WaveFactoryTest`, découplés des constantes d'équilibrage (voir le test d'enchaînement du Sapeur, PV surdimensionnés via l'override).

### 2.6 Terrain : couloir strict (décision)

- **Décision** : le jeu est un tower defense à **couloir strict**, pas un labyrinthe. Le chemin des ennemis est fixe pour toute la partie (calculé en ignorant les tours), et le couloir — chemin élargi d'une case de part et d'autre, là où circulent les files d'ennemis (`laneOffset` ±0.8) — est **inconstructible** (`CellOnPathException`).
- **Pourquoi** : l'ancien modèle implicite (A* qui contournait les tours, seul le blocage complet étant interdit) était un labyrinthe qui s'ignorait — on pouvait poser des tours dans le couloir dessiné et dévier les mobs hors de celui-ci, incohérence visuelle et stratégique. Le couloir strict colle au rendu existant, au style Bloons TD visé, et garde l'équilibrage maîtrisable (le harnais 2.5 suppose un chemin stable).
- **Exception assumée** : le Sapeur reste le seul ennemi autorisé à sortir du couloir (c'est sa mécanique, voir 2.1) — une exception lisible plutôt qu'une règle molle.
- **Implémentation** : `PathfindingService.findCorridorPath` (A* ignorant les tours) et `corridorCells` (bande chemin ±1) ; rejet dans `PlaceTowerService` ; la simulation suit le chemin de couloir ; le frontend filtre les clics sur la bande (`GameScene`, `CORRIDOR_MIN_Y/MAX_Y`). `findPath`/`hasPath` (tours = murs) sont conservés comme point de réentrée si un mode labyrinthe voit le jour.

### 2.7 Mur-barrage (`WALL`) et identité de la Baliste

- **Mur-barrage** : structure passive posée **sur le couloir** (seule exception au couloir strict — règle inverse des tours : jamais en dehors). Il ne dévie jamais le chemin : les ennemis s'arrêtent devant (`WALL_STANDOFF`) et l'attaquent au contact (`castleDamage / 5` par tick, min 1 — la hiérarchie des menaces se conserve) jusqu'à destruction, puis reprennent leur route. Tous les bloqués frappent simultanément : aucun blocage infini possible. Le Sapeur frappe **×3** contre les murs (son métier). Coût à la case (35 or — barrer le couloir complet = 3 cases ≈ une Mage) ; PV découplés du coût (`structureHp` 450, sinon 35 or ≈ 105 PV, cassés en 2 pulses de boss). Débloqué **vague 6** : l'outil défensif de la crise des vagues 6-9, avant la Baliste (récompense du boss, vague 10). Réparable par le bonus TOWER_REPAIR, ciblable par le rayon/pulse du boss et les Sapeurs.
- **Baliste perce-blindage** : dégâts **×2 contre les cibles massives** (seuil sur les PV de *base* du type — Troll, Chevalier noir, Sapeur, Boss — pas sur les PV scalés, sinon tout deviendrait "massif" passé la vague 5), inchangés contre la piétaille. Avant ça, elle n'était qu'un archer cher au même profil : elle est désormais LE choix anti-élite réfléchi. Trait de tir épais à l'écran pour la démarquer de l'Archer.

## 3. Couche compétitive légère (avant le multi temps réel)

- **Leaderboard** : classement global par meilleure vague atteinte.
- **Défi "ghost"** : un joueur peut affronter la même vague (même seed) qu'une partie déjà enregistrée d'un autre joueur, en asynchrone — première étape vers le PvP avant d'investir dans le temps réel.

## 4. Mode multi — "Château contre château" (siège mutuel)

Deux joueurs s'affrontent en duel temps réel, chacun défendant son château et attaquant celui de l'autre.

### 4.1 Économie partagée (modèle Bloons TD Battles)

- L'or ne vient **que** des ennemis tués sur son propre plateau.
- Ce même or finance à la fois la défense (poser des tours) et l'attaque (envoyer des unités chez l'adversaire) — un seul pool, pas deux ressources séparées.
- Conséquence de design : une bonne défense est la seule source d'attaque. Pas de ressource passive (contrairement au modèle Clash Royale, écarté).

### 4.2 Rosters

- **Tours de défense** : identiques au solo (Archer / Mage / Catapulte). Pas de duplication.
- **Roster d'attaque (envoi chez l'adversaire)** : unités humaines dédiées au PvP — Recrue, Archer, Chevalier, Bélier de siège. Prix indexé sur une force équivalente (même logique que le `goldReward` des ennemis solo).
- **Roster ennemis solo** (Goblin / Orc / Troll / Dark Knight / Sapeur / Boss, voir 2.1) : reste exclusif au mode solo, ne sert pas en PvP. Cohérence thématique : monstres en PvE, armées humaines en PvP.

### 4.3 Structure du plateau

- Plateaux **séparés en miroir** : chaque joueur a son propre plateau, avec la même carte des deux côtés. Pas de carte unique partagée.
- Chaque plateau tourne comme une instance indépendante de la simulation solo existante (`WaveSimulationService`, pathfinding) — aucune refonte nécessaire, juste de l'orchestration en plus.

### 4.4 Spawn et rythme des vagues

- Vague de base auto-générée sur chaque plateau (réutilise `WaveFactory`, même montée en difficulté que le solo).
- Les unités envoyées par l'adversaire viennent s'ajouter au même flux que la vague de base — évite les parties stagnantes où personne n'attaque.
- **Synchronisation par horloge serveur partagée** : le déclenchement de chaque vague est cadencé par un timer serveur commun aux deux joueurs, pas par un système "les deux doivent être prêts". Évite qu'un joueur lent ou passif bloque la partie de l'autre. Implémentation : caler les deux appels `simulate()` (un par plateau) sur le même tick serveur.

### 4.5 Fin de partie et format

- **Mort subite** : le premier château à 0 PV perd (réutilise `Castle.hp` / `isDestroyed()` tel quel).
- Pas de minuteur de partie.
- Format : round unique en mode rapide ; **best-of-3** en mode classé (une fois l'ELO en place).

### 4.6 Visualisation de l'adversaire

- Mini-aperçu visuel en temps réel du plateau adverse (plateau miniature), affiché en plus des stats numériques (PV château, or, numéro de vague).
- Données diffusées en snapshots périodiques (positions des tours/ennemis pour l'affichage), pas une simulation autoritaire partagée — le calcul réel reste local à chaque plateau.

### 4.7 Matchmaking

- **MVP** : file d'attente simple (premier disponible apparié avec premier disponible), pas de classement.
- **V2** : ELO, réutilisant le même système que le défi async (3.) — ne pas construire le classement avant d'avoir un mode multi qui tourne et des joueurs pour le tester.

### 4.8 Réseau

- **Tier WebSocket "simple"** : diffusion de l'état (snapshots : PV, or, vague, positions pour l'aperçu visuel), pas de synchronisation tick-par-tick en lockstep.
- La simulation par lot existante côté serveur n'est pas modifiée — elle est juste déclenchée par le timer partagé (4.4) et ses résultats sont diffusés en plus d'être appliqués localement.
- Le tier "complexe" (vrai lockstep tick-par-tick, carte unique partagée) a été écarté : trop de refonte d'architecture pour le bénéfice apporté à ce stade.

## 5. Portage mobile

- **Web responsive d'abord** : Phaser fonctionne nativement dans les navigateurs mobiles (canvas/WebGL, tactile pris en charge) — pas de réécriture du moteur de jeu.
- Contraintes UI à respecter **dès le développement du solo** (coût quasi nul maintenant, coûteux à refaire après coup) :
  - Zones cliquables assez grandes pour un doigt (pas de boutons pensés souris uniquement).
  - Aucune interaction qui dépend du survol (hover) — tout doit fonctionner au tap simple.
- **App native (optionnel, plus tard)** : empaquetage via Capacitor du même frontend web, sans toucher à Phaser ni au backend. Le WebSocket du multi fonctionne identiquement dans ce cas.

## 6. Séquencement de développement

1. Boucle solo (vagues infinies, score, économie de run).
2. Progression de compte (déblocages liés au meilleur score).
3. Leaderboard + défi ghost asynchrone.
4. Multi "château contre château" (tier WebSocket simple).
5. Matchmaking + ELO (partagé avec le défi async).
6. Portage mobile (web responsive, puis app native si pertinent).

## 7. Principes de maintenabilité et d'évolutivité

- **Architecture hexagonale inchangée** (domain / application / infrastructure) : toute nouvelle règle de jeu passe par le domaine, jamais directement par un contrôleur ou un mapper.
- **Réutilisation avant duplication** : `WaveSimulationService`, `WaveFactory`, `Castle`, `GameMap`, le pathfinding — étendus pour le multi, jamais dupliqués en une version "PvP" parallèle.
- **Réseau additif, pas substitutif** : le tier WebSocket simple complète la simulation par lot existante, il ne la remplace pas. Permet d'introduire le multi sans toucher au cœur du moteur solo.
- **Séparation stricte des économies** : or de compte (meta-progression) et or de partie (run) sont deux concepts distincts dans le modèle de données, pour pouvoir faire évoluer l'un sans migration ni risque de casser l'autre.
- **Tests** : suivre la convention existante (JUnit 5 + AssertJ, `@DisplayName` en français) pour toute nouvelle logique de simulation ou d'économie — voir `WaveSimulationServiceTest`, `GameMapMapperTest`, `WaveFactoryTest` comme modèles.
- **Workflow git** : une branche par fonctionnalité, commit à chaque étape logique testable, merge sur `develop` seulement après validation locale par test manuel — convention déjà en place sur ce projet, à conserver pour toute la suite de ce plan.
