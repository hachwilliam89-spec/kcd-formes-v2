package com.kcdformes.domain.port.in.command;

import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;

import java.util.UUID;

public interface PlaceTowerUseCase {

    record PlaceTowerCommand(UUID gameId, TowerType towerType, int x, int y) {}

    Tower placeTower(PlaceTowerCommand command);
}
