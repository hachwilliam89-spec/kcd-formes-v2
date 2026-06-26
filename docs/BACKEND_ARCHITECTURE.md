# KCD Formes v2 — Comprendre le backend (guide néophyte)

> Objectif de ce document : pouvoir expliquer à quelqu'un qui ne connaît pas le projet comment le backend est construit, pourquoi il est découpé ainsi, et quels design patterns sont utilisés où. Tous les exemples ci-dessous pointent vers de vrais fichiers du dépôt (`backend/src/main/java/com/kcdformes/...`), pas du code théorique.

Dernière mise à jour : 2026-06-26

## 1. La question de départ : pourquoi ne pas juste mettre toute la logique dans les Controllers ?

L'approche la plus simple (et la plus courante chez les débutants) serait d'avoir un Controller Spring qui reçoit la requête HTTP, parle directement à la base de données via JPA, et renvoie une réponse — tout dans la même classe. Ça marche pour un prototype, mais ça pose un problème dès que le projet grossit : la logique de jeu (calcul des dégâts, placement des tours, génération des vagues) se retrouve mélangée avec des préoccupations techniques (HTTP, SQL, JSON), et devient impossible à tester sans démarrer tout le serveur.

L'**architecture hexagonale** (aussi appelée "Ports & Adapters") répond à ça en imposant une règle simple : **le cœur du jeu (le domaine) ne doit rien savoir de Spring, de JPA, ni du HTTP.** Tout ce qui est "technique" est repoussé vers l'extérieur, et le domaine ne communique avec l'extérieur qu'à travers des interfaces qu'il définit lui-même (les "ports").

## 2. Les trois couches du projet

Le code Java est organisé en trois packages racine, qui correspondent exactement aux trois couches de l'architecture hexagonale :

```
backend/src/main/java/com/kcdformes/
├── domain/            ← le cœur : les règles du jeu, aucune dépendance technique
│   ├── model/          (Tower, Castle, Enemy, Wave, GameMap, EnemyType, TowerType...)
│   ├── service/        (PathfindingService, WaveFactory, WaveSimulationService, PlaceTowerService...)
│   ├── port/in/        (interfaces "ce que le domaine sait faire" — les use cases)
│   ├── port/out/       (interfaces "ce dont le domaine a besoin" — la persistance vue du domaine)
│   └── exception/      (CellOccupiedException, InsufficientGoldException...)
│
├── application/        ← l'orchestration : fait le lien entre HTTP, domaine et base de données
│   └── usecase/        (GameService, AuthService)
│
└── infrastructure/     ← le monde extérieur : tout ce qui est technique
    ├── web/             (controllers REST, DTOs)
    ├── persistence/     (entités JPA, repositories Spring Data, mappers JSON)
    └── config/          (sécurité, JWT, Swagger, déclaration des beans du domaine)
```

La règle de dépendance est à sens unique : **`infrastructure` dépend de `application` qui dépend de `domain`, mais jamais l'inverse.** Si on ouvre n'importe quelle classe du package `domain`, elle ne doit importer ni `jakarta.persistence` (JPA), ni `org.springframework.web` (HTTP), ni `org.springframework.stereotype.Service`. C'est vérifiable d'un coup d'œil : par exemple `Tower.java` ou `WaveFactory.java` n'ont aucun import Spring.

## 3. Le domaine : le cœur du jeu

### 3.1 Le modèle (`domain/model`)

Ce sont des classes Java "pures" qui représentent les concepts du jeu et contiennent leurs propres règles. Exemple avec `Tower.java` : la classe sait calculer ses propres dégâts (`getDamage()`), sa portée (`getRange()`), son coût d'amélioration (`getUpgradeCost()`) — ce n'est pas un simple "sac de champs" (DTO anémique), c'est un objet qui encapsule du comportement. C'est ce qu'on appelle un modèle "riche" (rich domain model), à l'opposé d'un modèle où toute la logique serait dans des services externes.

`TowerType` et `EnemyType` sont des enums qui regroupent les caractéristiques par type (dégâts de base, coût, PV, etc.) — une forme légère de **polymorphisme par données** : au lieu d'avoir une sous-classe Java par type de tour, chaque constante de l'enum porte ses propres valeurs, et le code se contente de lire `type.baseDamage`, `type.damageType`, etc.

### 3.2 Les services domaine (`domain/service`)

