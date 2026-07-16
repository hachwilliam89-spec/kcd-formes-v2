package com.kcdformes.domain.service;

import com.kcdformes.domain.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.*;

class PathfindingServiceTest {

    private PathfindingService pathfindingService;
    private GameMap map;

    @BeforeEach
    void setUp() {
        pathfindingService = new PathfindingService();
        map = new GameMap(5, 5,
                new Position(0, 2),
                new Position(4, 2));
    }

    @Test
    @DisplayName("Empty map — path should exist")
    void findPath_onEmptyMap_returnsPath() {
        List<Position> path = pathfindingService.findPath(map);
        assertThat(path).isNotNull().isNotEmpty();
        assertThat(path.get(0)).isEqualTo(new Position(0, 2));
        assertThat(path.get(path.size() - 1)).isEqualTo(new Position(4, 2));
    }

    @Test
    @DisplayName("Blocked column — path goes around")
    void findPath_withBlockedColumn_findsAlternatePath() {
        // Bloque la colonne x=2 sauf en y=0
        map.placeTower(new Tower(TowerType.ARCHER, 2, 1));
        map.placeTower(new Tower(TowerType.ARCHER, 2, 2));
        map.placeTower(new Tower(TowerType.ARCHER, 2, 3));
        map.placeTower(new Tower(TowerType.ARCHER, 2, 4));

        List<Position> path = pathfindingService.findPath(map);
        assertThat(path).isNotNull(); // passe par y=0
    }

    @Test
    @DisplayName("Fully blocked — no path exists")
    void findPath_fullyBlocked_returnsNull() {
        // Bloque toute la colonne x=2
        for (int y = 0; y < 5; y++) {
            map.placeTower(new Tower(TowerType.ARCHER, 2, y));
        }

        List<Position> path = pathfindingService.findPath(map);
        assertThat(path).isNull();
    }

    @Test
    @DisplayName("hasPath delegates to findPath correctly")
    void hasPath_whenPathExists_returnsTrue() {
        assertThat(pathfindingService.hasPath(map)).isTrue();
    }

    @Test
    @DisplayName("Couloir strict : le chemin ignore les tours, même posées sur son tracé")
    void findCorridorPath_ignoresTowers() {
        List<Position> emptyPath = pathfindingService.findCorridorPath(map);

        // Tour posée directement sur le tracé (possible via GameMap en test —
        // PlaceTowerService l'interdit en production, voir CellOnPathException) :
        // le couloir ne doit PAS dévier, contrairement à findPath (mode labyrinthe).
        map.placeTower(new Tower(TowerType.ARCHER, 2, 2));

        assertThat(pathfindingService.findCorridorPath(map)).isEqualTo(emptyPath);
        assertThat(pathfindingService.findCorridorPath(map)).contains(new Position(2, 2));
    }

    @Test
    @DisplayName("Couloir strict : la bande inconstructible couvre le chemin élargi d'une case")
    void corridorCells_coverPathPlusOneCell() {
        var cells = pathfindingService.corridorCells(map);

        // Chemin horizontal y=2 : la bande couvre y=1..3 sur toute la longueur.
        assertThat(cells).contains(new Position(2, 1), new Position(2, 2), new Position(2, 3));
        assertThat(cells).doesNotContain(new Position(2, 0), new Position(2, 4));
    }
}
