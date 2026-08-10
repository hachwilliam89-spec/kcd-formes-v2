package com.kcdformes.infrastructure.ws.dto;

/** Payload client → serveur pour dépenser un bonus gagné au nombre de kills. */
public record ChooseBonusMessage(String type) {}