Ce sont les classes qui contiennent la logique de jeu trop complexe pour vivre dans un seul objet du modèle : `PathfindingService` (calcul de chemin), `WaveSimulationService` (simulation tick par tick d'une vague), `WaveFactory` (génération des vagues), `PlaceTowerService` / `UpgradeTowerService` (règles de placement/amélioration). Aucune de ces classes n'a d'annotation Spring (`@Service`, `@Component`) — elles sont déclarées comme beans Spring ailleurs, dans `infrastructure/config/DomainConfig.java` :

```java
@Configuration
public class DomainConfig {
    @Bean
    public WaveFactory waveFactory() { return new WaveFactory(); }
    // ...
}
```

C'est volontaire (voir le commentaire dans le fichier) : *"Déclare les services domaine purs comme beans Spring. Ils n'ont pas `@Component` car le domaine ne dépend pas de Spring."* Le domaine reste injectable par Spring sans jamais importer Spring lui-même.

### 3.3 Les ports — les interfaces du domaine

Un **port** est juste une interface Java définie dans le domaine, qui décrit un contrat sans dire comment il est rempli. Il y en a deux sortes :

**Port "in"** (`domain/port/in`) : ce que le domaine *offre* au monde extérieur. Ce sont les "use cases" — une interface par action possible dans le jeu : `PlaceTowerUseCase`, `StartWaveUseCase`, `UpgradeTowerUseCase`, `GetGameStateUseCase`. Chacune définit aussi ses propres objets de commande/résultat sous forme de `record` imbriqué, par exemple :

```java
public interface PlaceTowerUseCase {
    record PlaceTowerCommand(UUID gameId, TowerType towerType, int x, int y) {}
    Tower placeTower(PlaceTowerCommand command);
}
```

Ce `PlaceTowerCommand` est une petite application du **pattern Command** : on encapsule "une action à exécuter avec ses paramètres" dans un objet, plutôt que de passer 4 arguments bruts à une méthode. Ça rend les signatures stables même si les paramètres internes évoluent.

**Port "out"** (`domain/port/out`) : ce dont le domaine a *besoin* du monde extérieur, typiquement la persistance — mais vue avec le vocabulaire du domaine, pas celui de la base de données. Exemple, `GameRepository` :

```java
public interface GameRepository {
    Optional<GameMap> findMapByGameId(UUID gameId);
    void saveMap(UUID gameId, GameMap map);
}
```

Le domaine appelle cette interface sans savoir si, derrière, il y a PostgreSQL, un fichier, ou une base en mémoire pour les tests. C'est l'inversion de dépendance classique : c'est le domaine qui définit l'interface dont il a besoin, et c'est la couche infrastructure qui doit s'y conformer — pas l'inverse.

## 4. L'infrastructure : le monde extérieur

### 4.1 Les Adapters — relier les ports à la vraie technologie

Un **Adapter**, au sens du pattern du même nom, est une classe qui implémente un port du domaine en s'appuyant sur une technologie concrète. `GameRepositoryAdapter` (dans `infrastructure/persistence/repository`) implémente le port `GameRepository` en utilisant Spring Data JPA en coulisses :

```java
@Component
public class GameRepositoryAdapter implements GameRepository {
    private final CastleJpaRepository castleJpaRepository;
    private final GameMapMapper gameMapMapper;

    public Optional<GameMap> findMapByGameId(UUID gameId) {
        return castleJpaRepository.findById(gameId)
                .map(castle -> gameMapMapper.fromJson(castle.getMapState()));
    }
    // ...
}
```

Le domaine ne voit jamais `CastleJpaRepository` ni `GameMapMapper` : il appelle juste `gameRepository.findMapByGameId(...)`. Si demain on remplace PostgreSQL par autre chose, seul cet Adapter change — aucune ligne du domaine n'est touchée. `PlayerRepositoryAdapter` suit exactement le même principe pour le port `PlayerRepository`.

### 4.2 Le pattern Repository — la persistance brute

Sous l'Adapter, on trouve les vraies interfaces Spring Data JPA (`GameJpaRepository`, `CastleJpaRepository`, `PlayerJpaRepository`) — c'est le **pattern Repository** fourni "gratuitement" par Spring Data : on déclare juste une interface qui étend `JpaRepository<Entité, TypeId>`, et Spring génère l'implémentation (les `save`, `findById`, etc.) au démarrage, sans qu'on écrive de SQL pour les cas simples :

```java
public interface GameJpaRepository extends JpaRepository<GameEntity, UUID> {
    List<GameEntity> findAllByPlayerIdOrderByStartedAtDesc(UUID playerId);
}
```

Cette interface ne fait *pas* partie du domaine — elle vit dans `infrastructure/persistence/repository`, et seul l'Adapter (4.1) y a accès. Le domaine ne connaît que `GameRepository` (le port).

### 4.3 Entités JPA vs modèle du domaine — deux objets, pas un seul

Point important pour un néophyte : il y a **deux représentations différentes** pour un même concept, et c'est volontaire.

- `GameEntity`, `CastleEntity`, `PlayerEntity` (dans `infrastructure/persistence/entity`) sont des classes annotées `@Entity` / `@Column`, qui décrivent une **table SQL**. Elles n'ont aucune logique de jeu, ce sont des conteneurs de données pour Hibernate.
- `Castle`, `Tower`, `Wave` (dans `domain/model`) sont les objets du **domaine**, avec leur logique métier, et n'ont aucune annotation JPA.

Pourquoi ne pas fusionner les deux ? Parce que ça lierait le modèle de la base de données (qui doit pouvoir évoluer pour des raisons techniques : index, normalisation...) au modèle métier (qui doit pouvoir évoluer pour des raisons de gameplay) — deux choses qui changent pour des raisons différentes ne doivent pas être la même classe.

Le cas le plus parlant est `GameMap` : son état (tours posées, dimensions, chemin) est un objet du domaine, mais il est stocké en base comme une simple colonne JSON (`CastleEntity.mapState`, typée `jsonb` côté PostgreSQL). La conversion entre les deux est un **Mapper** dédié, `GameMapMapper` :

```java
@Component
public class GameMapMapper {
    public Map<String, Object> toJson(GameMap map) { ... }   // domaine -> JSON
    public GameMap fromJson(Map<String, Object> json) { ... } // JSON -> domaine
}
```

Le code de `toJson`/`fromJson` contient d'ailleurs des commentaires sur des bugs de migration déjà rencontrés (réutiliser l'id d'une tour, gérer l'absence d'un champ `hp` sur une vieille partie) — un bon exemple de pourquoi cette conversion mérite sa propre classe testée plutôt que d'être éparpillée.

Le schéma de la base lui-même évolue par **migrations Flyway** (`backend/src/main/resources/db/migration/V1__..sql`, `V2__...`, etc.) : Hibernate est configuré en `ddl-auto: validate`, donc il ne modifie jamais le schéma automatiquement — toute évolution (ajouter une colonne, par exemple `seed` sur `games`) passe par un fichier de migration versionné.

### 4.4 Les Controllers — la porte d'entrée HTTP

Les controllers (`infrastructure/web/controller`) sont volontairement **fins** ("thin controllers") : ils ne contiennent aucune règle de jeu, juste de la traduction HTTP <-> appel de use case. `GameController.placeTower` :

```java
@PostMapping("/{gameId}/towers")
public ResponseEntity<TowerResponse> placeTower(
        @PathVariable UUID gameId,
        @Valid @RequestBody PlaceTowerRequest request,
        Authentication auth) {
    Tower tower = gameService.placeTower(
            new PlaceTowerCommand(gameId, request.towerType(), request.x(), request.y()));
    return ResponseEntity.status(HttpStatus.CREATED).body(TowerResponse.from(tower));
}
```

Trois lignes : on transforme le DTO de requête en `Command` (le port "in", voir 3.3), on appelle le service, on transforme le résultat en DTO de réponse. Toute la vraie logique (vérifier l'or, le déblocage, la géométrie) est ailleurs.

### 4.5 Les DTOs — ne jamais exposer le domaine ou les entités directement

`PlaceTowerRequest`, `CreateGameRequest`, `TowerResponse`, `GameResponse`, `WaveResponse` (dans `infrastructure/web/dto`) sont des **DTO** (Data Transfer Objects) : des `record` Java simples, dont le seul rôle est de définir la forme exacte du JSON échangé avec le frontend. Deux raisons de ne jamais renvoyer directement une entité JPA ou un objet du domaine en réponse HTTP :

1. **Découplage** : le contrat JSON de l'API peut évoluer indépendamment du modèle interne (ajouter/renommer un champ DTO sans toucher au domaine, ou inversement).
2. **Sécurité/propreté** : une entité JPA traîne des relations (`@ManyToOne`), parfois chargées paresseusement (lazy) — la sérialiser directement peut planter ou fuiter des données non voulues.

Les DTO de requête portent les annotations de validation Bean Validation (`@NotBlank`, `@Min`, `@NotNull`), vérifiées automatiquement par Spring grâce à `@Valid` dans la signature du controller, avant même d'atteindre la logique métier.

Les DTO de réponse utilisent une **méthode de fabrique statique** `from(...)` (`TowerResponse.from(tower)`, `GameResponse.from(state)`) plutôt qu'un constructeur appelé depuis le controller — un mini pattern **Factory Method** qui centralise la conversion domaine → DTO au même endroit que la définition du DTO, plutôt que de l'éparpiller dans chaque controller qui en a besoin.

### 4.6 Gestion centralisée des erreurs

`GlobalExceptionHandler`, annoté `@RestControllerAdvice`, intercepte les exceptions levées n'importe où dans le code (typiquement depuis le domaine, qui lève des exceptions métier comme `InsufficientGoldException` ou `CellOccupiedException`) et les traduit en réponse HTTP avec le bon code de statut :

```java
@ExceptionHandler(InsufficientGoldException.class)
public ResponseEntity<Map<String, String>> handleInsufficientGold(InsufficientGoldException ex) {
    return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(Map.of("error", ex.getMessage()));
}
```

Avantage : le domaine se contente de lever une exception qui porte du sens métier (`InsufficientGoldException`, pas un vague `RuntimeException`), sans jamais savoir ce qu'est un code HTTP 402 — encore une fois, la couche infrastructure traduit, le domaine reste ignorant de la technique.

### 4.7 Sécurité et JWT

`SecurityConfig` configure Spring Security en mode **stateless** (pas de session serveur, chaque requête doit porter son propre jeton). `JwtAuthFilter` est un filtre Servlet (`OncePerRequestFilter`) inséré dans la chaîne de filtres Spring Security — c'est un exemple concret du pattern **Chain of Responsibility** déjà fourni par le framework : chaque filtre de la chaîne peut traiter la requête puis la transmettre au suivant. Ici, le filtre lit l'en-tête `Authorization: Bearer ...`, décode le JWT via `JwtTokenFactory`, et place l'identité du joueur dans le contexte de sécurité (`SecurityContextHolder`) — c'est ce qui permet ensuite à n'importe quel controller de récupérer `auth.getName()` pour obtenir le `playerId` de l'utilisateur courant, sans jamais revalider le mot de passe à chaque requête.

## 5. La couche application — l'orchestrateur

`application/usecase` contient `GameService` et `AuthService`, deux classes Spring `@Service`. C'est la couche qui **orchestre** : elle ne contient pas elle-même les règles fines du jeu (ça, c'est le domaine), mais elle sait dans quel ordre appeler les choses, gère les transactions (`@Transactional`), et fait le pont entre plusieurs entités/services à la fois.

Exemple révélateur, `GameService.placeTower` : la validation géométrique du placement (case libre, ne bloque pas le chemin) est déléguée au domaine (`PlaceTowerService`, qui implémente le port `PlaceTowerUseCase`), mais la vérification et le débit de l'or — qui nécessite de connaître à la fois le `GameEntity` (solde de la partie) et la règle de déblocage par palier — est faite directement dans `GameService`, parce que ça touche plusieurs aggregats à la fois (le joueur, la partie, la tour). C'est typique du rôle d'un "service applicatif" dans la littérature hexagonale : il coordonne, le domaine décide des règles.

`GameService.startWave` illustre bien tout l'enchaînement des couches pour une seule action :

1. Charge `GameEntity` et la `GameMap` (via le port `GameRepository`, donc en passant par l'Adapter puis JPA).
2. Demande au domaine de générer la vague (`waveFactory.createWave(...)`, avec le seed de la partie).
3. Demande au domaine de simuler la vague tick par tick (`waveSimulationService.simulate(...)`).
4. Persiste les conséquences (map mise à jour si une tour a été détruite, PV du château, or gagné, numéro de vague, meilleur score du joueur).
5. Retourne un `StartWaveResult` (le type de retour défini par le port `StartWaveUseCase`), que le controller transforme ensuite en `WaveResponse`.

C'est l'orchestration complète d'une requête, sans qu'aucune des étapes 2 et 3 (la vraie logique de jeu) ne sache qu'elle est appelée depuis un contexte HTTP transactionnel.

## 6. Le flux complet d'une requête, de bout en bout

Exemple : le frontend pose une tour (`POST /api/v1/games/{gameId}/towers`).

```
Frontend (HTTP + JSON)
   │
   ▼
JwtAuthFilter            → vérifie le token, identifie le joueur
   │
   ▼
GameController           → désérialise PlaceTowerRequest (DTO), construit PlaceTowerCommand
   │
   ▼
GameService               (couche application)
   │  - vérifie l'or et le déblocage de palier (logique applicative)
   │  - délègue la validation géométrique à PlaceTowerService (domaine)
   ▼
PlaceTowerService          (domaine, implémente le port PlaceTowerUseCase)
   │  - crée un Tower, l'ajoute à la GameMap, vérifie le pathfinding
   ▼
GameRepository (port out)  → implémenté par GameRepositoryAdapter
   │
   ▼
GameMapMapper              → sérialise la GameMap en JSON
   │
   ▼
CastleJpaRepository (JPA)  → écrit en base PostgreSQL (colonne map_state, jsonb)
   │
   ▼
GameController              → TowerResponse.from(tower) → JSON renvoyé au frontend
```

Chaque flèche traverse une frontière de couche, et à chaque frontière, l'objet qui circule change de forme (DTO → Command → objet domaine → JSON de persistance) — c'est exactement le but de l'architecture : chaque couche a sa propre représentation, adaptée à son métier.

## 7. Récapitulatif des design patterns utilisés (et où les trouver)

| Pattern | Où | À quoi il sert ici |
|---|---|---|
| **Hexagonal / Ports & Adapters** | Toute l'organisation `domain` / `application` / `infrastructure` | Isoler les règles du jeu de la technique (HTTP, JPA), pour pouvoir les tester et les faire évoluer sans tout casser. |
| **Adapter** | `GameRepositoryAdapter`, `PlayerRepositoryAdapter` | Faire parler un port du domaine (interface) avec une techno concrète (JPA), sans que le domaine la connaisse. |
| **Repository** | `GameJpaRepository`, `CastleJpaRepository`, `PlayerJpaRepository` | Accès aux données sans écrire de SQL pour les cas simples (fourni par Spring Data). |
| **DTO (Data Transfer Object)** | `infrastructure/web/dto/*` | Définir un contrat JSON stable, découplé du modèle domaine et des entités JPA. |
| **Factory Method** | `TowerResponse.from(...)`, `GameResponse.from(...)`, `WaveFactory.createWave(...)` | Centraliser la construction d'un objet (DTO ou vague de jeu) à un seul endroit. |
| **Command** | `PlaceTowerCommand`, `UpgradeTowerCommand`, `StartWaveCommand` (records imbriqués dans les ports "in") | Encapsuler une action et ses paramètres dans un seul objet passé au use case. |
| **Composite** | `WaveSegment`, `EnemyBurst`, `SequentialSegments`, `ThreatBudgetMix`, `WeightedChoice` (`domain/service`) | Composer la génération d'une vague d'ennemis à partir de briques combinables (voir `docs/GAME_DESIGN.md` §2.2), extensible à de futurs boss sans toucher au reste. |
| **Chain of Responsibility** | `JwtAuthFilter` dans la chaîne de filtres Spring Security | Authentifier la requête avant qu'elle n'atteigne le controller, de façon additive et indépendante des autres filtres. |
| **Polymorphisme par énumération** | `TowerType`, `EnemyType`, `DamageType` | Donner un comportement différent par "type" sans créer une hiérarchie de sous-classes Java. |
| **Centralized Exception Handling** (idiome Spring) | `GlobalExceptionHandler` (`@RestControllerAdvice`) | Traduire les exceptions métier du domaine en codes HTTP appropriés, à un seul endroit. |

## 8. Comment raconter ça en une minute à quelqu'un

"Le backend est découpé en trois couches. Au centre, le domaine contient toutes les règles du jeu — tours, ennemis, vagues, économie — sans rien savoir de la base de données ni du web. Autour, la couche application orchestre les actions (créer une partie, poser une tour, lancer une vague) en coordonnant le domaine et la persistance. Et tout autour, l'infrastructure s'occupe de la technique : les controllers traduisent le HTTP, les DTO définissent le format JSON, les entités JPA et leurs mappers s'occupent de la base PostgreSQL. Le domaine ne parle jamais directement à la base ou au web : il définit des interfaces ('ports'), et c'est l'infrastructure qui les implémente ('adapters'). Ça permet de tester toute la logique de jeu sans serveur ni base de données, et de faire évoluer la technique (changer de base, ajouter un autre frontend) sans toucher aux règles du jeu."
