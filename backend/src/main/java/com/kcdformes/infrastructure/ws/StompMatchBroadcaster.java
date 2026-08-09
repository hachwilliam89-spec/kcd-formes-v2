package com.kcdformes.infrastructure.ws;

import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.port.out.MatchBroadcaster;
import com.kcdformes.infrastructure.ws.dto.MatchSnapshotResponse;
import com.kcdformes.infrastructure.ws.dto.MatchStateResponse;
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
}
