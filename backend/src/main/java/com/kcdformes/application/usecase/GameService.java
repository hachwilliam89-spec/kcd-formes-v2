package com.kcdformes.application.usecase;

import com.kcdformes.domain.exception.BonusChoicePendingException;
import com.kcdformes.domain.exception.GameAlreadyFinishedException;
import com.kcdformes.domain.exception.InsufficientGoldException;
import com.kcdformes.domain.exception.TowerNotUnlockedException;
import com.kcdformes.domain.model.*;
import com.kcdformes.domain.port.in.command.ChooseBonusUseCase;
import com.kcdformes.domain.port.in.command.PlaceTowerUseCase;
import com.kcdformes.domain.port.in.command.SetTargetingModeUseCase;
import com.kcdformes.domain.port.in.command.StartWaveUseCase;
import com.kcdformes.domain.port.in.command.UpgradeTowerUseCase;
import com.kcdformes.domain.port.in.query.GetGameStateUseCase;
import com.kcdformes.domain.service.PathfindingService;
import com.kcdformes.domain.service.PlaceTowerService;
import com.kcdformes.domain.service.UpgradeTowerService;
import com.kcdformes.domain.service.WaveFactory;
import com.kcdformes.domain.service.WaveSimulationService;
import com.kcdformes.infrastructure.persistence.entity.CastleEntity;
import com.kcdformes.infrastructure.persistence.entity.GameEntity;
import com.kcdformes.infrastructure.persistence.entity.PlayerEntity;
import com.kcdformes.infrastructure.persistence.mapper.GameMapMapper;
import com.kcdformes.infrastructure.persistence.repository.CastleJpaRepository;
import com.kcdformes.infrastructure.persistence.repository.GameJpaRepository;
import com.kcdformes.infrastructure.persistence.repository.GameRepositoryAdapter;
import com.kcdformes.infrastructure.persistence.repository.PlayerJpaRepository;
import com.kcdformes.infrastructure.persistence.repository.PlayerRepositoryAdapter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class GameService implements PlaceTowerUseCase, StartWaveUseCase, GetGameStateUseCase,
        UpgradeTowerUseCase, ChooseBonusUseCase, SetTargetingModeUseCase {

    /**
     * Or accordé à chaque nouvelle partie. Pas de report d'une partie à l'autre.
     * Remonté de 100 à 250 (retour d'expérience) : 100 ne permettait de poser
     * qu'1-2 tours d'entrée de gamme, ce qui rendait les premières vagues trop
     * punitives avant même d'avoir pu réinvestir de l'or gagné en jeu.
     */
    private static final int STARTING_GOLD = 250;

    /** Cadence des paliers de bonus (voir BonusType) : toutes les BONUS_MILESTONE_INTERVAL vagues. */
    private static final int BONUS_MILESTONE_INTERVAL = 5;

    /**
     * Montant de base du bonus GOLD_INJECTION, multiplié par la vague atteinte :
     * une valeur fixe deviendrait négligeable en milieu/fin de partie, alors que
     * l'or gagné par vague croît avec le nombre d'ennemis (voir WaveFactory) et
     * leurs goldReward (voir EnemyType).
     */
    private static final int GOLD_INJECTION_PER_WAVE = 40;

    private final GameJpaRepository gameJpaRepository;
    private final CastleJpaRepository castleJpaRepository;
    private final PlayerJpaRepository playerJpaRepository;
    private final GameMapMapper gameMapMapper;
    private final GameRepositoryAdapter gameRepositoryAdapter;
    private final PlayerRepositoryAdapter playerRepositoryAdapter;
    private final PathfindingService pathfindingService;
    private final WaveFactory waveFactory;
    private final WaveSimulationService waveSimulationService;

    public GameService(GameJpaRepository gameJpaRepository,
                       CastleJpaRepository castleJpaRepository,
                       PlayerJpaRepository playerJpaRepository,
                       GameMapMapper gameMapMapper,
                       GameRepositoryAdapter gameRepositoryAdapter,
                       PlayerRepositoryAdapter playerRepositoryAdapter,
                       PathfindingService pathfindingService,
                       WaveFactory waveFactory,
                       WaveSimulationService waveSimulationService) {
        this.gameJpaRepository = gameJpaRepository;
        this.castleJpaRepository = castleJpaRepository;
        this.playerJpaRepository = playerJpaRepository;
        this.gameMapMapper = gameMapMapper;
        this.gameRepositoryAdapter = gameRepositoryAdapter;
        this.playerRepositoryAdapter = playerRepositoryAdapter;
        this.pathfindingService = pathfindingService;
        this.waveFactory = waveFactory;
        this.waveSimulationService = waveSimulationService;
    }

    @Transactional
    public GameEntity createGame(UUID playerId, String castleName) {
        PlayerEntity player = playerJpaRepository.findById(playerId)
                .orElseThrow(() -> new IllegalArgumentException("Player not found: " + playerId));

        // Crée le château avec une map initiale vide. Chemin serpentin "3 voies"
        // (tracé A) : le couloir descend en S sur toute la hauteur de la carte au
        // lieu d'une ligne droite, pour étaler l'action et rentabiliser plus de
        // positions de tours. Waypoints alignés deux à deux (segments droits) —
        // voir PathfindingService.findCorridorPath.
        // Voies aux lignes 3/8/13 : compromis pour que RIEN ne soit coupé par les
        // bords du canvas (qui fait pile la taille de la grille). En haut, 3 lignes
        // d'herbe pour le château de spawn et les tours (ancrés en bas, ils
        // débordent vers le HAUT) ; en bas, la ligne 14 sert de marge aux pieds des
        // ennemis de la voie basse.
        GameMap initialMap = new GameMap(20, 15, List.of(
                new Position(0, 3),   // spawn (haut-gauche)
                new Position(17, 3),  // voie haute -> droite
                new Position(17, 8),  // descente
                new Position(2, 8),   // voie médiane -> gauche
                new Position(2, 13),  // descente
                new Position(19, 13)  // château (bas-droite)
        ));

        CastleEntity castle = new CastleEntity();
        castle.setPlayer(player);
        castle.setName(castleName);
        castle.setMapState(gameMapMapper.toJson(initialMap));
        castle = castleJpaRepository.save(castle);

        GameEntity game = new GameEntity();
        game.setPlayer(player);
        game.setCastle(castle);
        game.setStatus("IN_PROGRESS");
        game.setGold(STARTING_GOLD);
        // Seed propre à cette partie : voir GameEntity.seed / WaveFactory pour son usage.
        game.setSeed(ThreadLocalRandom.current().nextLong());
        return gameJpaRepository.save(game);
    }

    /**
     * Charge une partie en vérifiant qu'elle appartient bien au joueur authentifié.
     * Une partie qui existe mais appartient à un autre joueur est traitée exactement
     * comme une partie inexistante (même exception, même message) : répondre
     * différemment (ex. 403) confirmerait à un attaquant que l'UUID visé existe.
     * Sans cette vérification, n'importe quel joueur connecté pouvait jouer, lire
     * ou saboter la partie d'un autre en connaissant son UUID (IDOR).
     */
    private GameEntity loadOwnedGame(UUID gameId, UUID playerId) {
        GameEntity game = gameJpaRepository.findById(gameId)
                .orElseThrow(() -> new IllegalArgumentException("Game not found: " + gameId));
        if (!game.getPlayer().getId().equals(playerId)) {
            throw new IllegalArgumentException("Game not found: " + gameId);
        }
        return game;
    }

    /**
     * Rejette toute action de jeu sur une partie terminée. Sans ce garde-fou, un
     * joueur pouvait relancer des vagues après une défaite et continuer à faire
     * monter son bestWave (voir GameAlreadyFinishedException).
     */
    private void requireInProgress(GameEntity game) {
        if (!"IN_PROGRESS".equals(game.getStatus())) {
            throw new GameAlreadyFinishedException(game.getId(), game.getStatus());
        }
    }

    @Override
    @Transactional
    public Tower placeTower(PlaceTowerCommand command) {
        GameEntity game = loadOwnedGame(command.gameId(), command.playerId());
        requireInProgress(game);

        // Déblocage par progression de compte (meilleure vague atteinte), indépendant
        // de l'or de la partie en cours.
        int requiredWave = command.towerType().unlockWave;
        int bestWave = game.getPlayer().getBestWave();
        if (requiredWave > bestWave) {
            throw new TowerNotUnlockedException(command.towerType(), bestWave);
        }

        int cost = command.towerType().baseCost;
        if (game.getGold() < cost) {
            throw new InsufficientGoldException(cost, game.getGold());
        }

        PlaceTowerCommand castleCommand = new PlaceTowerCommand(
                game.getCastle().getId(),
                command.playerId(),
                command.towerType(),
                command.x(),
                command.y()
        );

        PlaceTowerService service = new PlaceTowerService(
                gameRepositoryAdapter, playerRepositoryAdapter, pathfindingService);
        Tower tower = service.placeTower(castleCommand);

        // Le placement n'a pas levé d'exception : on débite le coût de la tour
        // du solde de la partie en cours (l'or ne vit plus au niveau du compte).
        game.setGold(game.getGold() - cost);
        gameJpaRepository.save(game);

        return tower;
    }

    @Override
    @Transactional
    public Tower upgradeTower(UpgradeTowerCommand command) {
        GameEntity game = loadOwnedGame(command.gameId(), command.playerId());
        requireInProgress(game);

        UUID castleId = game.getCastle().getId();
        GameMap map = gameRepositoryAdapter.findMapByGameId(castleId)
                .orElseThrow(() -> new IllegalArgumentException("Map not found for game: " + command.gameId()));

        Tower existing = map.getTowerById(command.towerId())
                .orElseThrow(() -> new IllegalArgumentException("Tower not found: " + command.towerId()));

        // Cap d'amélioration : une tour au niveau max ne peut plus être améliorée
        // (refusé ici avant tout débit d'or ; garde-fou aussi dans Tower.upgrade()).
        if (existing.isMaxLevel()) {
            throw new IllegalArgumentException("Tower already at max level: " + command.towerId());
        }

        // Coût calculé sur le niveau courant, avant l'incrément (voir Tower.getUpgradeCost) :
        // on doit le lire ici, avant que le service domaine n'appelle tower.upgrade().
        int cost = existing.getUpgradeCost();
        if (game.getGold() < cost) {
            throw new InsufficientGoldException(cost, game.getGold());
        }

        UpgradeTowerService service = new UpgradeTowerService(gameRepositoryAdapter);
        Tower tower = service.upgradeTower(new UpgradeTowerCommand(castleId, command.playerId(), command.towerId()));

        game.setGold(game.getGold() - cost);
        gameJpaRepository.save(game);

        return tower;
    }

    @Override
    @Transactional
    public Tower setTargetingMode(SetTargetingModeCommand command) {
        GameEntity game = loadOwnedGame(command.gameId(), command.playerId());
        requireInProgress(game);

        UUID castleId = game.getCastle().getId();
        GameMap map = gameRepositoryAdapter.findMapByGameId(castleId)
                .orElseThrow(() -> new IllegalArgumentException("Map not found for game: " + command.gameId()));
        Tower tower = map.getTowerById(command.towerId())
                .orElseThrow(() -> new IllegalArgumentException("Tower not found: " + command.towerId()));

        // Gratuit et réversible à volonté (hors combat) : le mode de ciblage est
        // un réglage tactique, pas un investissement — le rendre payant
        // découragerait l'expérimentation qui fait tout son intérêt.
        tower.setTargetingMode(command.mode());
        gameRepositoryAdapter.saveMap(castleId, map);

        return tower;
    }

    @Override
    @Transactional
    public StartWaveResult startWave(StartWaveCommand command) {
        GameEntity game = loadOwnedGame(command.gameId(), command.playerId());
        requireInProgress(game);

        // Un palier de bonus est en attente (voir BonusType / ChooseBonusUseCase) :
        // on bloque tout lancement de vague jusqu'à ce que le joueur ait choisi,
        // plutôt que de laisser le palier passer inaperçu.
        if (game.isAwaitingBonusChoice()) {
            throw new BonusChoicePendingException(game.getId());
        }

        CastleEntity castleEntity = game.getCastle();
        GameMap map = gameRepositoryAdapter.findMapByGameId(castleEntity.getId())
                .orElseThrow(() -> new IllegalArgumentException("Map not found for game: " + command.gameId()));

        int nextWave = game.getWaveNumber() + 1;
        // Seed de la partie (voir GameEntity.seed) : la composition de la vague varie
        // d'une partie à l'autre mais reste reproductible au sein de cette partie.
        Wave wave = waveFactory.createWave(nextWave, map.getPathStart(), game.getSeed());
        wave.start();

        Castle castle = new Castle(
                castleEntity.getId(), game.getPlayer().getId(), castleEntity.getName(),
                castleEntity.getHp(), 100, castleEntity.getLevel());

        WaveSimulationService.SimulationResult result = waveSimulationService.simulate(map, wave, castle);

        // Persiste la map : un Sapeur peut avoir détruit une tour pendant la
        // simulation (mutation de `map` en mémoire) — sans cette sauvegarde,
        // la tour détruite réapparaîtrait intacte au prochain chargement.
        gameRepositoryAdapter.saveMap(castleEntity.getId(), map);

        // Persiste les effets de la vague : vie du château, or de la partie, statut.
        castleEntity.setHp(castle.getHp());
        castleJpaRepository.save(castleEntity);

        // L'or gagné alimente le solde de cette partie, pas un solde de compte :
        // chaque run repart à zéro, aucun report entre parties.
        game.setGold(game.getGold() + result.goldEarned());
        game.setWaveNumber(nextWave);
        game.setGoldEarned(game.getGoldEarned() + result.goldEarned());

        // Progression de compte : seul le meilleur score (vague la plus loin jamais
        // atteinte) est conservé — jamais l'or. Mis à jour dès qu'une vague est
        // atteinte (pas seulement à la défaite), pour que les déblocages liés au
        // bestWave (ex. tours) s'appliquent immédiatement, en cours de partie.
        PlayerEntity player = game.getPlayer();
        if (nextWave > player.getBestWave()) {
            player.setBestWave(nextWave);
            playerJpaRepository.save(player);
        }

        if (castle.isDestroyed()) {
            game.setStatus("DEFEAT");
            // Horodatage de fin : jusqu'ici jamais renseigné (le champ existait
            // sans jamais être écrit) — nécessaire pour toute stat de durée de
            // partie et pour distinguer les parties abandonnées des vraies défaites.
            game.setEndedAt(OffsetDateTime.now());
        }

        // Palier de bonus toutes les BONUS_MILESTONE_INTERVAL vagues : inutile (et
        // trompeur) de le déclencher sur une défaite, la partie étant déjà finie.
        boolean milestoneReached = !castle.isDestroyed() && nextWave % BONUS_MILESTONE_INTERVAL == 0;
        if (milestoneReached) {
            game.setAwaitingBonusChoice(true);
        }
        gameJpaRepository.save(game);

        return new StartWaveResult(
                wave,
                result.ticks(),
                result.goldEarned(),
                castle.getHp(),
                castle.getMaxHp(),
                result.castleDamageTaken(),
                castle.isDestroyed(),
                game.getStatus(),
                milestoneReached,
                milestoneReached ? List.of(BonusType.values()) : List.of()
        );
    }

    @Override
    @Transactional
    public ChooseBonusResult chooseBonus(ChooseBonusCommand command) {
        GameEntity game = loadOwnedGame(command.gameId(), command.playerId());
        requireInProgress(game);

        if (!game.isAwaitingBonusChoice()) {
            throw new IllegalStateException("No bonus choice pending for game: " + command.gameId());
        }

        CastleEntity castleEntity = game.getCastle();

        switch (command.bonusType()) {
            case GOLD_INJECTION -> game.setGold(game.getGold() + game.getWaveNumber() * GOLD_INJECTION_PER_WAVE);
            case CASTLE_REPAIR -> castleEntity.setHp(100);
            case TOWER_REPAIR -> {
                GameMap map = gameRepositoryAdapter.findMapByGameId(castleEntity.getId())
                        .orElseThrow(() -> new IllegalArgumentException(
                                "Map not found for game: " + command.gameId()));
                // Tower.repair() mute les instances détenues par `map` (même référence
                // que celles retournées par getTowers()) : saveMap ci-dessous persiste
                // donc bien les PV restaurés.
                map.getTowers().forEach(Tower::repair);
                gameRepositoryAdapter.saveMap(castleEntity.getId(), map);
            }
        }

        game.setAwaitingBonusChoice(false);
        gameJpaRepository.save(game);
        castleJpaRepository.save(castleEntity);

        return new ChooseBonusResult(command.bonusType(), game.getGold(), castleEntity.getHp(), 100);
    }

    @Override
    @Transactional(readOnly = true)
    public GameStateResult getGameState(UUID gameId, UUID playerId) {
        GameEntity game = loadOwnedGame(gameId, playerId);

        GameMap map = gameRepositoryAdapter.findMapByGameId(game.getCastle().getId())
                .orElseThrow(() -> new IllegalArgumentException("Map not found for game: " + gameId));

        return new GameStateResult(
                game.getId(),
                game.getCastle().getId(),
                map,
                game.getWaveNumber(),
                game.getGold(),
                game.getStatus(),
                game.getCastle().getHp(),
                100,
                game.isAwaitingBonusChoice(),
                // Mêmes options que startWave au moment du palier : indispensable
                // pour re-proposer un choix COMPLET après un rechargement de page
                // survenu pendant qu'un palier était en attente.
                game.isAwaitingBonusChoice() ? List.of(BonusType.values()) : List.of()
        );
    }
}
