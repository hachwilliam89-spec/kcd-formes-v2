package com.kcdformes.domain.service;

import com.kcdformes.domain.model.*;
import com.kcdformes.domain.model.match.LiveEnemy;
import com.kcdformes.infrastructure.persistence.mapper.GameMapMapper;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;
import java.util.*;
import static org.assertj.core.api.Assertions.*;

class SeasonalTerrainTest {
    private Castle castle() { return new Castle(UUID.randomUUID(), UUID.randomUUID(), "Test", 100, 100, 1); }

    @Test void floodIsPredictableAndNeverDestroysTowers() {
        var t = new SeasonalTerrain(TerrainType.SPRING, 2);
        Tower bank = new Tower(TowerType.ARCHER, 10, 6);
        Tower high = new Tower(TowerType.ARCHER, 5, 3);
        assertThat(t.disables(bank)).isFalse();
        t.beginWave(3);
        assertThat(t.disables(bank)).isTrue();
        assertThat(t.disables(high)).isFalse();
        assertThat(t.snapshot(List.of(bank, high)).disabledTowers()).containsExactly(bank.getId());
        t.beginWave(4);
        assertThat(t.disables(bank)).isFalse();
        assertThat(bank.getHp()).isEqualTo(bank.getMaxHp());
        for (int wave = 1; wave <= 12; wave++) assertThat(SeasonalTerrain.forecast(TerrainType.SPRING, wave).flooded()).isEqualTo(wave % 3 == 0);
    }

    @Test void fireSpreadsOnlyAcrossLeavesAndCannotRelightUntilNextWave() {
        var t = new SeasonalTerrain(TerrainType.AUTUMN, 1);
        t.ignite(0, 0);
        assertThat(t.snapshot(List.of()).burning()).isEmpty();
        t.ignite(6, 3);
        assertThat(t.damageAt(6, 3)).isEqualTo(SeasonalTerrain.FIRE_DAMAGE);
        for (int i = 0; i < 3; i++) t.advance();
        assertThat(t.snapshot(List.of()).burning()).contains(new Position(7, 3));
        assertThat(t.snapshot(List.of()).burning()).doesNotContain(new Position(10, 7));
        for (int i = 0; i < 40; i++) t.advance();
        assertThat(t.snapshot(List.of()).burning()).isEmpty();
        assertThat(t.snapshot(List.of()).burned()).hasSize(4);
        t.ignite(6, 3);
        assertThat(t.damageAt(6, 3)).isZero();
        t.beginWave(2); t.ignite(6, 3);
        assertThat(t.damageAt(6, 3)).isPositive();
    }

    @Test void seasonalMapsPersistAndAllHazardCellsMatchTheirRole() {
        var paths = new PathfindingService();
        var mapper = new GameMapMapper(new ObjectMapper());
        for (String id : List.of("spring", "autumn")) {
            var map = MapCatalog.buildMap(id);
            assertThat(mapper.fromJson(mapper.toJson(map)).getTerrain()).isEqualTo(map.getTerrain());
            assertThat(paths.findLanePaths(map)).allSatisfy(lane -> {
                assertThat(lane).isNotEmpty();
                assertThat(lane.getLast()).isEqualTo(map.getPathEnd());
            });
        }
        assertThat(paths.corridorCells(MapCatalog.buildMap("spring"))).doesNotContainAnyElementsOf(SeasonalTerrain.floodCells());
        assertThat(paths.buildableCells(MapCatalog.buildMap("spring"))).containsAll(SeasonalTerrain.floodCells());
        assertThat(paths.corridorCells(MapCatalog.buildMap("autumn"))).containsAll(SeasonalTerrain.leafCells());
        assertThat(MapCatalog.buildMap("desert").getTerrain()).isEqualTo(TerrainType.NONE);
    }

