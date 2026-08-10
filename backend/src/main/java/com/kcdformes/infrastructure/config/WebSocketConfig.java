package com.kcdformes.infrastructure.config;

import com.kcdformes.infrastructure.ws.StompAuthChannelInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.ChannelRegistration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

/**
 * Configuration WebSocket + STOMP pour le multijoueur temps réel (voir
 * docs/MULTIPLAYER.md). Broker "simple" en mémoire suffisant pour une instance.
 *
 * - Handshake : endpoint /ws (WebSocket natif ; Caddy proxifie l'upgrade en prod).
 * - Entrant (client → serveur) : préfixe /app (ex. /app/echo → @MessageMapping("/echo")).
 * - Sortant (serveur → clients) : préfixe /topic (ex. /topic/echo).
 * - Authentification JWT branchée sur le canal entrant (voir StompAuthChannelInterceptor).
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    private final StompAuthChannelInterceptor authInterceptor;

    public WebSocketConfig(StompAuthChannelInterceptor authInterceptor) {
        this.authInterceptor = authInterceptor;
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")
                .setAllowedOrigins(
                        "http://localhost:3000",
                        "https://kcd-formes.fr",
                        "https://www.kcd-formes.fr");
        // Pas de SockJS : le client utilise le WebSocket natif (@stomp/stompjs).
    }

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // /topic : diffusion à tous les abonnés d'un match ; /queue : messages
        // adressés à UN joueur (@SendToUser → /user/{id}/queue/...).
        registry.enableSimpleBroker("/topic", "/queue");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void configureClientInboundChannel(ChannelRegistration registration) {
        registration.interceptors(authInterceptor);
    }

    /**
     * Limites de transport élargies : les snapshots live (jusqu'à 80 ennemis ×2
     * boards, ~15 Hz) peuvent momentanément engorger un client lent/throttlé.
     * Aux valeurs par défaut (buffer 512 Ko, envoi 10 s), Spring FERME la session
     * du client trop lent — ce qui figeait un des deux joueurs. On agrandit le
     * tampon et on rallonge le délai d'envoi pour tolérer ces à-coups.
     */
    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration.setSendBufferSizeLimit(2 * 1024 * 1024); // 2 Mo (défaut 512 Ko)
        registration.setSendTimeLimit(30 * 1000);             // 30 s (défaut 10 s)
        registration.setMessageSizeLimit(256 * 1024);         // 256 Ko par message
    }
}
