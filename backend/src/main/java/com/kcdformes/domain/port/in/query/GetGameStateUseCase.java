package com.kcdformes.domain.port.in.query;

import com.kcdformes.domain.model.GameMap;

import java.util.UUID;

public interface GetGameStateUseCase {

    // awaitingBonusChoice : permet au frontend de re-proposer le choix de bonus
    // après un rechargement de page survenu pendant qu'un palier était en attente
    // (voir GameEntity.awaitingBonusChoice / ChooseBonusUseCase).
    record GameStateResult(UUID gameId, UUID castleId, GameMap map, int waveNumber, int gold, String status,
                            int castleHp, int castleMaxHp, boolean awaitingBonusChoice) {}

    GameStateResult getGameState(UUID gameId);
}
