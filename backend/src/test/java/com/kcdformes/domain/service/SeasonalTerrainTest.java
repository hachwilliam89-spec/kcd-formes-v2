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

    // ── Printemps : crue ─────────────────────────────────────────────────

    @Test void floodIsPredictableAndNeverDestroysTowers() {
        var t = new SeasonalTerrain(TerrainType.SPRING, 2);
        Tower bank = new Tower(TowerType.ARCHER, 6, 7);   // rive ouest du lac
        Tower high = new Tower(TowerType.ARCHER, 8, 5);   // tête de pont, hors berges
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

    @Test void soloFloodPreventsShotsAndNextWaveRestoresThem() {
        var map = MapCatalog.buildMap("spring");
        Tower bank = new Tower(TowerType.ARCHER, 6, 7); map.placeTower(bank);
        var simulation = new WaveSimulationService(new PathfindingService());
        var flooded = simulation.simulate(map, new Wave(3, List.of(new Enemy(EnemyType.ORC, 0, 8))), castle());
        assertThat(flooded.ticks()).allSatisfy(t -> {
            assertThat(t.terrain().disabledTowers()).contains(bank.getId());
            assertThat(t.damageEvents()).isEmpty();
        });
        var dry = simulation.simulate(map, new Wave(4, List.of(new Enemy(EnemyType.ORC, 0, 8))), castle());
        assertThat(dry.ticks().stream().flatMap(t -> t.damageEvents().stream())).isNotEmpty();
        assertThat(map.getTowerById(bank.getId())).isPresent();
    }

    @Test void submergedTowersAreOutOfEnemiesReach() {
        // Vague 3 : rive ouest noyée. Troll (rayon) et Sapeur passent tout près de la tour.
        assertThat(soloSiegeLoss(3, EnemyType.TROLL)).isZero();
        assertThat(soloSiegeLoss(3, EnemyType.SAPEUR)).isZero();
        assertThat(soloSiegeLoss(4, EnemyType.TROLL)).isPositive();   // décrue : de nouveau exposée
        assertThat(soloSiegeLoss(4, EnemyType.SAPEUR)).isPositive();

        var t = new SeasonalTerrain(TerrainType.SPRING, 3);
        assertThat(t.submerged(new Tower(TowerType.ARCHER, 6, 7))).isTrue();
        assertThat(t.submerged(new Tower(TowerType.ARCHER, 8, 5))).isFalse();

        // Live : même règle — le rayon du Troll ignore la tour immergée.
        var engine = new MatchEngine(new PathfindingService());
        var map = MapCatalog.buildMap("spring");
        Tower bank = new Tower(TowerType.ARCHER, 6, 7); map.placeTower(bank);
        var state = engine.start(map);
        state.wave = 3;
        var troll = new LiveEnemy(EnemyType.TROLL, 5, 8, 1_000_000); troll.pathIndex = 5;
        state.enemies.add(troll);
        for (int i = 0; i < 20; i++) engine.step(state, 120);
        assertThat(bank.getHp()).isEqualTo(bank.getMaxHp());
    }

    private int soloSiegeLoss(int waveNumber, EnemyType type) {
        var map = MapCatalog.buildMap("spring");
        Tower bank = new Tower(TowerType.ARCHER, 6, 7); map.placeTower(bank);
        var enemy = new Enemy(type, 0, 8, 0, 1_000_000);
        new WaveSimulationService(new PathfindingService()).simulate(map, new Wave(waveNumber, List.of(enemy)), castle());
        return bank.getMaxHp() - bank.getHp() + (bank.isDestroyed() ? 1 : 0);
    }

    @Test void floodDirectionChangesFromOneFloodToTheNext() {
        Set<Position> reached = new HashSet<>();
        for (int k = 1; k <= 16; k++) {
            int wave = 3 * k;
            var cells = SeasonalTerrain.floodCells(TerrainType.SPRING, wave);
            assertThat(cells).isNotEmpty().isNotEqualTo(SeasonalTerrain.floodCells(TerrainType.SPRING, wave + 3));
            assertThat(SeasonalTerrain.bankCells()).containsAll(cells);
            assertThat(SeasonalTerrain.forecast(TerrainType.SPRING, wave).affectedCells()).isEqualTo(cells);
            assertThat(SeasonalTerrain.floodCells(TerrainType.SPRING, wave + 1)).isEmpty();
            reached.addAll(cells);
        }
        assertThat(reached).containsExactlyInAnyOrderElementsOf(SeasonalTerrain.bankCells()); // toutes les rives y passent

        // Vague 3 : ouest-est (face aux forts) ; vague 6 : rive nord.
        Tower west = new Tower(TowerType.ARCHER, 6, 7), north = new Tower(TowerType.ARCHER, 8, 5);
        var t = new SeasonalTerrain(TerrainType.SPRING, 3);
        assertThat(t.disables(west)).isTrue();
        assertThat(t.disables(north)).isFalse();
        t.beginWave(6);
        assertThat(t.disables(west)).isFalse();
        assertThat(t.disables(north)).isTrue();
        assertThat(t.snapshot(List.of(west, north)).flood()).isEqualTo(SeasonalTerrain.floodCells(TerrainType.SPRING, 6));
    }

    @Test void hailIsAnnouncedAndMakesEnemiesTakeMoreDamage() {
        int hailWaves = 0;
        for (int wave = 1; wave <= 30; wave++) {
            boolean hail = SeasonalTerrain.hailAt(TerrainType.SPRING, wave);
            if (hail) hailWaves++;
            assertThat(hail && SeasonalTerrain.floodedAt(TerrainType.SPRING, wave)).isFalse(); // jamais pendant une crue
            assertThat(SeasonalTerrain.forecast(TerrainType.SPRING, wave).hail()).isEqualTo(hail);
            assertThat(SeasonalTerrain.hailAt(TerrainType.AUTUMN, wave)).isFalse();
        }
        assertThat(SeasonalTerrain.hailAt(TerrainType.SPRING, 1)).isFalse();
        assertThat(hailWaves).isBetween(5, 10);
        assertThat(new SeasonalTerrain(TerrainType.SPRING, 4).damageTakenFactor()).isEqualTo(SeasonalTerrain.HAIL_DAMAGE_FACTOR);

        // Solo : même archer, même Orc — un tir de grêle (vague 4) fait 25 % de plus qu'un tir normal (vague 5).
        var simulation = new WaveSimulationService(new PathfindingService());
        int hailHit = firstHit(simulation, 4), normalHit = firstHit(simulation, 5);
        assertThat(hailHit).isEqualTo((int) Math.round(normalHit * SeasonalTerrain.HAIL_DAMAGE_FACTOR));

        // Live : la grêle est dans l'état envoyé aux joueurs.
        var engine = new MatchEngine(new PathfindingService());
        var state = engine.start(MapCatalog.buildMap("spring"));
        state.wave = 4;
        engine.step(state, 120);
        assertThat(state.terrain.snapshot(List.of()).hail()).isTrue();
    }

    @Test void fertileSoilGivesMoreGoldPerKillOnlyInSpring() {
        for (EnemyType type : EnemyType.values()) {
            assertThat(SeasonalTerrain.goldFor(TerrainType.SPRING, type.goldReward))
                    .isEqualTo((int) Math.round(type.goldReward * SeasonalTerrain.FERTILE_GOLD_FACTOR));
            assertThat(SeasonalTerrain.goldFor(TerrainType.AUTUMN, type.goldReward)).isEqualTo(type.goldReward);
            assertThat(SeasonalTerrain.goldFor(TerrainType.NONE, type.goldReward)).isEqualTo(type.goldReward);
        }

        // Solo : même Orc tué, sur le printemps et sur le désert.
        int springGold = soloKillGold("spring", 8, 5);
        int desertGold = soloKillGold("desert", 5, 2);
        assertThat(desertGold).isEqualTo(EnemyType.ORC.goldReward);
        assertThat(springGold).isEqualTo(SeasonalTerrain.goldFor(TerrainType.SPRING, EnemyType.ORC.goldReward));

        // Live : l'or partagé suit la même règle.
        var engine = new MatchEngine(new PathfindingService());
        var state = engine.start(MapCatalog.buildMap("spring"));
        state.wave = 1;
        int before = state.gold;
        var dying = new LiveEnemy(EnemyType.ORC, 1, 8); dying.hp = 0;
        state.enemies.add(dying);
        engine.step(state, 120);
        assertThat(state.gold - before)
                .isEqualTo(SeasonalTerrain.goldFor(TerrainType.SPRING, EnemyType.ORC.goldReward));
    }

    private int soloKillGold(String mapId, int towerX, int towerY) {
        var map = MapCatalog.buildMap(mapId);
        map.placeTower(new Tower(TowerType.MAGE, towerX, towerY));
        Position start = map.getPathStart();
        var result = new WaveSimulationService(new PathfindingService())
                .simulate(map, new Wave(1, List.of(new Enemy(EnemyType.ORC, start.x(), start.y(), 0, 1))), castle());
        return result.goldEarned();
    }

    private int firstHit(WaveSimulationService simulation, int waveNumber) {
        var map = MapCatalog.buildMap("spring");
        map.placeTower(new Tower(TowerType.ARCHER, 8, 5));
        var result = simulation.simulate(map, new Wave(waveNumber, List.of(new Enemy(EnemyType.ORC, 0, 8, 0, 100_000))), castle());
        return result.ticks().stream().flatMap(t -> t.damageEvents().stream()).findFirst().orElseThrow().damage();
    }

    // ── Automne : boue (aide) et brume (gêne) ────────────────────────────

    @Test void mudSlowsEnemiesOnlyOnItsCells() {
        var autumn = new SeasonalTerrain(TerrainType.AUTUMN, 1);
        assertThat(autumn.speedFactorAt(EnemyType.ORC, 12, 3)).isEqualTo(SeasonalTerrain.MUD_SPEED_FACTOR);
        assertThat(autumn.speedFactorAt(EnemyType.ORC, 12.4, 2.2)).isEqualTo(SeasonalTerrain.MUD_SPEED_FACTOR); // case la plus proche
        assertThat(autumn.speedFactorAt(EnemyType.ORC, 1, 3)).isEqualTo(1.0);
        assertThat(new SeasonalTerrain(TerrainType.SPRING, 1).speedFactorAt(EnemyType.ORC, 12, 3)).isEqualTo(1.0);
    }

    @Test void mudMovesEachWaveAndIsAnnounced() {
        for (int wave = 1; wave <= 40; wave++) {
            var mud = SeasonalTerrain.mudCells(TerrainType.AUTUMN, wave);
            assertThat(mud).isNotEmpty().isNotEqualTo(SeasonalTerrain.mudCells(TerrainType.AUTUMN, wave + 1));
            assertThat(SeasonalTerrain.forecast(TerrainType.AUTUMN, wave).affectedCells()).isEqualTo(mud);
            // Toujours une flaque sur le raccourci (x=8..10, hors croisement).
            assertThat(mud).anyMatch(p -> p.x() >= 8 && p.x() <= 10 && (p.y() == 5 || p.y() == 6 || p.y() == 10 || p.y() == 11));
        }
        assertThat(SeasonalTerrain.mudCells(TerrainType.SPRING, 1)).isEmpty();

        var t = new SeasonalTerrain(TerrainType.AUTUMN, 1);
        Position gone = SeasonalTerrain.mudCells(TerrainType.AUTUMN, 1).stream()
                .filter(p -> !SeasonalTerrain.mudCells(TerrainType.AUTUMN, 2).contains(p)).findFirst().orElseThrow();
        assertThat(t.speedFactorAt(EnemyType.ORC, gone.x(), gone.y())).isEqualTo(SeasonalTerrain.MUD_SPEED_FACTOR);
        t.beginWave(2); // la flaque a séché : plus de ralentissement à cet endroit
        assertThat(t.speedFactorAt(EnemyType.ORC, gone.x(), gone.y())).isEqualTo(1.0);
        assertThat(t.snapshot(List.of()).mud()).isEqualTo(SeasonalTerrain.mudCells(TerrainType.AUTUMN, 2));
    }

    @Test void giantsWadeThroughMud() {
        var autumn = new SeasonalTerrain(TerrainType.AUTUMN, 1);
        assertThat(autumn.speedFactorAt(EnemyType.TROLL, 12, 3)).isEqualTo(1.0);
        assertThat(autumn.speedFactorAt(EnemyType.BOSS_WARLORD, 12, 3)).isEqualTo(1.0);
        for (EnemyType small : List.of(EnemyType.GOBLIN, EnemyType.ORC, EnemyType.DARK_KNIGHT, EnemyType.SAPEUR, EnemyType.CHARIOT))
            assertThat(autumn.speedFactorAt(small, 12, 3)).as(small.name()).isEqualTo(SeasonalTerrain.MUD_SPEED_FACTOR);

        // En solo : un Troll met autant de temps sur la carte boueuse que sans boue.
        var muddy = MapCatalog.buildMap("autumn");
        var dry = MapCatalog.buildMap("autumn");
        dry.setTerrain(TerrainType.NONE);
        var simulation = new WaveSimulationService(new PathfindingService());
        int muddyTicks = simulation.simulate(muddy, new Wave(1, List.of(new Enemy(EnemyType.TROLL, 0, 3))), castle()).ticks().size();
        int dryTicks = simulation.simulate(dry, new Wave(1, List.of(new Enemy(EnemyType.TROLL, 0, 3))), castle()).ticks().size();
        assertThat(muddyTicks).isEqualTo(dryTicks);
    }

    @Test void fogMovesEachWaveFollowingTheAnnouncedCycle() {
        var t = new SeasonalTerrain(TerrainType.AUTUMN, 1);
        Tower covered = new Tower(TowerType.ARCHER, 6, 5); // banc nord-ouest de la vague 1
        Tower wall = new Tower(TowerType.WALL, 6, 3);
        assertThat(t.fogged(covered)).isTrue();
        assertThat(t.rangeOf(covered)).isEqualTo(covered.getRange() - SeasonalTerrain.FOG_RANGE_PENALTY);
        assertThat(t.fogged(wall)).isFalse();

        t.beginWave(2); // le banc passe au nord-est : (6,5) est dégagée
        assertThat(t.fogged(covered)).isFalse();
        assertThat(t.rangeOf(covered)).isEqualTo(covered.getRange());
        assertThat(t.snapshot(List.of(covered)).foggedTowers()).isEmpty();
        t.beginWave(4); // cycle de 3 : même brume qu'à la vague 1
        assertThat(t.snapshot(List.of(covered)).foggedTowers()).containsExactly(covered.getId());

        for (int wave = 1; wave <= 9; wave++) {
            var forecast = SeasonalTerrain.forecast(TerrainType.AUTUMN, wave);
            assertThat(forecast.fogCells()).isEqualTo(SeasonalTerrain.fogCells(TerrainType.AUTUMN, wave));
            assertThat(forecast.fogCells()).isNotEqualTo(SeasonalTerrain.fogCells(TerrainType.AUTUMN, wave + 1));
            assertThat(forecast.fogCells()).isEqualTo(SeasonalTerrain.fogCells(TerrainType.AUTUMN, wave + 3));
        }
        assertThat(SeasonalTerrain.fogCells(TerrainType.SPRING, 1)).isEmpty();
    }

    @Test void soloMudDelaysTheWave() {
        var muddy = MapCatalog.buildMap("autumn");
        var dry = MapCatalog.buildMap("autumn");
        dry.setTerrain(TerrainType.NONE);
        var simulation = new WaveSimulationService(new PathfindingService());
        int muddyTicks = simulation.simulate(muddy, new Wave(1, List.of(new Enemy(EnemyType.ORC, 0, 3))), castle()).ticks().size();
        int dryTicks = simulation.simulate(dry, new Wave(1, List.of(new Enemy(EnemyType.ORC, 0, 3))), castle()).ticks().size();
        assertThat(muddyTicks).isGreaterThan(dryTicks);
    }

    @Test void soloFogShortensTheCoverOfACoveredTower() {
        // Même archer, même ennemi : couvert par la brume (vague 1), il tire moins longtemps
        // qu'à la vague 2, où le banc s'est déplacé.
        var simulation = new WaveSimulationService(new PathfindingService());
        assertThat(shotsOfArcherAt65(simulation, 1)).isLessThan(shotsOfArcherAt65(simulation, 2));
    }

    private long shotsOfArcherAt65(WaveSimulationService simulation, int waveNumber) {
        var map = MapCatalog.buildMap("autumn");
        map.placeTower(new Tower(TowerType.ARCHER, 6, 5));
        var result = simulation.simulate(map, new Wave(waveNumber, List.of(new Enemy(EnemyType.TROLL, 0, 3, 0, 100_000))), castle());
        return result.ticks().stream().mapToLong(t -> t.damageEvents().size()).sum();
    }

    @Test void fogProtectsCoveredTowersFromSiegeDamage() {
        var t = new SeasonalTerrain(TerrainType.AUTUMN, 1);
        Tower covered = new Tower(TowerType.ARCHER, 6, 5);   // banc nord-ouest, vague 1
        Tower clear = new Tower(TowerType.ARCHER, 6, 10);
        Tower wall = new Tower(TowerType.WALL, 6, 5);
        assertThat(t.fogged(covered)).isTrue();
        assertThat(t.fogged(clear)).isFalse();
        assertThat(t.siegeDamageTo(clear, 40)).isEqualTo(40);
        assertThat(t.siegeDamageTo(wall, 40)).isEqualTo(40);           // un mur n'est jamais couvert
        assertThat(t.siegeDamageTo(covered, 40)).isEqualTo(18);         // 40 × 0,45

        // Rayon de 1 dégât par tick : le reste est reporté, -55 % exact sur la durée.
        var ray = new SeasonalTerrain(TerrainType.AUTUMN, 1);
        int dealt = 0;
        for (int tick = 0; tick < 100; tick++) dealt += ray.siegeDamageTo(covered, 1);
        assertThat(dealt).isEqualTo(45);

        // Hors automne, aucune protection.
        assertThat(new SeasonalTerrain(TerrainType.SPRING, 1).siegeDamageTo(covered, 40)).isEqualTo(40);

        // Solo : même tour, même Troll — couverte (vague 1), elle perd ~45 % de ce qu'elle perd à découvert (vague 2).
        int lostCovered = soloRayDamage(1), lostClear = soloRayDamage(2);
        assertThat(lostClear).isPositive();
        assertThat(lostCovered).isCloseTo((int) Math.round(lostClear * SeasonalTerrain.FOG_DAMAGE_TAKEN_FACTOR), within(1));
    }

    private int soloRayDamage(int waveNumber) {
        var map = MapCatalog.buildMap("autumn");
        Tower tower = new Tower(TowerType.ARCHER, 6, 5); map.placeTower(tower);
        var troll = new Enemy(EnemyType.TROLL, 0, 3, 0, 1_000_000);
        new WaveSimulationService(new PathfindingService()).simulate(map, new Wave(waveNumber, List.of(troll)), castle());
        return tower.getMaxHp() - tower.getHp();
    }

    @Test void liveMudAndFogUseTheSameRulesAsSolo() {
        var engine = new MatchEngine(new PathfindingService());
        var map = MapCatalog.buildMap("autumn");
        var covered = new Tower(TowerType.ARCHER, 6, 5); map.placeTower(covered);
        var state = engine.start(map);
        state.wave = 1;
        var inMud = new LiveEnemy(EnemyType.ORC, 12, 3); inMud.pathIndex = 12;
        var onRoad = new LiveEnemy(EnemyType.ORC, 1, 3); onRoad.pathIndex = 1;
        var trollInMud = new LiveEnemy(EnemyType.TROLL, 12, 3); trollInMud.pathIndex = 12;
        var trollOnRoad = new LiveEnemy(EnemyType.TROLL, 1, 3); trollOnRoad.pathIndex = 1;
        state.enemies.addAll(List.of(inMud, onRoad, trollInMud, trollOnRoad));
        engine.step(state, 120);
        assertThat(inMud.x - 12).isLessThan((onRoad.x - 1) * 0.7);
        assertThat(trollInMud.x - 12).isCloseTo(trollOnRoad.x - 1, within(1e-9));
        assertThat(state.terrain.snapshot(map.getTowers()).foggedTowers()).containsExactly(covered.getId());
        state.wave = 2;
        engine.step(state, 120);
        assertThat(state.terrain.snapshot(map.getTowers()).foggedTowers()).isEmpty();
    }

    // ── Cartes ───────────────────────────────────────────────────────────

    @Test void seasonalMapsPersistAndHazardCellsMatchTheirRole() {
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
        assertThat(paths.corridorCells(MapCatalog.buildMap("spring"))).doesNotContainAnyElementsOf(SeasonalTerrain.bankCells());
        assertThat(paths.buildableCells(MapCatalog.buildMap("spring"))).containsAll(SeasonalTerrain.bankCells());
        // La boue est SUR le chemin : elle ne touche que les ennemis.
        assertThat(paths.corridorCells(MapCatalog.buildMap("autumn"))).containsAll(SeasonalTerrain.mudSlots());
        // Printemps : château au centre du lac, un fort de chaque côté, 4 voies.
        var spring = MapCatalog.buildMap("spring");
        assertThat(paths.findLanePaths(spring)).hasSize(4);
        assertThat(spring.getLanes().stream().map(List::getFirst).distinct())
                .containsExactlyInAnyOrder(new Position(0, 8), new Position(19, 8));
        assertThat(spring.getPathEnd()).isEqualTo(new Position(10, 8));
        // L'eau du lac n'est ni route ni case de tour (plus de tour posée sur l'eau).
        assertThat(paths.buildableCells(spring)).doesNotContainAnyElementsOf(SeasonalTerrain.waterCells(TerrainType.SPRING));
        assertThat(paths.corridorCells(spring)).doesNotContainAnyElementsOf(SeasonalTerrain.waterCells(TerrainType.SPRING));
        assertThat(SeasonalTerrain.waterCells(TerrainType.AUTUMN)).isEmpty();
        // Automne : une entrée, le serpentin et le raccourci.
        assertThat(paths.findLanePaths(MapCatalog.buildMap("autumn"))).hasSize(2);
        assertThat(MapCatalog.buildMap("autumn").getCorridorHalfWidth()).isEqualTo(1);
        assertThat(MapCatalog.buildMap("desert").getTerrain()).isEqualTo(TerrainType.NONE);
    }
}
