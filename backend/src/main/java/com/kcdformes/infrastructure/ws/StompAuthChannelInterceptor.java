package com.kcdformes.infrastructure.ws;

import com.kcdformes.infrastructure.config.JwtTokenFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Authentification JWT au moment de la trame STOMP CONNECT (pas au handshake HTTP,
 * ouvert dans SecurityConfig). Le client envoie son token dans un en-tête STOMP
 * "Authorization: Bearer &lt;jwt&gt;". On le valide, et on attache l'identité du
 * joueur (playerId) à la session WebSocket : tous les messages suivants de cette
 * session porteront ce Principal (récupérable via `Principal` dans les
 * @MessageMapping). Un token absent/invalide fait échouer la connexion.
 */
@Component
public class StompAuthChannelInterceptor implements ChannelInterceptor {

    private final JwtTokenFactory jwtTokenFactory;

    public StompAuthChannelInterceptor(JwtTokenFactory jwtTokenFactory) {
        this.jwtTokenFactory = jwtTokenFactory;
    }

    @Override
    public Message<?> preSend(Message<?> message, MessageChannel channel) {
        StompHeaderAccessor accessor =
                MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

        if (accessor != null && StompCommand.CONNECT.equals(accessor.getCommand())) {
            String header = accessor.getFirstNativeHeader("Authorization");
            if (header == null || !header.startsWith("Bearer ")) {
                throw new MessagingException("Token manquant : connexion WebSocket refusée");
            }
            String token = header.substring(7);
            if (!jwtTokenFactory.isTokenValid(token)) {
                throw new MessagingException("Token invalide : connexion WebSocket refusée");
            }
            UUID playerId = jwtTokenFactory.extractPlayerId(token);
            String username = jwtTokenFactory.extractUsername(token);
            // Principal.getName() = playerId (cohérent avec l'auth REST, où
            // auth.getName() renvoie déjà le playerId). Le username est gardé en
            // "credentials" si besoin d'affichage plus tard.
            var principal = new UsernamePasswordAuthenticationToken(
                    playerId.toString(), username, List.of());
            accessor.setUser(principal);
        }
        return message;
    }
}
