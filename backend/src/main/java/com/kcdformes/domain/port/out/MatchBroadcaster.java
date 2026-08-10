package com.kcdformes.domain.port.out;

import com.kcdformes.domain.model.match.Match;

/**
 * Port de diffusion : pousse l'état d'un match à ses abonnés (canal temps réel).
 * Implémenté côté infrastructure par un adaptateur STOMP (StompMatchBroadcaster).
 * Le domaine/application ignore que c'est du WebSocket derrière.
 */
public interface MatchBroadcaster {
    /** Diffuse l'état du LOBBY sur /topic/match/{id} (joueurs, prêt, statut). */
    void broadcastState(Match match);

    /** Diffuse un SNAPSHOT de jeu live sur /topic/match/{id}/state (ennemis, PV…). */
    void broadcastGame(Match match);

    /** Diffuse un SNAPSHOT versus (les DEUX boards) sur /topic/match/{id}/state. */
    void broadcastVersus(Match match);

    /** Diffuse un message de chat aux joueurs du match sur /topic/match/{id}/chat. */
    void broadcastChat(Match match, String senderId, String username, String text);
}
