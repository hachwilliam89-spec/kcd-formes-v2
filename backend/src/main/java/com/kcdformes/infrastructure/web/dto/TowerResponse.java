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
        double splashRadius,
        // PV courants / max de la structure elle-même (distincts des PV des
        // ennemis) — permettent au frontend d'afficher une barre de vie de tour
        // et de refléter les dégâts de siège d'un Sapeur (voir Tower.hp/getMaxHp).
        int hp,
        int maxHp
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
                tower.getType().splashRadius,
                tower.getHp(),
                tower.getMaxHp()
        );
    }
}
