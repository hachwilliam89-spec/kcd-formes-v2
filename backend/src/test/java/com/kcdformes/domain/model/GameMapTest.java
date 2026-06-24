package com.kcdformes.domain.model;

import com.kcdformes.domain.exception.CellOccupiedException;
import com.kcdformes.domain.exception.InvalidPositionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class GameMapTest {

    private GameMap map;

    @BeforeEach
    void setUp() {
        map = new GameMap(20, 15,
                new Position(0, 7),
                new Position(19, 7));
    }

    @Test
    @DisplayName("Place tower on empty cell — should succeed")
    void placeTower_onEmptyCell_succeeds() {
        Tower tower = new Tower(TowerType.ARCHER, 3, 5);
        map.placeTower(tower);

        assertThat(map.getTowerAt(3, 5)).isPresent();
        assertThat(map.getTowers()).hasSize(1);
    }

    @Test
    @DisplayName("Place tower on occupied cell — should throw CellOccupiedException")
    void placeTower_onOccupiedCell_throwsCellOccupiedException() {
        map.placeTower(new Tower(TowerType.ARCHER, 3, 5));

        assertThatThrownBy(() -> map.placeTower(new Tower(TowerType.MAGE, 3, 5)))
                .isInstanceOf(CellOccupiedException.class)
                .hasMessageContaining("3")
                .hasMessageContaining("5");
    }

    @Test
    @DisplayName("Place tower outside bounds — should throw InvalidPositionException")
    void placeTower_outsideBounds_throwsInvalidPositionException() {
        assertThatThrownBy(() -> map.placeTower(new Tower(TowerType.ARCHER, 25, 5)))
                .isInstanceOf(InvalidPositionException.class);
    }

    @Test
    @DisplayName("Remove tower — should return removed tower and free cell")
    void removeTower_shouldFreeCell() {
        map.placeTower(new Tower(TowerType.ARCHER, 3, 5));

        var removed = map.removeTower(3, 5);

        assertThat(removed).isPresent();
        assertThat(map.getTowerAt(3, 5)).isEmpty();
        assertThat(map.isCellBlocked(3, 5)).isFalse();
    }

    @Test
    @DisplayName("Remove tower from empty cell — should return empty")
    void removeTower_fromEmptyCell_returnsEmpty() {
        var result = map.removeTower(5, 5);
        assertThat(result).isEmpty();
    }
}
