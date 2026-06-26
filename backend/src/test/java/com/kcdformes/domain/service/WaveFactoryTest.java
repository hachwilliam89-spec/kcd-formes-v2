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

    @Test
    @DisplayName("La croissance des PV est composée : la vague 20 dépasse largement ce qu'un facteur additif donnerait")
    void createWave_hpGrowth_isCompoundedNotLinear() {
        Wave wave1 = waveFactory.createWave(1, spawn);
        Wave wave20 = waveFactory.createWave(20, spawn);

        int goblinHpWave1 = wave1.getEnemies().get(0).getMaxHp();
        int goblinHpWave20 = wave20.getEnemies().stream()
                .filter(e -> e.getType() == EnemyType.GOBLIN)
                .findFirst().orElseThrow()
                .getMaxHp();

        // Avec l'ancien facteur additif (+50 %/vague), la vague 20 aurait eu un
        // multiplicateur de 1 + 19*0.5 = 10.5. Le facteur composé doit le dépasser
        // nettement — c'est tout l'objet du changement (voir WaveFactory).
        double additiveMultiplierWave20 = 1 + (20 - 1) * 0.5;
        double actualMultiplier = (double) goblinHpWave20 / goblinHpWave1;

        assertThat(actualMultiplier).isGreaterThan(additiveMultiplierWave20);
    }

    @Test
    @DisplayName("Le nombre de Trolls augmente avec le numéro de vague (plus seulement 1 fixe)")
    void createWave_trollCount_growsWithWaveNumber() {
        Wave wave6 = waveFactory.createWave(6, spawn);
        Wave wave14 = waveFactory.createWave(14, spawn);

        long trollCountWave6 = wave6.getEnemies().stream().filter(e -> e.getType() == EnemyType.TROLL).count();
        long trollCountWave14 = wave14.getEnemies().stream().filter(e -> e.getType() == EnemyType.TROLL).count();

        assertThat(trollCountWave6).isEqualTo(1);
        assertThat(trollCountWave14).isGreaterThan(trollCountWave6);
    }

    @Test
    @DisplayName("Le nombre de Chevaliers noirs augmente avec le numéro de vague (plus seulement 1 fixe)")
    void createWave_darkKnightCount_growsWithWaveNumber() {
        Wave wave10 = waveFactory.createWave(10, spawn);
        Wave wave40 = waveFactory.createWave(40, spawn);

        long dkCountWave10 = wave10.getEnemies().stream().filter(e -> e.getType() == EnemyType.DARK_KNIGHT).count();
        long dkCountWave40 = wave40.getEnemies().stream().filter(e -> e.getType() == EnemyType.DARK_KNIGHT).count();

        assertThat(dkCountWave10).isEqualTo(1);
        assertThat(dkCountWave40).isGreaterThan(dkCountWave10);
    }
}
