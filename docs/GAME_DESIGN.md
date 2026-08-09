# KCD Formes v2 — Document de game design

> Document vivant : à mettre à jour à chaque décision de gameplay qui change ou affine ce qui suit. Versionné avec le code (git), pas un artefact figé.

Dernière mise à jour : 2026-08-09 (chemin serpentin, habillage v2 : pixel-art / son / tuto, cap sur le multi coop temps réel)

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
- **Orc**, **Troll** : ennemis "élite", débloqués à partir d'un seuil de vague (voir 2.2). Le Troll porte en plus un rayon de démolition d'appoint (`Ray` 1/tick, portée 2,5) : en défilant, il grignote la tour la plus proche — pression diffuse qui s'ajoute aux vecteurs dédiés (Sapeur, Démon de givre, Boss).
- **Chevalier noir (Dark Knight)** : élite lourde et rapide, unité régulière du mix depuis la vague 6 (voir le calendrier en 2.2 — anciennement un burst tous les 5 vagues), toujours absente des vagues à Boss. **Armure enchantée** (`magicArmor`) : seuls les Mages le blessent. Les tours physiques le **ciblent et tirent quand même — tout ricoche** (dégâts 0, éclats de Catapulte compris) : il fait office de **leurre**, aspirant la cadence de la défense pendant que la piétaille défile derrière lui. Double punition pour un build sans Mage : il fuit ET gaspille vos tirs. Seule la priorité perce-blindage de la Baliste l'évite (choisir délibérément une cible invulnérable serait absurde — en ciblage « plus proche » normal, elle se fait leurrer comme les autres). Contre les murs, il frappe **×3 façon Sapeur** (`wallDamage` 12) : un défonceur de portes qu'on ne peut dissoudre qu'à la magie pendant qu'il cogne. Liseré arcane violet à l'écran.
- **Sapeur** : dévie du chemin pour foncer sur la tour la plus proche et la détruire à coups de dégâts de siège (la case redevient constructible) ; s'il survit à sa cible, il enchaîne sur la tour suivante la plus proche, et ainsi de suite jusqu'à ce qu'il ne reste plus aucune tour sur la map — ce n'est qu'à ce moment-là qu'il reprend sa route vers le château. Débloqué dans le même mix "élite" qu'Orc/Troll. Dégâts de siège 12 → 8 : premier ajustement piloté par le harnais (voir 2.5) — à 12, le churn de tours détruites/rachetées étouffait l'économie et rendait le boss vague 10 inatteignable (mort médiane vague 7 tous builds confondus).
- **Démon de givre (`CHARIOT`)** : élite « tank » anti-tours (débloqué vague 5, max 4/vague, poids de tirage relevé — retour de partie : trop rare et trop fragile pour peser en première version). Il descend le couloir **sans jamais dévier ni s'arrêter** en **canalisant du givre** (rayon 3/tick, portée 3) sur la tour la plus proche — retarget permanent, il gèle ce qui passe à portée. **450 PV de base** : le blindage est son identité. Décision de design : le Sapeur ne doit pas être l'unique menace sur les tours (son contre une fois construit, plus rien n'usait la défense — partie gagnée d'avance, constaté en jeu). Trois vecteurs anti-tours, trois contres : Sapeur (se snipe avant contact), **Démon de givre** (massif → cible ×2 de la Baliste, ou s'encaisse en réparant), Boss (positionnement). À l'écran : sprite animé de démon, attaque en **dard de glace** (projectile) + **impact givré** à l'arrivée (plus de trait cyan). *(`CHARIOT` = identifiant interne conservé dans l'enum ; « chariot-baliste » était l'ancienne identité de l'unité.)*
- **Boss (Seigneur de guerre / `BOSS_WARLORD`)** : premier vrai boss du jeu, voir 2.3.
- `goldReward` de chaque type calibré au fil de plusieurs passes d'équilibrage (dernier ajustement : +20 % sur tous les types, pour rendre la vague 10 atteignable sans la garantir) — c'est cette valeur qui sert aussi de "coût de menace" dans le système de budget décrit ci-dessous.

### 2.2 Génération des vagues : seed par partie + composition aléatoire encadrée

