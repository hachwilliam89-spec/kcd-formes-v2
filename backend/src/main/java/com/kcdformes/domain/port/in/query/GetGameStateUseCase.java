package com.kcdformes.domain.port.in.query;

import com.kcdformes.domain.model.GameMap;

import java.util.UUID;

public interface GetGameStateUseCase {

    record GameStateResult(UUID gameId, UUID castleId, GameMap map, int waveNumber, int gold, String status,
                            int castleHp, int castleMaxHp) {}

    GameStateResult getGameState(UUID gameId);
}
