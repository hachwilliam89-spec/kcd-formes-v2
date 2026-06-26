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

    @Test
    @DisplayName("Coût d'amélioration niveau 1 == coût d'une tour neuve du même type")
    void getUpgradeCost_atLevel1_equalsBaseCost() {
        Tower tower = new Tower(TowerType.ARCHER, 2, 3);
        assertThat(tower.getUpgradeCost()).isEqualTo(TowerType.ARCHER.baseCost);
    }

    @Test
    @DisplayName("Coût d'amélioration grimpe avec le niveau (x2 au niveau 2, x3 au niveau 3...)")
    void getUpgradeCost_growsWithLevel() {
        Tower tower = new Tower(TowerType.CATAPULT, 2, 3);

        assertThat(tower.getUpgradeCost()).isEqualTo(TowerType.CATAPULT.baseCost); // niveau 1

        tower.upgrade(); // niveau 2
        assertThat(tower.getUpgradeCost()).isEqualTo(TowerType.CATAPULT.baseCost * 2);

        tower.upgrade(); // niveau 3
        assertThat(tower.getUpgradeCost()).isEqualTo(TowerType.CATAPULT.baseCost * 3);
    }

    @Test
    @DisplayName("PV max d'une tour neuve == baseCost * 3 (niveau 1)")
    void getMaxHp_atLevel1_equalsTripleBaseCost() {
        Tower tower = new Tower(TowerType.ARCHER, 0, 0);
        assertThat(tower.getMaxHp()).isEqualTo(TowerType.ARCHER.baseCost * 3);
    }

    @Test
    @DisplayName("Une tour neuve démarre à pleine vie")
    void newTower_startsAtFullHp() {
        Tower tower = new Tower(TowerType.MAGE, 0, 0);
        assertThat(tower.getHp()).isEqualTo(tower.getMaxHp());
    }

    @Test
    @DisplayName("takeSiegeDamage réduit les PV sans descendre sous zéro")
    void takeSiegeDamage_reducesHpWithoutGoingNegative() {
        Tower tower = new Tower(TowerType.ARCHER, 0, 0); // maxHp = 150
        tower.takeSiegeDamage(40);
        assertThat(tower.getHp()).isEqualTo(110);

        tower.takeSiegeDamage(1000);
        assertThat(tower.getHp()).isZero();
    }

    @Test
    @DisplayName("isDestroyed devient vrai quand les PV atteignent zéro")
    void isDestroyed_becomesTrueAtZeroHp() {
        Tower tower = new Tower(TowerType.ARCHER, 0, 0);
        assertThat(tower.isDestroyed()).isFalse();

        tower.takeSiegeDamage(tower.getMaxHp());
        assertThat(tower.isDestroyed()).isTrue();
    }

    @Test
    @DisplayName("upgrade() rend la tour à pleine vie au nouveau niveau, même si elle était endommagée")
    void upgrade_healsToFullHpAtNewLevel() {
        Tower tower = new Tower(TowerType.ARCHER, 0, 0);
        tower.takeSiegeDamage(50);
        tower.upgrade();

        assertThat(tower.getHp()).isEqualTo(tower.getMaxHp());
    }
}
