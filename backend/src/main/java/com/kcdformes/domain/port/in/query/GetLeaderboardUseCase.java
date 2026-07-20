package com.kcdformes.domain.port.in.query;

import java.util.List;
import java.util.UUID;

/**
 * Classement global par meilleure vague atteinte (voir GAME_DESIGN 3) — la
 * bestWave est la SEULE progression de compte (jamais l'or, remis à zéro à
 * chaque partie), protégée côté serveur (impossible à farmer après une défaite,
 * voir GameService.requireInProgress).
 *
 * Note : l'ancienne version de ce port (elo, gamesWon) datait de l'ère PvP
 * anticipée — l'elo présent sur PlayerEntity reste réservé au futur PvP (voir
 * GAME_DESIGN 4), ce leaderboard-ci n'en dépend pas.
 */
public interface GetLeaderboardUseCase {

    record LeaderboardEntry(int rank, UUID playerId, String username, int bestWave) {}

    /**
     * top : les limit premiers joueurs. me : l'entrée du joueur demandeur avec
     * son rang global, qu'il figure dans le top ou non — un joueur classé 200e
     * doit voir sa position, pas seulement un top 10 inaccessible.
     */
    record LeaderboardResult(List<LeaderboardEntry> top, LeaderboardEntry me) {}

    LeaderboardResult getLeaderboard(UUID requestingPlayerId, int limit);
}
