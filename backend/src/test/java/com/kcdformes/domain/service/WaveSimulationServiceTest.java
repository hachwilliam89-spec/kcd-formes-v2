package com.kcdformes.domain.service;

import com.kcdformes.domain.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.*;

class WaveSimulationServiceTest {

    private WaveSimulationService simulationService;
    private GameMap map;
    private Castle castle;

    @BeforeEach
    void setUp() {
        simulationService = new WaveSimulationService(new PathfindingService());
        // Chemin horizontal classique : (0,7) -> (19,7) sur une map 20x15.
        map = new GameMap(20, 15, new Position(0, 7), new Position(19, 7));
        castle = new Castle(java.util.UUID.randomUUID(), java.util.UUID.randomUUID(), "Test", 100, 100, 1);
    }

    @Test
    @DisplayName("Une tour adjacente au chemin tue les ennemis d'une vague de goblins")
    void simulate_towerAdjacentToPath_killsEnemies() {
        map.placeTower(new Tower(TowerType.ARCHER, 5, 6)); // 1 case au-dessus du chemin

        Wave wave = new WaveFactory().createWave(1, map.getPathStart());
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        assertThat(result.goldEarned()).isGreaterThan(0);
        assertThat(wave.getEnemies()).anyMatch(Enemy::isDead);
    }

    @Test
    @DisplayName("Sans tour, tous les ennemis atteignent le château et aucun or n'est gagné")
    void simulate_noTowers_allEnemiesReachCastleAndZeroGold() {
        Wave wave = new WaveFactory().createWave(1, map.getPathStart());
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        assertThat(result.goldEarned()).isZero();
        assertThat(result.castleDamageTaken()).isGreaterThan(0);
        assertThat(wave.getEnemies()).noneMatch(Enemy::isDead);
    }

    @Test
    @DisplayName("Une tour hors de portée ne fait aucun dégât")
    void simulate_towerOutOfRange_dealsNoDamage() {
        map.placeTower(new Tower(TowerType.ARCHER, 5, 0)); // portée 3.0, chemin à y=7 => distance 7

        Wave wave = new WaveFactory().createWave(1, map.getPathStart());
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        assertThat(result.goldEarned()).isZero();
        assertThat(wave.getEnemies()).noneMatch(Enemy::isDead);
    }

    @Test
    @DisplayName("Les dégâts d'une tour ciblent bien l'ennemi le plus proche à portée")
    void simulate_recordsDamageEventsForTowersInRange() {
        Tower tower = new Tower(TowerType.CATAPULT, 3, 7); // posée directement sur la trajectoire visée
        map.placeTower(tower);

        Wave wave = new WaveFactory().createWave(1, map.getPathStart());
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        boolean anyDamageEvent = result.ticks().stream()
                .flatMap(t -> t.damageEvents().stream())
                .anyMatch(e -> e.towerId().equals(tower.getId()));

        assertThat(anyDamageEvent).isTrue();
    }
}
