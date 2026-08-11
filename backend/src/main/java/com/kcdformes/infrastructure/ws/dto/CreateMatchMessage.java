package com.kcdformes.infrastructure.ws.dto;

/** Payload client → serveur à la création d'un match : mode voulu (COOP/VERSUS)
 *  + map choisie (id du catalogue, désert par défaut). */
public record CreateMatchMessage(String mode, String mapId) {}
