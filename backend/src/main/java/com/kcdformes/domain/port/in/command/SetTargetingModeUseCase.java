package com.kcdformes.domain.port.in.command;

import com.kcdformes.domain.model.TargetingMode;
import com.kcdformes.domain.model.Tower;

import java.util.UUID;

public interface SetTargetingModeUseCase {

    // playerId : identité du joueur authentifié, pour la vérification de propriété
    // de la partie (voir GameService.loadOwnedGame).
    record SetTargetingModeCommand(UUID gameId, UUID playerId, UUID towerId, TargetingMode mode) {}

    Tower setTargetingMode(SetTargetingModeCommand command);
}
