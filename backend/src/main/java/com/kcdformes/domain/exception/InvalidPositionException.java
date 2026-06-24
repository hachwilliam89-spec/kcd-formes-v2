package com.kcdformes.domain.exception;

public class InvalidPositionException extends RuntimeException {
    public InvalidPositionException(int x, int y, int width, int height) {
        super("Position (%d, %d) is outside map bounds (%d x %d)".formatted(x, y, width, height));
    }
}
