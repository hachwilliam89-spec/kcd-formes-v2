package com.kcdformes.infrastructure.ws;

import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.handler.annotation.SendTo;
import org.springframework.stereotype.Controller;

import java.security.Principal;
import java.util.Map;

/**
 * Endpoint d'écho — Jalon 1 de la plomberie WebSocket (voir docs/MULTIPLAYER.md).
 * Sert uniquement à valider la chaîne complète : handshake /ws → auth JWT au
 * CONNECT → message client (/app/echo) → diffusion serveur (/topic/echo).
 * À supprimer une fois le vrai moteur de match en place.
 */
@Controller
public class EchoController {

    @MessageMapping("/echo")          // reçoit sur /app/echo
    @SendTo("/topic/echo")            // renvoie à tous les abonnés de /topic/echo
    public Map<String, Object> echo(@Payload Map<String, Object> message, Principal principal) {
        return Map.of(
                "echo", message,
                "from", principal != null ? principal.getName() : "anonyme",
                "ts", System.currentTimeMillis());
    }
}
