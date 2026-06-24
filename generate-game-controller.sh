#!/bin/bash
# KCD Formes v2 — Adaptateurs JPA + GameController
# Lance depuis ~/kcd-formes-v2

BASE="backend/src/main/java/com/kcdformes"

echo "🎮 Génération adaptateurs JPA + GameController..."

# ── GameRepositoryAdapter.java (Adapter pattern) ──────────────────────────
cat > $BASE/infrastructure/persistence/repository/GameRepositoryAdapter.java << 'EOF'
package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.port.out.GameRepository;
import com.kcdformes.infrastructure.persistence.entity.CastleEntity;
import com.kcdformes.infrastructure.persistence.mapper.GameMapMapper;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/**
 * Adapter pattern — adapte le port out GameRepository vers la persistence JPA.
 * Le domaine ne connaît pas JPA, il ne voit que l'interface GameRepository.
 */
@Component
public class GameRepositoryAdapter implements GameRepository {

    private final CastleJpaRepository castleJpaRepository;
    private final GameMapMapper gameMapMapper;

    public GameRepositoryAdapter(CastleJpaRepository castleJpaRepository,
                                  GameMapMapper gameMapMapper) {
        this.castleJpaRepository = castleJpaRepository;
        this.gameMapMapper = gameMapMapper;
    }

    @Override
    public Optional<GameMap> findMapByGameId(UUID gameId) {
        return castleJpaRepository.findById(gameId)
                .map(castle -> gameMapMapper.fromJson(castle.getMapState()));
    }

    @Override
    public void saveMap(UUID gameId, GameMap map) {
        castleJpaRepository.findById(gameId).ifPresent(castle -> {
            castle.setMapState(gameMapMapper.toJson(map));
            castleJpaRepository.save(castle);
        });
    }
}
EOF

# ── PlayerRepositoryAdapter.java ──────────────────────────────────────────
cat > $BASE/infrastructure/persistence/repository/PlayerRepositoryAdapter.java << 'EOF'
package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.domain.port.out.PlayerRepository;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/**
 * Adapter pattern — adapte le port out PlayerRepository vers JPA.
 */
@Component
public class PlayerRepositoryAdapter implements PlayerRepository {

    private final PlayerJpaRepository playerJpaRepository;

    public PlayerRepositoryAdapter(PlayerJpaRepository playerJpaRepository) {
        this.playerJpaRepository = playerJpaRepository;
    }

    @Override
    public Optional<PlayerData> findById(UUID id) {
        return playerJpaRepository.findById(id)
                .map(p -> new PlayerData(p.getId(), p.getUsername(), p.getGold(), p.getElo()));
    }

    @Override
    public void updateGold(UUID playerId, int newGold) {
        playerJpaRepository.findById(playerId).ifPresent(p -> {
            p.setGold(newGold);
            playerJpaRepository.save(p);
        });
    }

    @Override
    public void updateElo(UUID playerId, int newElo) {
        playerJpaRepository.findById(playerId).ifPresent(p -> {
            p.setElo(newElo);
            playerJpaRepository.save(p);
        });
    }
}
EOF

# ── GameService.java (orchestration) ─────────────────────────────────────
cat > $BASE/application/usecase/GameService.java << 'EOF'
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
        PlaceTowerService service = new PlaceTowerService(
                gameRepositoryAdapter, playerRepositoryAdapter, pathfindingService);
        return service.placeTower(command);
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
EOF

# ── Beans Spring pour les services domaine ────────────────────────────────
cat > $BASE/infrastructure/config/DomainConfig.java << 'EOF'
package com.kcdformes.infrastructure.config;

import com.kcdformes.domain.service.PathfindingService;
import com.kcdformes.domain.service.WaveFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Déclare les services domaine purs comme beans Spring.
 * Ils n'ont pas @Component car le domaine ne dépend pas de Spring.
 */
@Configuration
public class DomainConfig {

    @Bean
    public PathfindingService pathfindingService() {
        return new PathfindingService();
    }

    @Bean
    public WaveFactory waveFactory() {
        return new WaveFactory();
    }
}
EOF

# ── DTOs Game ─────────────────────────────────────────────────────────────
cat > $BASE/infrastructure/web/dto/CreateGameRequest.java << 'EOF'
package com.kcdformes.infrastructure.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateGameRequest(
        @NotBlank @Size(max = 100) String castleName
) {}
EOF

cat > $BASE/infrastructure/web/dto/GameResponse.java << 'EOF'
package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.GameMap;
import com.kcdformes.infrastructure.persistence.entity.GameEntity;

import java.util.List;
import java.util.UUID;

