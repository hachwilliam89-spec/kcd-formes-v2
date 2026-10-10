package com.kcdformes.infrastructure.ws.dto;

import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchGameState;
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
        String winnerId,      // null sauf à la fin d'un versus (dernier debout)
        String mapId,         // map de la partie (catalogue) → rendu client
        // Vague atteinte (0 avant le départ ; versus : la plus haute des deux boards).
        // Permet d'afficher le bilan à qui rejoint une partie déjà terminée.
        int wave,
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
                m.getWinnerId() != null ? m.getWinnerId().toString() : null,
                m.getMapId(),
                waveOf(m),
                players);
    }

    private static int waveOf(Match m) {
        int wave = m.getGameState() != null ? m.getGameState().wave : 0;
        for (MatchGameState s : m.getPlayerStates().values()) {
            if (s != null) wave = Math.max(wave, s.wave);
        }
        return wave;
    }

    private static PlayerView toView(MatchPlayer p) {
        return new PlayerView(p.getPlayerId().toString(), p.getUsername(), p.isReady(), p.isConnected());
    }
}
