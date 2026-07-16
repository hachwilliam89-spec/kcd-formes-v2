package com.kcdformes.domain.port.in.command;

import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;

import java.util.UUID;

public interface PlaceTowerUseCase {

    // playerId : identité du joueur authentifié (extraite du JWT par le controller),
    // exigée par le contrat pour que la vérification de propriété de la partie soit
    // impossible à oublier côté application (voir GameService.loadOwnedGame).
    record PlaceTowerCommand(UUID gameId, UUID playerId, TowerType towerType, int x, int y) {}

    Tower placeTower(PlaceTowerCommand command);
}
