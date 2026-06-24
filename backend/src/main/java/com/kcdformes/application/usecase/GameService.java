package com.kcdformes.application.usecase;

import com.kcdformes.domain.model.*;
import com.kcdformes.domain.port.in.command.PlaceTowerUseCase;
import com.kcdformes.domain.port.in.command.StartWaveUseCase;
import com.kcdformes.domain.port.in.query.GetGameStateUseCase;
import com.kcdformes.domain.service.PathfindingService;
import com.kcdformes.domain.service.PlaceTowerService;
import com.kcdformes.domain.service.WaveFactory;
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

import java.util.Map;
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

    public GameService(GameJpaRepository gameJpaRepository,
                       CastleJpaRepository castleJpaRepository,
                       PlayerJpaRepository playerJpaRepository,
                       GameMapMapper gameMapMapper,
                       GameRepositoryAdapter gameRepositoryAdapter,
                       PlayerRepositoryAdapter playerRepositoryAdapter,
                       PathfindingService pathfindingService,
                       WaveFactory waveFactory) {
        this.gameJpaRepository = gameJpaRepository;
        this.castleJpaRepository = castleJpaRepository;
        this.playerJpaRepository = playerJpaRepository;
        this.gameMapMapper = gameMapMapper;
        this.gameRepositoryAdapter = gameRepositoryAdapter;
        this.playerRepositoryAdapter = playerRepositoryAdapter;
        this.pathfindingService = pathfindingService;
        this.waveFactory = waveFactory;
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
    public Tower placeTower(PlaceTowerCommand command) {
        GameEntity game = gameJpaRepository.findById(command.gameId())
                .orElseThrow(() -> new IllegalArgumentException("Game not found: " + command.gameId()));

        PlaceTowerCommand castleCommand = new PlaceTowerCommand(
                game.getCastle().getId(),
                command.towerType(),
                command.x(),
                command.y()
        );

        PlaceTowerService service = new PlaceTowerService(
                gameRepositoryAdapter, playerRepositoryAdapter, pathfindingService);
        return service.placeTower(castleCommand);
    }
    @Override
    public Wave startWave(StartWaveCommand command) {
        GameEntity game = gameJpaRepository.findById(command.gameId())
                .orElseThrow(() -> new IllegalArgumentException("Game not found: " + command.gameId()));

        int nextWave = game.getWaveNumber() + 1;
        Position spawn = new Position(0, 7);
        Wave wave = waveFactory.createWave(nextWave, spawn);
        wave.start();

        game.setWaveNumber(nextWave);
        gameJpaRepository.save(game);

        return wave;
    }

    @Override
    public GameStateResult getGameState(UUID gameId) {
        GameEntity game = gameJpaRepository.findById(gameId)
                .orElseThrow(() -> new IllegalArgumentException("Game not found: " + gameId));

        GameMap map = gameRepositoryAdapter.findMapByGameId(game.getCastle().getId())
                .orElseThrow(() -> new IllegalArgumentException("Map not found for game: " + gameId));

        return new GameStateResult(
                game.getId(),
                map,
                game.getWaveNumber(),
                game.getGoldEarned(),
                game.getStatus()
        );
    }
}
