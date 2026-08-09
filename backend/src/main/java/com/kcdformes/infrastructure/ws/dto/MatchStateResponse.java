package com.kcdformes.infrastructure.ws.dto;

import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchPlayer;

import java.util.List;

/**
 * État d'un match diffusé aux clients (lobby pour le Jalon 2 ; enrichi plus tard
 * avec ennemis/tours pour la boucle live). Découple le JSON du modèle du domaine.
 */
public record MatchStateResponse(
        String id,
        String code,
        String status,
        String mode,
        int maxPlayers,
        boolean canStart,
        List<PlayerView> players
) {
    public record PlayerView(String playerId, String username, boolean ready, boolean connected) {}

    public static MatchStateResponse from(Match m) {
        List<PlayerView> players = m.getPlayers().stream()
                .map(MatchStateResponse::toView)
                .toList();
        return new MatchStateResponse(
                m.getId().toString(),
                m.getCode(),
                m.getStatus().name(),
                m.getMode().name(),
                m.getMaxPlayers(),
                m.canStart(),
                players);
    }

    private static PlayerView toView(MatchPlayer p) {
        return new PlayerView(p.getPlayerId().toString(), p.getUsername(), p.isReady(), p.isConnected());
    }
}