- Chaque partie reçoit un **seed** tiré une seule fois à sa création (`GameEntity.seed`). La composition d'une vague varie d'une partie à l'autre (seed différent), mais reste reproductible au sein d'une même partie (même seed + même numéro de vague => même résultat).
- **Calendrier d'apparition fixe** (décision de design, remplace les seuils jitterés) : une nouveauté par vague en début de partie — **Orc v2, Troll v3, Sapeur v4, Démon de givre v5, Chevalier noir v6**, premier Boss v10. La progression pédagogique (le joueur découvre une menace à la fois) prime sur la variation des premières vagues.
- **Minimums garantis croissants** par type : Sapeur +1 toutes les 2 vagues (la pression de siège monte le plus vite), Orc +1/3, Troll +1/4, Démon de givre +1/5, Chevalier noir +1/6 — croissance sur la vague *effective* (deux pentes, demi-vitesse après la v12), plafonds prioritaires (Sapeurs progressif, Démons de givre 4). Le Chevalier noir est désormais une unité régulière du mix (plus un burst tous les 5 vagues), toujours absent des vagues à Boss.
- Le **budget de menace** = coût des minimums garantis × 1,25 : la marge de 25 % est distribuée aléatoirement entre les types débloqués (poids : Orc courant, Sapeur/Démon de givre modérés, Troll rare, Chevalier noir exceptionnel) — les vagues restent imprévisibles d'une partie à l'autre au-delà des planchers.
- La cadence d'apparition (intervalle entre deux ennemis) est également jitterée plutôt que strictement métronomique.
- **Courbes à deux pentes après la vague 12** (PV *et* budget de menace) : PV ×1,16/vague puis ×1,08 ; budget élite à demi-vitesse au-delà de la cassure. Décision issue du scénario boss du harnais, en deux temps : (1) à 1,16 partout, les PV (×8 à la v15, ×17 à la v20) écrasaient toute défense aux moyens linéaires ; (2) la pente douce des PV seule n'a RIEN changé (mort médiane v15 inchangée) — le vrai tueur était le **nombre de Sapeurs** (+1/vague sans fin, ~9/vague dès la v15, churn de tours inreconstructible). Les deux courbes cassées ensemble rendent les vagues profondes (et le double-boss v20) atteignables au skill, sans toucher au early game validé (v1-12). Le plafond de Sapeurs est **progressif** (5 jusqu'à la v12, puis +1 toutes les 4 vagues : v20 → 7, v30 → 9) : un plafond figé à 5 tuait la tension — une fois abattus, plus rien ne menaçait les tours, victoire quasi assurée (retour de partie réelle).
- **L'ordre de spawn est mélangé globalement** (hors boss, qui ouvre toujours sa vague) : sans ça, les segments sortaient en blocs — tous les Goblins d'abord, morts avant d'avoir servi, puis les élites face à des tours rechargées. Mélangés, les Goblins font écran au milieu des vraies menaces et absorbent des tirs utiles. Reproductible par seed.
- **Implémentation en pattern Composite** (`WaveSegment` et ses implémentations `EnemyBurst`, `SequentialSegments`, `ThreatBudgetMix`, `WeightedChoice`) : permet de faire évoluer la composition des vagues sans toucher à `WaveFactory`. `WeightedChoice` reste disponible mais non branché : le premier boss (2.3) utilise une cadence fixe (`EnemyBurst` toutes les 10 vagues, même logique que le Chevalier noir) plutôt qu'un tirage probabiliste — `WeightedChoice` reste le point d'extension naturel si un futur boss doit apparaître de façon aléatoire plutôt qu'à cadence fixe.

### 2.3 Premier boss : Seigneur de guerre (`BOSS_WARLORD`)

