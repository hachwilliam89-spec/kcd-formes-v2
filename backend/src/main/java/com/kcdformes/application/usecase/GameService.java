package com.kcdformes.application.usecase;

import com.kcdformes.domain.exception.InsufficientGoldException;
import com.kcdformes.domain.exception.TowerNotUnlockedException;
import com.kcdformes.domain.model.*;
import com.kcdformes.domain.port.in.command.PlaceTowerUseCase;
import com.kcdformes.domain.port.in.command.StartWaveUseCase;
import com.kcdformes.domain.port.in.query.GetGameStateUseCase;
import com.kcdformes.domain.service.PathfindingService;
import com.kcdformes.domain.service.PlaceTowerService;
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

import java.util.UUID;

@Service
public class GameService implements PlaceTowerUseCase, StartWaveUseCase, GetGameStateUseCase {

    /**
     * Or accordé à chaque nouvelle partie. Pas de report d'une partie à l'autre.
     * Volontairement serré (juste de quoi poser 1-2 tours d'entrée de gamme) :
     * un capital de départ trop généreux permettait de saturer le chemin dès le
     * début et de tenir indéfiniment sans jamais avoir à réinvestir l'or gagné.
     */
    private static final int STARTING_GOLD = 100;

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

        // Crée le château avec une map initiale vide
        GameMap initialMap = new GameMap(20, 15,
                new Position(0, 7), new Position(19, 7));

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
        return gameJpaRepository.save(game);
    }

    @Override
    @Transactional
    public Tower placeTower(PlaceTowerCommand command) {
        GameEntity game = gameJpaRepository.findById(command.gameId())
                .orElseThrow(() -> new IllegalArgumentException("Game not found: " + command.gameId()));

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
    public StartWaveResult startWave(StartWaveCommand command) {
        GameEntity game = gameJpaRepository.findById(command.gameId())
                .orElseThrow(() -> new IllegalArgumentException("Game not found: " + command.gameId()));

        CastleEntity castleEntity = game.getCastle();
        GameMap map = gameRepositoryAdapter.findMapByGameId(castleEntity.getId())
                .orElseThrow(() -> new IllegalArgumentException("Map not found for game: " + command.gameId()));

        int nextWave = game.getWaveNumber() + 1;
        Wave wave = waveFactory.createWave(nextWave, map.getPathStart());
        wave.start();

        Castle castle = new Castle(
                castleEntity.getId(), game.getPlayer().getId(), castleEntity.getName(),
                castleEntity.getHp(), 100, castleEntity.getLevel());

        WaveSimulationService.SimulationResult result = waveSimulationService.simulate(map, wave, castle);

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
                game.getStatus()
        );
    }

    @Override
    @Transactional(readOnly = true)
    public GameStateResult getGameState(UUID gameId) {
        GameEntity game = gameJpaRepository.findById(gameId)
                .orElseThrow(() -> new IllegalArgumentException("Game not found: " + gameId));

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
                100
        );
    }
}
