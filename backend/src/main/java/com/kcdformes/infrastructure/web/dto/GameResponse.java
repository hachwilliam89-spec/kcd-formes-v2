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
