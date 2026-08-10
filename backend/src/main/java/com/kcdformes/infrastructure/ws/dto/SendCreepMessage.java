package com.kcdformes.infrastructure.ws.dto;

/** Payload client → serveur pour envoyer un ennemi chez l'adversaire (versus rush). */
public record SendCreepMessage(String type) {}
