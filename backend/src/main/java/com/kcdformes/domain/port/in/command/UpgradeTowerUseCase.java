package com.kcdformes.domain.port.in.command;

import com.kcdformes.domain.model.Tower;

import java.util.UUID;

public interface UpgradeTowerUseCase {

    // playerId : identité du joueur authentifié, pour la vérification de propriété
    // de la partie (voir GameService.loadOwnedGame).
    record UpgradeTowerCommand(UUID gameId, UUID playerId, UUID towerId) {}

    Tower upgradeTower(UpgradeTowerCommand command);
}
