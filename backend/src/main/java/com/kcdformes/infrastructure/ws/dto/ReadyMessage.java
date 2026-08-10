package com.kcdformes.infrastructure.ws.dto;

/** Payload client → serveur pour (dé)marquer un joueur comme « prêt ». */
public record ReadyMessage(boolean ready) {}
