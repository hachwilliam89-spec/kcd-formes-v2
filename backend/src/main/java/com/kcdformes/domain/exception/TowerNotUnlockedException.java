package com.kcdformes.domain.exception;

import com.kcdformes.domain.model.TowerType;

public class TowerNotUnlockedException extends RuntimeException {
    public TowerNotUnlockedException(TowerType towerType, int bestWave) {
        super("Tower %s requires best wave %d, current best wave %d"
                .formatted(towerType, towerType.unlockWave, bestWave));
    }
}
