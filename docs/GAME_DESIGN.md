# KCD Formes v2 — Document de game design

> Document vivant : à mettre à jour à chaque décision de gameplay qui change ou affine ce qui suit. Versionné avec le code (git), pas un artefact figé.

Dernière mise à jour : 2026-06-25

## 1. Vision et piliers

- **Parties courtes** : pas de grind, une session se joue en quelques minutes.
- **Survie** : la difficulté monte sans fin, pas de "victoire" figée — l'objectif est d'aller le plus loin possible.
- **Compétitif** : comparer ses performances aux autres joueurs (classement, défi, puis duel direct).

Toute décision de gameplay ci-dessous doit rester cohérente avec ces trois piliers. En cas de doute sur une future fonctionnalité, se demander si elle raccourcit/allonge une partie, renforce/casse la survie infinie, ou ajoute/retire de la comparaison entre joueurs.

## 2. Mode solo

- Boucle infinie : les vagues s'enchaînent sans fin, avec une difficulté croissante (réutilise `WaveFactory` existant).
- Pas de condition de victoire fixe. La partie se termine quand le château tombe (`Castle.isDestroyed()`).
- **Score = numéro de la vague la plus loin atteinte.**
- Économie **par partie** : or de départ fixe identique à chaque run, aucun report de l'or restant d'une partie à l'autre (équité, évite le pay-to-win et la dérive de difficulté).
- **Progression de compte (meta)**, séparée de l'économie de run : déblocages (nouvelles tours, cosmétiques) liés aux meilleurs scores atteints, jamais à l'or accumulé en partie. Ces deux économies (run vs compte) doivent rester des concepts distincts dans le code, pour ne jamais avoir à faire de migration si l'une évolue indépendamment de l'autre.

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
- **Roster ennemis solo** (Goblin / Orc / Troll / Dark Knight) : reste exclusif au mode solo, ne sert pas en PvP. Cohérence thématique : monstres en PvE, armées humaines en PvP.

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
