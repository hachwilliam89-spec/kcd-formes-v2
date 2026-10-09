package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.port.in.query.GetTowerCatalogUseCase.LevelStats;
import com.kcdformes.domain.port.in.query.GetTowerCatalogUseCase.TowerSpec;

import java.util.List;

/** Une entrée du catalogue des tours (voir GetTowerCatalogUseCase). */
public record TowerSpecResponse(
        String type,
        int cost,
        String damageType,
        double attackSpeed,
        double splashRadius,
        double heavyTargetMultiplier,
        int unlockWave,
        String placement,
        int maxCount,
        List<LevelResponse> levels
) {
    public record LevelResponse(int level, int damage, double range, int maxHp, int upgradeCost) {
        static LevelResponse from(LevelStats stats) {
            return new LevelResponse(stats.level(), stats.damage(), stats.range(), stats.maxHp(), stats.upgradeCost());
        }
    }

    public static TowerSpecResponse from(TowerSpec spec) {
        return new TowerSpecResponse(
                spec.type().name(),
                spec.cost(),
                spec.damageType().name(),
                spec.attackSpeed(),
                spec.splashRadius(),
                spec.heavyTargetMultiplier(),
                spec.unlockWave(),
                spec.placement().name(),
                spec.maxCount(),
                spec.levels().stream().map(LevelResponse::from).toList());
    }
}
