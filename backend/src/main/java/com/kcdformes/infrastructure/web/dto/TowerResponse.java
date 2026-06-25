package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.DamageType;
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
        double range,
        // Exposés pour que le frontend puisse représenter visuellement le profil
        // de dégâts (zone, mono-cible, continu) sans dupliquer la logique de
        // TowerType côté client — voir GameScene.ts pour le rendu des effets.
        DamageType damageType,
        double splashRadius
) {
    public static TowerResponse from(Tower tower) {
        return new TowerResponse(
                tower.getId(),
                tower.getType(),
                tower.getX(),
                tower.getY(),
                tower.getLevel(),
                tower.getDamage(),
                tower.getRange(),
                tower.getType().damageType,
                tower.getType().splashRadius
        );
    }
}
