package com.kcdformes.infrastructure.ws.dto;

/** Payload client → serveur pour rejoindre un match par son code court. */
public record JoinMatchMessage(String code) {}
