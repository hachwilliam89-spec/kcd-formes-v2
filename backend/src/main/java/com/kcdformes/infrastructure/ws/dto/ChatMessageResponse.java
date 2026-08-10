package com.kcdformes.infrastructure.ws.dto;

/** Message de chat diffusé aux joueurs d'un match sur /topic/match/{id}/chat. */
public record ChatMessageResponse(String senderId, String username, String text, long ts) {}
