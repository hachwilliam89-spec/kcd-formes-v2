package com.kcdformes.infrastructure.ws.dto;

/** Payload client → serveur à la création d'un match : mode voulu (COOP/VERSUS). */
public record CreateMatchMessage(String mode) {}
