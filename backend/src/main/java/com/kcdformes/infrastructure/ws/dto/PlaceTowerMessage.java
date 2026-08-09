package com.kcdformes.infrastructure.ws.dto;

/** Payload client → serveur pour poser une tour en coop (validée serveur). */
public record PlaceTowerMessage(String type, int x, int y) {}
