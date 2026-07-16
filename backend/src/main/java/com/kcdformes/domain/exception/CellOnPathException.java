package com.kcdformes.domain.exception;

/**
 * Levée quand un placement de tour vise une case du couloir des ennemis
 * (chemin + une case de part et d'autre, voir PathfindingService.corridorCells).
 * Décision de design "couloir strict" (GAME_DESIGN 2.6) : les tours ne dévient
 * jamais le chemin, elles n'ont simplement pas le droit d'y être.
 */
public class CellOnPathException extends RuntimeException {

    public CellOnPathException(int x, int y) {
        super("Cell (%d, %d) is on the enemy corridor".formatted(x, y));
    }
}
