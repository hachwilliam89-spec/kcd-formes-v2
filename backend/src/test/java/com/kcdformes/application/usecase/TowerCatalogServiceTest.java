package com.kcdformes.application.usecase;

import com.kcdformes.domain.model.DamageType;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;
import com.kcdformes.domain.port.in.query.GetTowerCatalogUseCase.LevelStats;
import com.kcdformes.domain.port.in.query.GetTowerCatalogUseCase.Placement;
import com.kcdformes.domain.port.in.query.GetTowerCatalogUseCase.TowerSpec;
import com.kcdformes.domain.service.PlaceTowerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TowerCatalogServiceTest {

    private TowerCatalogService service;

    @BeforeEach
    void setUp() {
        service = new TowerCatalogService();
    }

    private TowerSpec spec(TowerType type) {
        return service.listTowers().stream()
                .filter(s -> s.type() == type)
                .findFirst()
                .orElseThrow();
    }

    @Test
    @DisplayName("Liste toutes les tours, dans l'ordre de TowerType")
    void listTowers_coversEveryTypeInOrder() {
        assertThat(service.listTowers()).extracting(TowerSpec::type)
                .containsExactly(TowerType.values());
    }

    @Test
    @DisplayName("Archer : coût, profil et déblocage repris de TowerType")
    void archer_matchesTowerType() {
        TowerSpec archer = spec(TowerType.ARCHER);

        assertThat(archer.cost()).isEqualTo(TowerType.ARCHER.baseCost);
        assertThat(archer.damageType()).isEqualTo(DamageType.SINGLE_TARGET);
        assertThat(archer.unlockWave()).isZero();
        assertThat(archer.placement()).isEqualTo(Placement.OFF_CORRIDOR);
        assertThat(archer.maxCount()).isZero();
    }

    @Test
    @DisplayName("Baliste : débloquée par la progression du compte, bonus anti-gros")
    void ballista_isUnlockedByAccountProgress() {
        TowerSpec ballista = spec(TowerType.BALLISTA);

        assertThat(ballista.unlockWave()).isEqualTo(TowerType.BALLISTA.unlockWave).isPositive();
        assertThat(ballista.heavyTargetMultiplier()).isGreaterThan(1.0);
    }

    @Test
    @DisplayName("Mur : se pose sur le couloir, plafonné à MAX_WALLS, PV explicites")
    void wall_goesOnCorridorWithCap() {
        TowerSpec wall = spec(TowerType.WALL);

        assertThat(wall.placement()).isEqualTo(Placement.ON_CORRIDOR);
        assertThat(wall.maxCount()).isEqualTo(PlaceTowerService.MAX_WALLS);
        assertThat(wall.levels().get(0).maxHp()).isEqualTo(TowerType.WALL.structureHp);
        assertThat(wall.levels().get(0).damage()).isZero();
    }

    @Test
    @DisplayName("Stats par niveau identiques à celles de la simulation (Tower)")
    void levels_matchTowerFormulas() {
        for (TowerSpec spec : service.listTowers()) {
            assertThat(spec.levels()).extracting(LevelStats::level)
                    .containsExactly(1, 2, 3);
            for (LevelStats stats : spec.levels()) {
                Tower tower = new Tower(null, spec.type(), 0, 0, stats.level());
                assertThat(stats.damage()).isEqualTo(tower.getDamage());
                assertThat(stats.range()).isEqualTo(tower.getRange());
                assertThat(stats.maxHp()).isEqualTo(tower.getMaxHp());
            }
        }
    }

    @Test
    @DisplayName("Coût d'amélioration : celui du niveau suivant, 0 au niveau max")
    void upgradeCost_isZeroAtMaxLevel() {
        List<LevelStats> levels = spec(TowerType.MAGE).levels();

        assertThat(levels.get(0).upgradeCost()).isEqualTo(TowerType.MAGE.baseCost * 2);
        assertThat(levels.get(1).upgradeCost()).isEqualTo(TowerType.MAGE.baseCost * 4);
        assertThat(levels.get(Tower.MAX_LEVEL - 1).upgradeCost()).isZero();
    }
}
