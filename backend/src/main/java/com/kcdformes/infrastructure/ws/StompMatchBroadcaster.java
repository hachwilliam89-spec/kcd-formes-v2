package com.kcdformes.infrastructure.ws;

import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.port.out.MatchBroadcaster;
import com.kcdformes.domain.model.match.MatchPlayer;
import com.kcdformes.infrastructure.ws.dto.ChatMessageResponse;
import com.kcdformes.infrastructure.ws.dto.MatchSnapshotResponse;
import com.kcdformes.infrastructure.ws.dto.MatchStateResponse;
import com.kcdformes.infrastructure.ws.dto.VersusPlayerView;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

/**
 * Adaptateur STOMP du port MatchBroadcaster : pousse l'état du match sur son
 * canal `/topic/match/{id}`, auquel les joueurs du match sont abonnés.
 */
@Component
public class StompMatchBroadcaster implements MatchBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;

    public StompMatchBroadcaster(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @Override
    public void broadcastState(Match match) {
        messagingTemplate.convertAndSend(
                "/topic/match/" + match.getId(),
                MatchStateResponse.from(match));
    }

    @Override
    public void broadcastGame(Match match) {
        messagingTemplate.convertAndSend(
                "/topic/match/" + match.getId() + "/state",
                MatchSnapshotResponse.from(match));
    }

    @Override
    public void broadcastVersus(Match match) {
        // Livraison PAR JOUEUR sur un topic dédié /topic/match/{id}/player/{playerId} :
        // chacun reçoit son board complet + un résumé de l'adversaire. Isolé (un
        // client lent n'affecte pas l'autre), deux fois plus léger qu'un topic
        // partagé, et 100 % broker simple (pas de « user destination » capricieuse).
        for (MatchPlayer p : match.getPlayers()) {
            messagingTemplate.convertAndSend(
                    "/topic/match/" + match.getId() + "/player/" + p.getPlayerId(),
                    VersusPlayerView.from(match, p));
        }
    }

    @Override
    public void broadcastChat(Match match, String senderId, String username, String text) {
        messagingTemplate.convertAndSend(
                "/topic/match/" + match.getId() + "/chat",
                new ChatMessageResponse(senderId, username, text, System.currentTimeMillis()));
    }
}
