package com.kcdformes.domain.model;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class TowerTest {

    @Test
    @DisplayName("Tower damage scales with level")
    void getDamage_scalesWithLevel() {
        Tower tower = new Tower(TowerType.ARCHER, 0, 0);
        int baseDamage = tower.getDamage();

        tower.upgrade();
        int levelTwoDamage = tower.getDamage();

        assertThat(levelTwoDamage).isGreaterThan(baseDamage);
    }

    @Test
    @DisplayName("Tower can target enemy in range")
    void canTarget_enemyInRange_returnsTrue() {
        Tower tower = new Tower(TowerType.ARCHER, 5, 5); // range = 3.0
        Enemy enemy = new Enemy(EnemyType.GOBLIN, 6, 5); // distance = 1.0

        assertThat(tower.canTarget(enemy)).isTrue();
    }

    @Test
    @DisplayName("Tower cannot target enemy out of range")
    void canTarget_enemyOutOfRange_returnsFalse() {
        Tower tower = new Tower(TowerType.ARCHER, 0, 0); // range = 3.0
        Enemy enemy = new Enemy(EnemyType.GOBLIN, 10, 10); // distance >> 3.0

        assertThat(tower.canTarget(enemy)).isFalse();
    }
}
