package com.kcdformes.domain.exception;

public class CellOccupiedException extends RuntimeException {
    public CellOccupiedException(int x, int y) {
        super("Cell (%d, %d) is already occupied".formatted(x, y));
    }
}
