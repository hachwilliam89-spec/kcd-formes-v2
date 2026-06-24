package com.kcdformes.domain.port.in.command;

import java.util.UUID;

public interface RemoveTowerUseCase {

    record RemoveTowerCommand(UUID gameId, int x, int y) {}

    void removeTower(RemoveTowerCommand command);
}