public record GameResponse(
        UUID gameId,
        UUID castleId,
        String status,
        int waveNumber,
        int gold,
        MapResponse map
) {
    public record MapResponse(
            int width,
            int height,
            List<TowerResponse> towers
    ) {}

    public static GameResponse from(GameEntity game, GameMap map) {
        List<TowerResponse> towers = map.getTowers().stream()
                .map(TowerResponse::from)
                .toList();

        return new GameResponse(
                game.getId(),
                game.getCastle().getId(),
                game.getStatus(),
                game.getWaveNumber(),
                game.getGoldEarned(),
                new MapResponse(map.getWidth(), map.getHeight(), towers)
        );
    }
}
EOF

cat > $BASE/infrastructure/web/dto/WaveResponse.java << 'EOF'
package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.Wave;

import java.util.UUID;

public record WaveResponse(
        UUID waveId,
        int number,
        int enemyCount,
        String status
) {
    public static WaveResponse from(Wave wave) {
        return new WaveResponse(
                wave.getId(),
                wave.getNumber(),
                wave.getEnemies().size(),
                wave.getStatus().name()
        );
    }
}
EOF

# ── GameController.java ───────────────────────────────────────────────────
cat > $BASE/infrastructure/web/controller/GameController.java << 'EOF'
package com.kcdformes.infrastructure.web.controller;

import com.kcdformes.application.usecase.GameService;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.Wave;
import com.kcdformes.domain.port.in.command.PlaceTowerUseCase.PlaceTowerCommand;
import com.kcdformes.domain.port.in.command.StartWaveUseCase.StartWaveCommand;
import com.kcdformes.domain.port.in.query.GetGameStateUseCase.GameStateResult;
import com.kcdformes.infrastructure.config.JwtTokenFactory;
import com.kcdformes.infrastructure.persistence.entity.GameEntity;
import com.kcdformes.infrastructure.web.dto.*;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/games")
public class GameController {

    private final GameService gameService;
    private final JwtTokenFactory jwtTokenFactory;

    public GameController(GameService gameService, JwtTokenFactory jwtTokenFactory) {
        this.gameService = gameService;
        this.jwtTokenFactory = jwtTokenFactory;
    }

    @PostMapping
    public ResponseEntity<GameResponse> createGame(
            @Valid @RequestBody CreateGameRequest request,
            Authentication auth) {
        UUID playerId = extractPlayerId(auth);
        GameEntity game = gameService.createGame(playerId, request.castleName());
        GameStateResult state = gameService.getGameState(game.getId());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(GameResponse.from(game, state.map()));
    }

    @GetMapping("/{gameId}")
    public ResponseEntity<GameResponse> getGame(@PathVariable UUID gameId, Authentication auth) {
        GameStateResult state = gameService.getGameState(gameId);
        GameEntity game = new GameEntity();
        game.setId(gameId);
        game.setStatus(state.status());
        game.setWaveNumber(state.waveNumber());
        game.setGoldEarned(state.gold());
        return ResponseEntity.ok(GameResponse.from(game, state.map()));
    }

    @PostMapping("/{gameId}/towers")
    public ResponseEntity<TowerResponse> placeTower(
            @PathVariable UUID gameId,
            @Valid @RequestBody PlaceTowerRequest request,
            Authentication auth) {
        Tower tower = gameService.placeTower(
                new PlaceTowerCommand(gameId, request.towerType(), request.x(), request.y()));
        return ResponseEntity.status(HttpStatus.CREATED).body(TowerResponse.from(tower));
    }

    @PostMapping("/{gameId}/waves/start")
    public ResponseEntity<WaveResponse> startWave(@PathVariable UUID gameId, Authentication auth) {
        Wave wave = gameService.startWave(new StartWaveCommand(gameId));
        return ResponseEntity.ok(WaveResponse.from(wave));
    }

    private UUID extractPlayerId(Authentication auth) {
        // Le username dans le token est le username du joueur
        // On récupère le playerId via le service auth
        return UUID.fromString(auth.getName());
    }
}
EOF

echo ""
echo "✅ Adaptateurs JPA + GameController générés !"
echo ""
echo "Fichiers créés :"
echo "  infrastructure/persistence/repository/GameRepositoryAdapter.java  ← Adapter pattern"
echo "  infrastructure/persistence/repository/PlayerRepositoryAdapter.java ← Adapter pattern"
echo "  infrastructure/config/DomainConfig.java                           ← Beans domaine"
echo "  application/usecase/GameService.java                              ← Orchestration"
echo "  infrastructure/web/dto/CreateGameRequest.java"
echo "  infrastructure/web/dto/GameResponse.java"
echo "  infrastructure/web/dto/WaveResponse.java"
echo "  infrastructure/web/controller/GameController.java"
