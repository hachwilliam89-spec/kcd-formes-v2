package com.kcdformes.domain.service;

import com.kcdformes.domain.model.Castle;
import com.kcdformes.domain.model.Enemy;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.Wave;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.*;

/**
 * Socle multi-voies : une carte peut porter plusieurs tracés qui convergent tous
 * sur le château. Vérifie que les ennemis se répartissent entre voies, que chaque
 * voie a son propre chemin (même arrivée), que le couloir fin (halfWidth 0) libère
 * le terrain entre les voies, et que la simulation se résout de bout en bout.
 */
class MultiLaneSimulationTest {

    // Deux voies distinctes (haut / bas) partageant la case château (19,8).
    private static final Position CASTLE = new Position(19, 8);
    private static final List<Position> LANE_TOP = List.of(new Position(0, 3), new Position(19, 3), CASTLE);
    private static final List<Position> LANE_BOTTOM = List.of(new Position(0, 13), new Position(19, 13), CASTLE);

    private GameMap twoLaneMap() {
        return GameMap.ofLanes(20, 16, List.of(LANE_TOP, LANE_BOTTOM), 0);
    }

    @Test
    @DisplayName("Une vague multi-voies répartit les ennemis entre les voies (round-robin)")
    void multiLaneWave_distributesEnemiesAcrossLanes() {
        Wave wave = new WaveFactory().createWave(3,
                List.of(new Position(0, 3), new Position(0, 13)), 42L);

        List<Enemy> enemies = wave.getEnemies();
        assertThat(enemies).anyMatch(e -> e.getLaneIndex() == 0);
        assertThat(enemies).anyMatch(e -> e.getLaneIndex() == 1);
        // Chaque ennemi démarre au départ de SA voie.
        assertThat(enemies).allSatisfy(e -> {
            double expectedY = e.getLaneIndex() == 0 ? 3.0 : 13.0;
            assertThat(e.getX()).isEqualTo(0.0);
            assertThat(e.getY()).isEqualTo(expectedY);
        });
    }

    @Test
    @DisplayName("Chaque voie a son propre chemin, toutes terminant sur le château")
    void findLanePaths_returnsOnePathPerLane_sharingCastle() {
        List<List<Position>> paths = new PathfindingService().findLanePaths(twoLaneMap());

        assertThat(paths).hasSize(2);
        assertThat(paths).allSatisfy(p -> assertThat(p.get(p.size() - 1)).isEqualTo(CASTLE));
        // Les deux tracés sont distincts (l'un passe par le haut, l'autre par le bas).
        assertThat(paths.get(0)).contains(new Position(5, 3)).doesNotContain(new Position(5, 13));
        assertThat(paths.get(1)).contains(new Position(5, 13)).doesNotContain(new Position(5, 3));
    }

    @Test
    @DisplayName("Couloir fin (halfWidth 0) : seules les cases de voie sont inconstructibles")
    void corridorCells_thinLanes_freesTerrainBetweenLanes() {
        var corridor = new PathfindingService().corridorCells(twoLaneMap());

        // Sur les voies : inconstructible.
        assertThat(corridor).contains(new Position(5, 3), new Position(5, 13));
        // Entre les voies : libéré (aucune marge de +/-1 avec halfWidth 0).
        assertThat(corridor).doesNotContain(new Position(5, 5), new Position(5, 8));
    }

    @Test
    @DisplayName("La simulation multi-voies se résout : sans tour, le château encaisse des deux voies")
    void simulate_multiLane_castleTakesDamage() {
        GameMap map = twoLaneMap();
        Castle castle = new Castle(java.util.UUID.randomUUID(), java.util.UUID.randomUUID(), "Test", 100, 100, 1);
        Wave wave = new WaveFactory().createWave(3,
                List.of(new Position(0, 3), new Position(0, 13)), 42L);
        wave.start();

        WaveSimulationService.SimulationResult result =
                new WaveSimulationService(new PathfindingService()).simulate(map, wave, castle);

        assertThat(result.ticks()).isNotEmpty();
        assertThat(result.castleDamageTaken()).isGreaterThan(0);
    }
}
