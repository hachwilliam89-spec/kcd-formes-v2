package com.kcdformes.infrastructure.ws.dto;

import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchGameState;
import com.kcdformes.domain.model.match.MatchPlayer;

/**
 * Vue versus ADRESSÉE À UN joueur (envoyée sur /user/queue/game via
 * convertAndSendToUser). Contient SON board complet + un simple résumé de
 * l'adversaire (pas ses ennemis/tours) : payload deux fois plus léger que
 * l'ancien snapshot partagé, et la lenteur d'un client n'impacte plus l'autre
 * (livraison isolée par utilisateur au lieu d'un topic commun).
 */
public record VersusPlayerView(
        String status,
        String winnerId,
        MatchSnapshotResponse board,   // MON board complet
        int income,
        int score,
        boolean defeated,
        OpponentView opponent
) {
    public record OpponentView(
            String playerId, String username,
            int wave, int gold, int castleHp, int castleMaxHp,
            int score, boolean defeated) {}

    public static VersusPlayerView from(Match match, MatchPlayer me) {
        String status = match.getStatus().name();
        MatchGameState mine = match.getPlayerState(me.getPlayerId());
        MatchSnapshotResponse board = mine != null ? MatchSnapshotResponse.fromState(mine, status) : null;

        OpponentView opponent = match.opponentOf(me.getPlayerId())
                .map(opp -> {
                    MatchGameState os = match.getPlayerState(opp.getPlayerId());
                    return new OpponentView(
                            opp.getPlayerId().toString(), opp.getUsername(),
                            os != null ? os.wave : 0,
                            os != null ? os.gold : 0,
                            os != null ? os.castleHp : 0,
                            os != null ? os.castleMaxHp : 100,
                            os != null ? os.enemiesKilled : 0,
                            os != null && os.defeated);
                })
                .orElse(null);

        return new VersusPlayerView(
                status,
                match.getWinnerId() != null ? match.getWinnerId().toString() : null,
                board,
                mine != null ? mine.income : 0,
                mine != null ? mine.enemiesKilled : 0,
                mine != null && mine.defeated,
                opponent);
    }
}
