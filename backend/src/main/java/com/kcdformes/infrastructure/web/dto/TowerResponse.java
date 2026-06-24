package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;

import java.util.UUID;

public record TowerResponse(
        UUID id,
        TowerType type,
        int x,
        int y,
        int level,
        int damage,
        double range
) {
    public static TowerResponse from(Tower tower) {
        return new TowerResponse(
                tower.getId(),
                tower.getType(),
                tower.getX(),
                tower.getY(),
                tower.getLevel(),
                tower.getDamage(),
                tower.getRange()
        );
    }
}
