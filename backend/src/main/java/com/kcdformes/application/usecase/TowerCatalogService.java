package com.kcdformes.application.usecase;

import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;
import com.kcdformes.domain.port.in.query.GetTowerCatalogUseCase;
import com.kcdformes.domain.service.PlaceTowerService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Expose le catalogue des tours tel que le domaine le calcule. Aucune règle
 * ici : les stats par niveau viennent d'une vraie instance de Tower (mêmes
 * formules que la simulation), la règle de pose de TowerType, le plafond de
 * murs de PlaceTowerService.
 */
@Service
public class TowerCatalogService implements GetTowerCatalogUseCase {

    @Override
    public List<TowerSpec> listTowers() {
        return Arrays.stream(TowerType.values())
                .map(TowerCatalogService::spec)
                .toList();
    }

    private static TowerSpec spec(TowerType type) {
        List<LevelStats> levels = new ArrayList<>();
        for (int level = 1; level <= Tower.MAX_LEVEL; level++) {
            Tower tower = new Tower(null, type, 0, 0, level);
            levels.add(new LevelStats(
                    level,
                    tower.getDamage(),
                    tower.getRange(),
                    tower.getMaxHp(),
                    tower.isMaxLevel() ? 0 : tower.getUpgradeCost()));
        }
        return new TowerSpec(
                type,
                type.baseCost,
                type.damageType,
                type.attackSpeed,
                type.splashRadius,
                type.heavyTargetMultiplier,
                type.unlockWave,
                type.placedOnCorridor() ? Placement.ON_CORRIDOR : Placement.OFF_CORRIDOR,
                type == TowerType.WALL ? PlaceTowerService.MAX_WALLS : 0,
                List.copyOf(levels));
    }
}