- **Cadence** : apparaît toutes les 10 vagues (`WaveFactory.BOSS_MILESTONE_INTERVAL`), avec l'escorte d'ennemis classiques générée normalement pour cette vague (Goblins + mix Orc/Troll/Sapeur) — jamais dans une vague dédiée au boss seul. Il **ouvre la vague** (premier spawn) : entrée immédiate, et l'escorte spawnée derrière le rattrape et traverse son aura de soin. Le Chevalier noir n'apparaît pas sur ces vagues-là (pas d'empilement de deux mini-boss).
- **PV** : très supérieurs aux autres types (900 de base), encore amplifiés par le scaling multiplicatif par vague déjà en place — à la vague 10, il dépasse largement les PV d'un Troll de la même vague.
- **Mécanique unique** : ne dévie jamais du chemin (contrairement au Sapeur) et avance toujours **pile au centre du couloir** (jamais en file décalée, contrairement aux autres ennemis) — sa zone de menace reste symétrique et prévisible. À la place, toutes les `abilityIntervalTicks` (40 ticks), il déclenche une pulsation sur place qui (1) soigne chaque ennemi proche dans `auraRadius` (3 cases) d'une fraction de ses PV max (`auraHealRatio`, 6 %), et (2) inflige `aoeDamage` (15) à chaque tour dans `aoeRadius` (3 cases — aligné sur l'aura : avec le couloir strict, les tours légales sont à 2 cases du chemin, un rayon de 2 ne touchait en pratique jamais rien depuis le centre) — potentiellement plusieurs tours en une seule pulsation — et l'**étourdit** `stunDurationTicks` (25 ticks) : la tour cesse de tirer (voile gris à l'écran). Entre les pulses, il canalise en marchant un **rayon continu** type tour Mage inversée (`rayDamage`, 2/tick, rayon violet à l'écran) sur la tour la plus proche dans le même rayon de menace — pression constante qui achève les tours déjà entamées. Vitesse 0.07 → 0.08 pour raccourcir d'autant la fenêtre où on peut le focaliser. Le boss est ainsi une **zone morte mobile** qui neutralise la défense sur son passage, pas un sac de PV : on le gère en l'encadrant à distance, pas en empilant du DPS au contact. L'étourdissement est un état de combat éphémère (simulation uniquement, jamais persisté sur la tour) ; deux boss qui pulsent la même tour rafraîchissent l'effet sans l'empiler.
- **Montée en puissance entre récurrences** : le nombre de boss augmente légèrement à chaque réapparition (1 puis 2 à partir de la 3ᵉ occurrence, vague 30) ; ses PV grimpent surtout via le scaling par vague déjà existant.
- **Implémentation** : `EnemyType.BOSS_WARLORD` porte les paramètres d'aura/AoE ; `WaveSimulationService.handleBossAbilityTick` exécute la pulsation (modélisé sur `handleSapperTick`, le même fichier) ; le frontend l'anime via `BossAbilityEvent` (anneau vert pour le soin, orange pour l'attaque de zone) et le distingue visuellement par une couleur et une taille dédiées (`GameScene`).

### 2.35 Modes de ciblage des tours

- Chaque tour a un **mode de ciblage** choisi par le joueur (`TargetingMode`, persisté avec la map) : **Proche** (`CLOSEST`, défaut — maximise l'uptime), **Avancé** (`FIRST`, le plus près du château — arrête les fuyards), **Costaud** (`STRONGEST`, le plus de PV — focalise les élites qui traversent sous les tirs éparpillés). Gratuit et réversible à volonté hors combat : c'est un réglage tactique, pas un investissement.
- La **priorité perce-blindage de la Baliste** (voir 2.7) reste une surcouche : elle applique le mode choisi *parmi* les cibles massives d'abord, puis en repli sur le reste.
- UX : cliquer une tour la **sélectionne** (carte d'info : amélioration + choix du mode) au lieu de l'améliorer directement — un clic ne dépense plus d'or par surprise. Endpoint `POST /{gameId}/towers/{towerId}/targeting`.

### 2.4 Palier de bonus (toutes les 5 vagues)

- Tous les 5 paliers de vague (`GameService.BONUS_MILESTONE_INTERVAL`), le lancement de la vague suivante est bloqué jusqu'à ce que le joueur choisisse un bonus parmi plusieurs options (`BonusType`) : injection d'or proportionnelle à la vague atteinte, réparation complète du château, ou réparation de toutes les tours endommagées.
- Choix unique par palier, sans effet automatique — le joueur garde la main sur la stratégie (or immédiat vs résilience défensive).
- Implémentation : `ChooseBonusUseCase` / `GameService.chooseBonus`, flag `GameEntity.awaitingBonusChoice` persisté, modale de choix bloquante côté frontend.

### 2.5 Outillage d'équilibrage : harnais de simulation

- **`BalanceHarnessTest`** (`backend/src/test/.../balance/`) : joue des parties complètes (jusqu'à 40 vagues × 20 seeds) contre des setups de tours de référence pilotés par un bot d'achat simple, et imprime un rapport agrégé — vague de mort médiane/min/max, taux de survie aux vagues 10/20/30, tours perdues (dont sur vagues à boss), or final.
- **Règle de travail** : toute passe d'équilibrage (PV, goldReward, cadences, paramètres du boss...) se valide en lançant le harnais avant/après (`./mvnw test -Dtest=BalanceHarnessTest`) et en comparant les rapports — plus de tuning au ressenti seul.
- **Scénario boss dédié** (`bossImpactReport`) : le rapport général mesure mal le Warlord (trop peu de runs l'atteignent défendus). Ce scénario démarre avec un or enrichi (2000) et une défense "forteresse" installée d'emblée, puis mesure PAR VAGUE autour des paliers 10/20/30 les dégâts au château et les tours perdues — une vague à boss se compare à ses voisines directes. C'est le tableau de référence pour tout ajustement du boss.
- Ses assertions sont volontairement lâches (invariants insensibles au tuning, ex. « tout setup fait mieux que ne rien poser ») : les tests de comportement restent dans `WaveSimulationServiceTest` / `WaveFactoryTest`, découplés des constantes d'équilibrage (voir le test d'enchaînement du Sapeur, PV surdimensionnés via l'override).

### 2.6 Terrain : couloir strict (décision)

- **Décision** : le jeu est un tower defense à **couloir strict** en **tracé serpentin** (un « S » sur trois voies horizontales), pas un labyrinthe. Le chemin des ennemis est **fixe** pour toute la partie, défini par une liste de **waypoints** alignés deux à deux (le tracé réel = concaténation des segments droits qui les relient), calculé en ignorant les tours ; le couloir — chemin élargi d'une case de part et d'autre, là où circulent les files d'ennemis (`laneOffset` ±0.8) — est **inconstructible** (`CellOnPathException`). Le serpentin **allonge le temps d'exposition** des ennemis à la défense : un simple couloir horizontal sous-exploitait la carte.
- **Pourquoi** : l'ancien modèle implicite (A* qui contournait les tours, seul le blocage complet étant interdit) était un labyrinthe qui s'ignorait — on pouvait poser des tours dans le couloir dessiné et dévier les mobs hors de celui-ci, incohérence visuelle et stratégique. Le couloir strict colle au rendu existant, au style Bloons TD visé, et garde l'équilibrage maîtrisable (le harnais 2.5 suppose un chemin stable).
- **Exception assumée** : le Sapeur reste le seul ennemi autorisé à sortir du couloir (c'est sa mécanique, voir 2.1) — une exception lisible plutôt qu'une règle molle.
- **Implémentation** : les **waypoints** vivent dans `GameMap` côté backend (arbitre final) et sont **dupliqués à l'identique** côté frontend (`components/game/constants.ts`, `WAYPOINTS`) — sinon le décor ne collerait pas au déplacement réel calculé côté serveur. `PathfindingService.findCorridorPath` relie les waypoints par des segments (A* ignorant les tours) et `corridorCells` = bande chemin ±1 ; rejet dans `PlaceTowerService` ; la simulation suit le chemin de couloir ; le frontend dérive le couloir des waypoints (`isCorridorCell`) et oriente murs / armes rotatives / effets selon le sens du flux (`pathDirectionAt`), et rend une **vraie route** (tuiles + virages arrondis) sur le tracé. `findPath`/`hasPath` (tours = murs) restent conservés comme point de réentrée si un mode labyrinthe voit le jour.

### 2.7 Mur-barrage (`WALL`) et identité de la Baliste

- **Mur-barrage** : structure passive posée **sur le couloir** (seule exception au couloir strict — règle inverse des tours : jamais en dehors). Il ne dévie jamais le chemin : les ennemis s'arrêtent devant (`WALL_STANDOFF`) et l'attaquent au contact jusqu'à destruction, puis reprennent leur route. Chaque type frappe à sa **propre valeur** (`EnemyType.wallDamage` : Goblin 1, Sapeur bloqué 2, Orc 3, Chevalier noir 4, Troll 8, Boss 10 — écarts volontairement marqués, la composition de la vague détermine la durée de vie du barrage : un mur qui tient trois vagues de piétaille tombe en une vague de Trolls). Tous les bloqués frappent simultanément : aucun blocage infini possible. Le Sapeur frappe **×3** contre les murs (son métier). Coût à la case (35 or — barrer le couloir complet = 3 cases ≈ une Mage) ; PV découplés du coût (`structureHp` 450, sinon 35 or ≈ 105 PV, cassés en 2 pulses de boss). **Plafond de 6 murs simultanés** (`PlaceTowerService.MAX_WALLS`) : constaté en partie réelle, paver le couloir en donjon (~40 murs) entassait toute la vague sous le feu de la défense entière — victoire garantie, or jamais dépensé (les tours protégées ne meurent plus), boucle dégénérée. Six murs = deux barrages complets : le chokepoint reste, le donjon disparaît, et le churn de tours (le vrai puits d'or du jeu) reprend son rôle. Débloqué **vague 6** : l'outil défensif de la crise des vagues 6-9, avant la Baliste (récompense du boss, vague 10). Réparable par le bonus TOWER_REPAIR, ciblable par le rayon/pulse du boss et les Sapeurs.
- **Baliste perce-blindage** : dégâts **×2 contre les cibles massives** (seuil sur les PV de *base* du type — Troll, Chevalier noir, Sapeur, Boss — pas sur les PV scalés, sinon tout deviendrait "massif" passé la vague 5), inchangés contre la piétaille. Profil **sniper de siège** : 110 dégâts par carreau, cadence lente (0.12 — DPS soutenu quasi égal à l'ancien 64/0.22, mais chaque tir est un événement : un Sapeur de base tombe d'un carreau, un Troll en deux). Sa faiblesse assumée est la cadence : noyée sous la piétaille, elle perd. **Ciblage prioritaire** : elle vise d'abord la cible massive la plus proche à portée, et ne se replie sur la piétaille qu'en l'absence de massif (priorité plutôt que ciblage exclusif : une tour à 200 or inerte devant une vague de Goblins serait un investissement mort vécu comme un bug — l'exclusivité pourra devenir un mode de ciblage sélectionnable plus tard). Trait de tir épais à l'écran pour la démarquer de l'Archer.

### 2.8 Château et sa défense

- Le château (arrivée du couloir) encaisse `castleDamage` de chaque ennemi parvenu au bout (mécanique existante, PV du château). Il a en plus une **défense intégrée** (archers des remparts, `WaveSimulationService.CASTLE_DEFENSE_*`) : à cadence fixe, il tire sur l'ennemi vivant le plus proche de l'arrivée dans un rayon donné — dernière ligne contre les fuyards, volontairement modeste (aide à finir les stragglers, ne remplace pas la défense du joueur). Signalé au frontend par `castleAttacks` (flèche de feu depuis les remparts).
- **Visuel** : château du joueur à l'arrivée (à défendre), château ennemi décoratif au spawn (immersion) — sprites CraftPix, le tien retourné pour faire face aux assaillants.

### 2.9 Présentation / frontend (habillage v2)

Ces éléments sont **purement de présentation** : la simulation reste autoritaire côté serveur (le frontend ne fait que rejouer les ticks). Ils ne changent pas les règles, mais font l'essentiel de l'effet « jeu fini » / portfolio.

- **Moteur de rendu** : **Phaser** (canvas/WebGL) monté dans Next.js (import dynamique `ssr:false`), `Scale.FIT` + `pixelArt`.
- **Habillage pixel-art médiéval** : UI reskinnée avec le pack CraftPix « Basic Pixel Art UI » (panneaux 9-slice `border-image`, boutons, HUD haut, barre de PV pixel), polices `MedievalSharp` / `Pixelify Sans`. Les **chiffres du HUD** (or, PV, coûts) sont en MedievalSharp pour la lisibilité.
- **Terrain « champ de bataille »** : sol terre foncée + **route serpentine** générée (tuiles + virages arrondis) suivant les waypoints (voir §2.6), props décoratifs.
- **Tutoriel (bulle BD)** : à la **1ʳᵉ apparition** de chaque ennemi (met la vague en pause) et à la **1ʳᵉ pose** de chaque tour — **par compte** (localStorage par pseudo), avec un bouton « Revoir le tuto ».
- **Armes rotatives** : Archer, Baliste et Catapulte ont une base + une arme animée qui **vise la cible** ; les projectiles (flèche/carreau, dard de givre) volent vers la cible et l'**impact s'oriente sur la trajectoire**.
- **Effets distincts** : destruction de tour ≠ explosion de catapulte ≠ chute du château ; démon de givre = dard + impact givré (voir §2.1).
- **Système de son** : bruitages (certains générés, d'autres assets médiévaux) + musiques de fond (menu / combat), **bus SFX et musique séparés**, réglage **mute + volume** persisté (localStorage), déblocage du contexte audio au 1er geste.
- **Accueil animé** : fond héros (zoom/pan Ken Burns), braises, titre pixel qui « respire », formulaire connexion/inscription (indications de validation, email non vérifié).
- **Responsive** : `Scale.FIT` + layout adaptatif — jouable sur mobile/tablette (cible tactile préservée dès le solo, cf. §5).

## 3. Couche compétitive légère (avant le multi temps réel)

- **Leaderboard** : classement global par meilleure vague atteinte. *Implémenté* : top N (borné à 50) + rang du joueur demandeur même hors du top (rang de compétition : 1 + nombre de joueurs strictement meilleurs), tri stable par username entre ex æquo. `GET /api/v1/leaderboard` (`LeaderboardService`), carte dans le panneau de jeu, rafraîchie à chaque fin de vague. L'elo de `PlayerEntity` reste réservé au futur PvP — ce classement n'en dépend pas.
- **Défi "ghost"** : un joueur peut affronter la même vague (même seed) qu'une partie déjà enregistrée d'un autre joueur, en asynchrone — première étape vers le PvP avant d'investir dans le temps réel.

## 4. Mode multijoueur temps réel → voir `docs/MULTIPLAYER.md`

> La conception détaillée du multijoueur vit maintenant dans **`docs/MULTIPLAYER.md`** (document dédié).

**Décision v2** : on part sur du **temps réel via WebSocket/STOMP**, avec une **boucle de jeu autoritaire live** côté serveur (réutilisant les règles de domaine), dans cet ordre :

1. **Coop** (2 joueurs défendent la même carte) — pose toute la tuyauterie réseau proprement.
2. **Versus rush** (deux voies, on s'envoie des ennemis) — réutilise la base coop.
3. **Asymétrique live** (un défend, l'autre spawne) — le plus original.

> L'ancien plan « **château contre château** » (siège mutuel, tier WebSocket « simple » diffusant seulement des snapshots par-dessus la simulation par lot) qui figurait ici est **remplacé** par cette approche temps réel autoritaire. On garde l'idée d'économie partagée et de synchronisation par horloge serveur si elles servent le Versus. Détails, modèle de données, canaux STOMP et jalons : `docs/MULTIPLAYER.md`.

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
4. Multi **temps réel** : coop → versus rush → asymétrique (WebSocket/STOMP, boucle autoritaire) — voir `docs/MULTIPLAYER.md`.
5. Matchmaking + ELO (partagé avec le défi async).
6. Portage mobile (web responsive déjà en place, puis app native si pertinent).

## 7. Principes de maintenabilité et d'évolutivité

- **Architecture hexagonale inchangée** (domain / application / infrastructure) : toute nouvelle règle de jeu passe par le domaine, jamais directement par un contrôleur ou un mapper.
- **Réutilisation avant duplication** : `WaveSimulationService`, `WaveFactory`, `Castle`, `GameMap`, le pathfinding — étendus pour le multi, jamais dupliqués en une version "PvP" parallèle.
- **Réseau : nouveau chemin, domaine réutilisé** : le multi temps réel introduit une **boucle de jeu autoritaire live** (nouveau code) qui **réutilise les règles de domaine** ; la simulation par lot du solo reste intacte et continue de servir le solo et l'async (défi seed / ghost). On n'ajoute donc pas de logique de jeu en double — on fait avancer le même domaine tick par tick en direct. Détails : `docs/MULTIPLAYER.md`.
- **Séparation stricte des économies** : or de compte (meta-progression) et or de partie (run) sont deux concepts distincts dans le modèle de données, pour pouvoir faire évoluer l'un sans migration ni risque de casser l'autre.
- **Tests** : suivre la convention existante (JUnit 5 + AssertJ, `@DisplayName` en français) pour toute nouvelle logique de simulation ou d'économie — voir `WaveSimulationServiceTest`, `GameMapMapperTest`, `WaveFactoryTest` comme modèles.
- **Workflow git** : une branche par fonctionnalité, commit à chaque étape logique testable, merge sur `develop` seulement après validation locale par test manuel — convention déjà en place sur ce projet, à conserver pour toute la suite de ce plan.
- **Déploiement / prod** : le jeu tourne en ligne sur **https://kcd-formes.fr** (VPS OVH). Stack conteneurisée (Docker Compose : PostgreSQL + backend + frontend + reverse-proxy **Caddy** avec HTTPS Let's Encrypt auto-renouvelé), déploiement **automatique via GitHub Actions** à chaque push sur `main`. Détails : `DEPLOY.md`. Les assets sous licence (sprites CraftPix, musiques) restent hors git et sont transférés par `scripts/pack-assets.sh` / `unpack-assets.sh`.
