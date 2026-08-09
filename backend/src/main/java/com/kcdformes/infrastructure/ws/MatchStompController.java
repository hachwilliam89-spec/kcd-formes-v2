package com.kcdformes.infrastructure.ws;

import com.kcdformes.application.usecase.MatchService;
import com.kcdformes.domain.model.match.Match;
import com.kcdformes.infrastructure.ws.dto.JoinMatchMessage;
import com.kcdformes.infrastructure.ws.dto.MatchStateResponse;
import com.kcdformes.infrastructure.ws.dto.ReadyMessage;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.UUID;

/**
 * Point d'entrée STOMP du lobby multijoueur (Jalon 2, voir docs/MULTIPLAYER.md).
 *
 * L'identité vient du Principal posé au CONNECT (StompAuthChannelInterceptor) :
 * getName() = playerId, credentials = username.
 *
 * - create / join renvoient l'état AU joueur appelant (`@SendToUser` →
 *   /user/queue/match) pour qu'il apprenne l'id du match et s'abonne ensuite à
 *   /topic/match/{id} ;
 * - ready / leave n'ont pas de retour direct : MatchService rediffuse l'état à
 *   tous les abonnés de /topic/match/{id}.
 */
@Controller
public class MatchStompController {

    private final MatchService matchService;

    public MatchStompController(MatchService matchService) {
        this.matchService = matchService;
    }

    @MessageMapping("/match/create")
    @SendToUser("/queue/match")
    public MatchStateResponse create(Principal principal) {
        Caller caller = Caller.from(principal);
        Match match = matchService.createMatch(caller.playerId(), caller.username());
        return MatchStateResponse.from(match);
    }

    @MessageMapping("/match/join")
    @SendToUser("/queue/match")
    public MatchStateResponse join(@Payload JoinMatchMessage message, Principal principal) {
        Caller caller = Caller.from(principal);
        Match match = matchService.join(message.code(), caller.playerId(), caller.username());
        return MatchStateResponse.from(match);
    }

    @MessageMapping("/match/{id}/ready")
    public void ready(@DestinationVariable UUID id,
                      @Payload ReadyMessage message,
                      Principal principal) {
        Caller caller = Caller.from(principal);
        matchService.setReady(id, caller.playerId(), message.ready());
    }

    @MessageMapping("/match/{id}/start")
    public void start(@DestinationVariable UUID id, Principal principal) {
        Caller caller = Caller.from(principal);
        matchService.startGame(id, caller.playerId());
    }

    @MessageMapping("/match/{id}/leave")
    public void leave(@DestinationVariable UUID id, Principal principal) {
        Caller caller = Caller.from(principal);
        matchService.leave(id, caller.playerId());
    }

    /** Identité de l'appelant extraite du Principal STOMP. */
    private record Caller(UUID playerId, String username) {
        static Caller from(Principal principal) {
            UUID playerId = UUID.fromString(principal.getName());
            String username = principal.getName();
            if (principal instanceof UsernamePasswordAuthenticationToken auth
                    && auth.getCredentials() instanceof String u && !u.isBlank()) {
                username = u;
            }
            return new Caller(playerId, username);
        }
    }
}
