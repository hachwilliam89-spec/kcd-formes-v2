package com.kcdformes.domain.port.in.query;

import java.util.List;
import java.util.UUID;

public interface GetLeaderboardUseCase {

    record LeaderboardEntry(UUID playerId, String username, int elo, int gamesWon) {}

    List<LeaderboardEntry> getTopPlayers(int limit);
}
