package com.kcdformes.infrastructure.web.controller;

import com.kcdformes.application.usecase.GameService;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.Wave;
import com.kcdformes.domain.port.in.command.PlaceTowerUseCase.PlaceTowerCommand;
import com.kcdformes.domain.port.in.command.StartWaveUseCase.StartWaveCommand;
import com.kcdformes.domain.port.in.query.GetGameStateUseCase.GameStateResult;
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

    public GameController(GameService gameService) {
        this.gameService = gameService;
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
        // JwtAuthFilter place le playerId (UUID) comme principal -> auth.getName()
        // renvoie directement son UUID.toString().
        return UUID.fromString(auth.getName());
    }
}
