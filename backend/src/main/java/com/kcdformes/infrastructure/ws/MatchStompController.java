package com.kcdformes.infrastructure.ws;

import com.kcdformes.application.usecase.MatchService;
import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchMode;
import com.kcdformes.infrastructure.ws.dto.ChatSendMessage;
import com.kcdformes.infrastructure.ws.dto.ChooseBonusMessage;
import com.kcdformes.infrastructure.ws.dto.CreateMatchMessage;
import com.kcdformes.infrastructure.ws.dto.JoinMatchMessage;
import com.kcdformes.infrastructure.ws.dto.MatchStateResponse;
import com.kcdformes.infrastructure.ws.dto.PlaceTowerMessage;
import com.kcdformes.infrastructure.ws.dto.ReadyMessage;
import com.kcdformes.infrastructure.ws.dto.SendCreepMessage;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageExceptionHandler;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.annotation.SendToUser;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.Map;
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
    public MatchStateResponse create(@Payload(required = false) CreateMatchMessage message, Principal principal) {
        Caller caller = Caller.from(principal);
        MatchMode mode = parseMode(message);
        Match match = matchService.createMatch(caller.playerId(), caller.username(), mode);
        return MatchStateResponse.from(match);
    }

    /** Mode demandé (défaut COOP si absent/inconnu). */
    private MatchMode parseMode(CreateMatchMessage message) {
        if (message == null || message.mode() == null) return MatchMode.COOP;
        try {
            return MatchMode.valueOf(message.mode());
        } catch (IllegalArgumentException e) {
            return MatchMode.COOP;
        }
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

    @MessageMapping("/match/{id}/tower")
    public void placeTower(@DestinationVariable UUID id,
                           @Payload PlaceTowerMessage message,
                           Principal principal) {
        Caller caller = Caller.from(principal);
        matchService.placeTower(id, caller.playerId(), message.type(), message.x(), message.y());
    }

    @MessageMapping("/match/{id}/send")
    public void send(@DestinationVariable UUID id,
                     @Payload SendCreepMessage message,
                     Principal principal) {
        Caller caller = Caller.from(principal);
        matchService.sendCreep(id, caller.playerId(), message.type());
    }

    @MessageMapping("/match/{id}/bonus")
    public void bonus(@DestinationVariable UUID id,
                      @Payload ChooseBonusMessage message,
                      Principal principal) {
        Caller caller = Caller.from(principal);
        matchService.chooseBonus(id, caller.playerId(), message.type());
    }

    @MessageMapping("/match/{id}/chat")
    public void chat(@DestinationVariable UUID id,
                     @Payload ChatSendMessage message,
                     Principal principal) {
        Caller caller = Caller.from(principal);
        matchService.sendChat(id, caller.playerId(), caller.username(), message.text());
    }

    @MessageMapping("/match/{id}/leave")
    public void leave(@DestinationVariable UUID id, Principal principal) {
        Caller caller = Caller.from(principal);
        matchService.leave(id, caller.playerId());
    }

    /** Renvoie au joueur le motif d'un refus (pose invalide, or insuffisant…)
     *  sur /user/queue/errors, au lieu d'un échec silencieux. */
    @MessageExceptionHandler
    @SendToUser("/queue/errors")
    public Map<String, String> handleError(Exception e) {
        String msg = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
        return Map.of("error", msg);
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
