package com.kcdformes.domain.port.in.command;

import com.kcdformes.domain.model.Tower;

import java.util.UUID;

public interface UpgradeTowerUseCase {

    record UpgradeTowerCommand(UUID gameId, UUID towerId) {}

    Tower upgradeTower(UpgradeTowerCommand command);
}
