package com.kcdformes.domain.port.out;

import com.kcdformes.domain.model.GameMap;

import java.util.Optional;
import java.util.UUID;

public interface GameRepository {
    Optional<GameMap> findMapByGameId(UUID gameId);
    void saveMap(UUID gameId, GameMap map);
}
