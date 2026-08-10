package com.kcdformes.infrastructure.ws.dto;

import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchGameState;

import java.util.List;

/**
 * Snapshot de jeu VERSUS diffusé à ~15 Hz sur /topic/match/{id}/state : contient
 * le board de CHAQUE joueur (keyé par playerId). Le client affiche le sien en
 * grand et l'adversaire en réduit. Diffère du snapshot coop (un seul board) —
 * le client distingue les deux par la présence du champ `boards`.
 */
public record VersusSnapshotResponse(
        String status,
        String winnerId,      // null tant que la partie n'est pas finie
        List<PlayerBoard> boards
) {
    public record PlayerBoard(
            String playerId,
            String username,
            boolean defeated,
            int income,
            int score,
            MatchSnapshotResponse board
    ) {}

    public static VersusSnapshotResponse from(Match match) {
        List<PlayerBoard> boards = match.getPlayers().stream().map(p -> {
            MatchGameState s = match.getPlayerState(p.getPlayerId());
            return new PlayerBoard(
                    p.getPlayerId().toString(),
                    p.getUsername(),
                    s != null && s.defeated,
                    s != null ? s.income : 0,
                    s != null ? s.enemiesKilled : 0,
                    s != null ? MatchSnapshotResponse.fromState(s, match.getStatus().name()) : null);
        }).toList();
        return new VersusSnapshotResponse(
                match.getStatus().name(),
                match.getWinnerId() != null ? match.getWinnerId().toString() : null,
                boards);
    }
}
