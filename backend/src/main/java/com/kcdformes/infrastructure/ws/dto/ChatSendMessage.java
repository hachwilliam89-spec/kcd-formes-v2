package com.kcdformes.infrastructure.ws.dto;

/** Payload client → serveur : message de chat envoyé dans un match. */
public record ChatSendMessage(String text) {}
