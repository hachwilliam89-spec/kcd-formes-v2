package com.kcdformes.domain.exception;

public class InsufficientGoldException extends RuntimeException {
    public InsufficientGoldException(int required, int available) {
        super("Insufficient gold: required %d, available %d".formatted(required, available));
    }
}
