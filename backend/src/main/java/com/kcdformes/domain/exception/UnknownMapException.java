package com.kcdformes.domain.exception;

public class UnknownMapException extends RuntimeException {
    public UnknownMapException(String mapId) {
        super("Carte inconnue : " + mapId);
    }
}
