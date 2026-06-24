package com.kcdformes.domain.service;

import com.kcdformes.domain.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class WaveFactoryTest {

    private WaveFactory waveFactory;
    private Position spawn;

    @BeforeEach
    void setUp() {
        waveFactory = new WaveFactory();
        spawn = new Position(0, 7);
    }

    @Test
    @DisplayName("Wave 1 — only goblins")
    void createWave_wave1_containsOnlyGoblins() {
        Wave wave = waveFactory.createWave(1, spawn);

        assertThat(wave.getEnemies()).isNotEmpty();
        assertThat(wave.getEnemies())
                .allMatch(e -> e.getType() == EnemyType.GOBLIN);
    }

    @Test
    @DisplayName("Wave 3 — contains orcs")
    void createWave_wave3_containsOrcs() {
        Wave wave = waveFactory.createWave(3, spawn);

        assertThat(wave.getEnemies())
                .anyMatch(e -> e.getType() == EnemyType.ORC);
    }

    @Test
    @DisplayName("Wave 6 — contains a troll")
    void createWave_wave6_containsTroll() {
        Wave wave = waveFactory.createWave(6, spawn);

        assertThat(wave.getEnemies())
                .anyMatch(e -> e.getType() == EnemyType.TROLL);
    }

    @Test
    @DisplayName("Wave number increases difficulty")
    void createWave_laterWaves_haveMoreEnemies() {
        Wave wave1 = waveFactory.createWave(1, spawn);
        Wave wave5 = waveFactory.createWave(5, spawn);

        assertThat(wave5.getEnemies().size())
                .isGreaterThan(wave1.getEnemies().size());
    }
}
