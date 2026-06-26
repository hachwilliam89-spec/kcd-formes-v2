package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.port.in.query.GetGameStateUseCase.GameStateResult;
import com.kcdformes.infrastructure.persistence.entity.GameEntity;

import java.util.List;
import java.util.UUID;

public record GameResponse(
        UUID gameId,
        UUID castleId,
        String status,
        int waveNumber,
        int gold,
        int castleHp,
        int castleMaxHp,
        MapResponse map,
        // Permet au frontend de re-proposer le choix de bonus après un rechargement
        // de page survenu pendant qu'un palier était en attente (voir BonusType).
        boolean awaitingBonusChoice
) {
    public record MapResponse(
            int width,
            int height,
            List<TowerResponse> towers
    ) {}

    /**
     * Construit la réponse à partir de l'entité partie nouvellement créée et de l'état complet
     * (utilisé juste après createGame, où l'entité a bien son castle chargé).
     */
    public static GameResponse from(GameEntity game, GameMap map, GameStateResult state) {
        return build(game.getId(), state.castleId(), game.getStatus(), game.getWaveNumber(),
                game.getGold(), state.castleHp(), state.castleMaxHp(), map, state.awaitingBonusChoice());
    }

    /**
     * Construit la réponse uniquement à partir de l'état (utilisé pour getGame, où l'on ne
     * dispose pas forcément d'une GameEntity entièrement chargée — évite tout risque de NPE
     * sur une relation lazy non initialisée).
     */
    public static GameResponse from(GameStateResult state) {
        return build(state.gameId(), state.castleId(), state.status(), state.waveNumber(),
                state.gold(), state.castleHp(), state.castleMaxHp(), state.map(), state.awaitingBonusChoice());
    }

    private static GameResponse build(UUID gameId, UUID castleId, String status, int waveNumber,
                                       int gold, int castleHp, int castleMaxHp, GameMap map,
                                       boolean awaitingBonusChoice) {
        List<TowerResponse> towers = map.getTowers().stream()
                .map(TowerResponse::from)
                .toList();

        return new GameResponse(
                gameId, castleId, status, waveNumber, gold, castleHp, castleMaxHp,
                new MapResponse(map.getWidth(), map.getHeight(), towers),
                awaitingBonusChoice
        );
    }
}
