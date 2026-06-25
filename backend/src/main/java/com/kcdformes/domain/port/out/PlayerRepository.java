package com.kcdformes.domain.port.out;

import java.util.Optional;
import java.util.UUID;

public interface PlayerRepository {

    record PlayerData(UUID id, String username, int elo) {}

    Optional<PlayerData> findById(UUID id);
    void updateElo(UUID playerId, int newElo);
}
