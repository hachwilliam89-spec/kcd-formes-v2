package com.kcdformes.infrastructure.web.controller;
import com.kcdformes.domain.exception.BonusChoicePendingException;
import com.kcdformes.domain.exception.CellOccupiedException;
import com.kcdformes.domain.exception.GameAlreadyFinishedException;
import com.kcdformes.domain.exception.InsufficientGoldException;
import com.kcdformes.domain.exception.InvalidPositionException;
import com.kcdformes.domain.exception.TowerNotUnlockedException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(CellOccupiedException.class)
    public ResponseEntity<Map<String, String>> handleCellOccupied(CellOccupiedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidPositionException.class)
    public ResponseEntity<Map<String, String>> handleInvalidPosition(InvalidPositionException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InsufficientGoldException.class)
    public ResponseEntity<Map<String, String>> handleInsufficientGold(InsufficientGoldException ex) {
        return ResponseEntity.status(HttpStatus.PAYMENT_REQUIRED).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(TowerNotUnlockedException.class)
    public ResponseEntity<Map<String, String>> handleTowerNotUnlocked(TowerNotUnlockedException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(BonusChoicePendingException.class)
    public ResponseEntity<Map<String, String>> handleBonusChoicePending(BonusChoicePendingException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(GameAlreadyFinishedException.class)
    public ResponseEntity<Map<String, String>> handleGameAlreadyFinished(GameAlreadyFinishedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    /**
     * Échec du verrou optimiste (voir GameEntity.version) : deux requêtes ont
     * modifié la même partie en parallèle, la seconde perd. 409 plutôt que 500 :
     * l'état du serveur est sain, c'est la requête du client qui est arrivée sur
     * une version périmée — il lui suffit de recharger l'état et de réessayer.
     */
    @ExceptionHandler(org.springframework.orm.ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleOptimisticLock(
            org.springframework.orm.ObjectOptimisticLockingFailureException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "La partie a été modifiée par une autre requête — rechargez l'état et réessayez"));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgument(IllegalArgumentException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleIllegalState(IllegalStateException ex) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_CONTENT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .reduce((a, b) -> a + ", " + b)
                .orElse("Validation failed");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", detail));
    }
}
