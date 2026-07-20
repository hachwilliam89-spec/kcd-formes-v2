package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.port.in.query.GetLeaderboardUseCase.LeaderboardEntry;
import com.kcdformes.domain.port.in.query.GetLeaderboardUseCase.LeaderboardResult;

import java.util.List;

/**
 * Classement par meilleure vague (voir GetLeaderboardUseCase). Les playerId ne
 * sont pas exposés : le frontend n'en a pas l'usage, et un leaderboard public
 * n'a pas à divulguer les identifiants techniques des comptes (les UUID de
 * partie/joueur sont par ailleurs la seule barrière d'obscurité côté API).
 */
public record LeaderboardResponse(List<EntryResponse> top, EntryResponse me) {

    public record EntryResponse(int rank, String username, int bestWave) {
        static EntryResponse from(LeaderboardEntry entry) {
            return new EntryResponse(entry.rank(), entry.username(), entry.bestWave());
        }
    }

    public static LeaderboardResponse from(LeaderboardResult result) {
        return new LeaderboardResponse(
                result.top().stream().map(EntryResponse::from).toList(),
                result.me() != null ? EntryResponse.from(result.me()) : null
        );
    }
}
