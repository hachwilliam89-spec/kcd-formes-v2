package com.kcdformes.application.usecase;

import com.kcdformes.domain.exception.InsufficientGoldException;
import com.kcdformes.domain.model.*;
import com.kcdformes.domain.port.in.command.PlaceTowerUseCase;
import com.kcdformes.domain.port.in.command.StartWaveUseCase;
import com.kcdformes.domain.port.in.query.GetGameStateUseCase;
import com.kcdformes.domain.port.out.PlayerRepository.PlayerData;
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
        return gameJpaRepository.save(game);
    }

    @Override
    @Transactional
    public Tower placeTower(PlaceTowerCommand command) {
        GameEntity game = gameJpaRepository.findById(command.gameId())
                .orElseThrow(() -> new IllegalArgumentException("Game not found: " + command.gameId()));

        UUID playerId = game.getPlayer().getId();
        int cost = command.towerType().baseCost;
        PlayerData player = playerRepositoryAdapter.findById(playerId)
                .orElseThrow(() -> new IllegalArgumentException("Player not found: " + playerId));

        if (player.gold() < cost) {
            throw new InsufficientGoldException(cost, player.gold());
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

        // Le placement n'a pas levé d'exception : on débite le coût de la tour.
        playerRepositoryAdapter.updateGold(playerId, player.gold() - cost);

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

        // Persiste les effets de la vague : vie du château, or du joueur, statut de partie.
        castleEntity.setHp(castle.getHp());
        castleJpaRepository.save(castleEntity);

        PlayerEntity player = game.getPlayer();
        player.setGold(player.getGold() + result.goldEarned());
        playerJpaRepository.save(player);

        game.setWaveNumber(nextWave);
        game.setGoldEarned(game.getGoldEarned() + result.goldEarned());
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
                game.getGoldEarned(),
                game.getStatus(),
                game.getCastle().getHp(),
                100
        );
    }
}
