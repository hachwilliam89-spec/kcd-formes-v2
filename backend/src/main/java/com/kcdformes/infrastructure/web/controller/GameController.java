package com.kcdformes.infrastructure.web.controller;

import com.kcdformes.application.usecase.GameService;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.port.in.command.ChooseBonusUseCase.ChooseBonusCommand;
import com.kcdformes.domain.port.in.command.ChooseBonusUseCase.ChooseBonusResult;
import com.kcdformes.domain.port.in.command.PlaceTowerUseCase.PlaceTowerCommand;
import com.kcdformes.domain.port.in.command.SetTargetingModeUseCase.SetTargetingModeCommand;
import com.kcdformes.domain.port.in.command.StartWaveUseCase.StartWaveCommand;
import com.kcdformes.domain.port.in.command.StartWaveUseCase.StartWaveResult;
import com.kcdformes.domain.port.in.command.UpgradeTowerUseCase.UpgradeTowerCommand;
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
        GameEntity game = gameService.createGame(playerId, request.castleName(), request.mapId());
        GameStateResult state = gameService.getGameState(game.getId(), playerId);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(GameResponse.from(game, state.map(), state));
    }

    @GetMapping("/{gameId}")
    public ResponseEntity<GameResponse> getGame(@PathVariable UUID gameId, Authentication auth) {
        GameStateResult state = gameService.getGameState(gameId, extractPlayerId(auth));
        return ResponseEntity.ok(GameResponse.from(state));
    }

    @PostMapping("/{gameId}/towers")
    public ResponseEntity<TowerResponse> placeTower(
            @PathVariable UUID gameId,
            @Valid @RequestBody PlaceTowerRequest request,
            Authentication auth) {
        Tower tower = gameService.placeTower(
                new PlaceTowerCommand(gameId, extractPlayerId(auth), request.towerType(), request.x(), request.y()));
        return ResponseEntity.status(HttpStatus.CREATED).body(TowerResponse.from(tower));
    }

    @PostMapping("/{gameId}/towers/{towerId}/upgrade")
    public ResponseEntity<TowerResponse> upgradeTower(
            @PathVariable UUID gameId,
            @PathVariable UUID towerId,
            Authentication auth) {
        Tower tower = gameService.upgradeTower(new UpgradeTowerCommand(gameId, extractPlayerId(auth), towerId));
        return ResponseEntity.ok(TowerResponse.from(tower));
    }

    @PostMapping("/{gameId}/towers/{towerId}/targeting")
    public ResponseEntity<TowerResponse> setTargetingMode(
            @PathVariable UUID gameId,
            @PathVariable UUID towerId,
            @Valid @RequestBody SetTargetingModeRequest request,
            Authentication auth) {
        Tower tower = gameService.setTargetingMode(new SetTargetingModeCommand(
                gameId, extractPlayerId(auth), towerId, request.mode()));
        return ResponseEntity.ok(TowerResponse.from(tower));
    }

    @PostMapping("/{gameId}/waves/start")
    public ResponseEntity<WaveResponse> startWave(@PathVariable UUID gameId, Authentication auth) {
        StartWaveResult result = gameService.startWave(new StartWaveCommand(gameId, extractPlayerId(auth)));
        return ResponseEntity.ok(WaveResponse.from(result));
    }

    @PostMapping("/{gameId}/bonus/choose")
    public ResponseEntity<BonusChoiceResponse> chooseBonus(
            @PathVariable UUID gameId,
            @Valid @RequestBody ChooseBonusRequest request,
            Authentication auth) {
        ChooseBonusResult result = gameService.chooseBonus(
                new ChooseBonusCommand(gameId, extractPlayerId(auth), request.bonusType()));
        return ResponseEntity.ok(BonusChoiceResponse.from(result));
    }

    private UUID extractPlayerId(Authentication auth) {
        // JwtAuthFilter place le playerId (UUID) comme principal -> auth.getName()
        // renvoie directement son UUID.toString().
        return UUID.fromString(auth.getName());
    }
}