    @Test void soloFloodPreventsShotsAndNextWaveRestoresThem() {
        var map = MapCatalog.buildMap("spring");
        Tower bank = new Tower(TowerType.ARCHER, 10, 6); map.placeTower(bank);
        var simulation = new WaveSimulationService(new PathfindingService());
        var flooded = simulation.simulate(map, new Wave(3, List.of(new Enemy(EnemyType.ORC, 0, 4))), castle());
        assertThat(flooded.ticks()).allSatisfy(t -> {
            assertThat(t.terrain().disabledTowers()).contains(bank.getId());
            assertThat(t.damageEvents()).isEmpty();
        });
        var dry = simulation.simulate(map, new Wave(4, List.of(new Enemy(EnemyType.ORC, 0, 4))), castle());
        assertThat(dry.ticks().stream().flatMap(t -> t.damageEvents().stream())).isNotEmpty();
        assertThat(map.getTowerById(bank.getId())).isPresent();
    }

    @Test void soloCatapultActuallyIgnitesLeaves() {
        var map = MapCatalog.buildMap("autumn");
        map.placeTower(new Tower(TowerType.CATAPULT, 10, 4));
        var wave = new Wave(1, List.of(new Enemy(EnemyType.ORC, 0, 3, 0, 500)));
        var result = new WaveSimulationService(new PathfindingService()).simulate(map, wave, castle());
        assertThat(result.ticks()).anyMatch(t -> !t.terrain().burning().isEmpty());
        assertThat(result.ticks()).anyMatch(t -> !t.terrain().burned().isEmpty());
    }

    @Test void liveFloodAndFireUseTheSameRulesAsSolo() {
        var engine = new MatchEngine(new PathfindingService());
        var map = MapCatalog.buildMap("spring");
        var bank = new Tower(TowerType.ARCHER, 10, 6); map.placeTower(bank);
        var state = engine.start(map); state.wave = 3;
        var nearBank = new LiveEnemy(EnemyType.ORC, 10, 7); nearBank.pathIndex = 13;
        state.enemies.add(nearBank);
        engine.step(state, 120);
        assertThat(state.terrain.snapshot(map.getTowers()).disabledTowers()).contains(bank.getId());
        assertThat(state.shots).isEmpty();
        state.wave = 4; engine.step(state, 120);
        assertThat(state.terrain.flooded()).isFalse();
        var autumn = engine.start(MapCatalog.buildMap("autumn"));
        autumn.terrain.ignite(6, 3);
        var enemy = new LiveEnemy(EnemyType.ORC, 6, 3); enemy.pathIndex = 6;
        autumn.enemies.add(enemy);
        engine.step(autumn, 120);
        assertThat(enemy.hp).isEqualTo(enemy.maxHp - SeasonalTerrain.FIRE_DAMAGE);
        autumn.wave = 2; engine.step(autumn, 120);
        assertThat(autumn.terrain.snapshot(List.of()).burned()).isEmpty();
        assertThat(autumn.terrain.snapshot(List.of()).burning()).isEmpty();
    }
    @Test void liveFireAwardsGoldExactlyOnceAndRespectsMagicArmor() {
        var engine = new MatchEngine(new PathfindingService());
        var state = engine.start(MapCatalog.buildMap("autumn"));
        state.terrain.ignite(6, 3);
        var dying = new LiveEnemy(EnemyType.ORC, 6, 3, SeasonalTerrain.FIRE_DAMAGE);
        dying.pathIndex = 6;
        var armored = new LiveEnemy(EnemyType.DARK_KNIGHT, 6, 3);
        armored.pathIndex = 6;
        state.enemies.addAll(List.of(dying, armored));
        int before = state.gold;
        engine.step(state, 120);
        assertThat(state.enemies).doesNotContain(dying).contains(armored);
        assertThat(armored.hp).isEqualTo(armored.maxHp);
        assertThat(state.gold).isEqualTo(before + EnemyType.ORC.goldReward);
        engine.step(state, 120);
        assertThat(state.gold).isEqualTo(before + EnemyType.ORC.goldReward);
    }

}
