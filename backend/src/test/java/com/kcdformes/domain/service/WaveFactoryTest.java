package com.kcdformes.domain.service;

import com.kcdformes.domain.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.*;

/**
 * Depuis l'introduction du seed de partie, WaveFactory n'est plus 100 %
 * déterministe par numéro de vague seul (voir sa javadoc) : ces tests
 * utilisent donc soit des seeds fixes (pour vérifier un résultat exact et
 * reproductible), soit des bornes/invariants valables pour n'importe quel
 * seed, plutôt que des comptes strictement égaux comme avant.
 */
class WaveFactoryTest {

    private WaveFactory waveFactory;
    private Position spawn;

    @BeforeEach
    void setUp() {
        waveFactory = new WaveFactory();
        spawn = new Position(0, 7);
    }

    @Test
    @DisplayName("Wave 1 — only goblins, quel que soit le seed")
    void createWave_wave1_containsOnlyGoblins() {
        // Le seuil Orc/Troll/Sapeur est jitteré mais jamais sous 2 (voir
        // WaveFactory.eliteThreshold) : la vague 1 doit donc toujours rester
        // 100% Goblin, peu importe le seed de la partie.
        for (long seed : List.of(0L, 1L, 2L, 42L, -7L, Long.MAX_VALUE, Long.MIN_VALUE)) {
            Wave wave = waveFactory.createWave(1, spawn, seed);

            assertThat(wave.getEnemies()).isNotEmpty();
            assertThat(wave.getEnemies())
                    .allMatch(e -> e.getType() == EnemyType.GOBLIN);
        }
    }

    @Test
    @DisplayName("Wave 6 — contient toujours au moins un Orc, un Troll et un Sapeur")
    void createWave_wave6_alwaysContainsEliteMix() {
        // Le seuil jitteré vaut au plus 4 (voir eliteThreshold) : la vague 6 est
        // donc toujours au-delà du seuil, quel que soit le seed, et le minimum
        // garanti (minGuaranteed=1, voir ThreatBudgetMix) assure la présence
        // d'au moins une occurrence de chaque type du mix.
        for (long seed : List.of(0L, 1L, 2L, 42L, -7L)) {
            Wave wave = waveFactory.createWave(6, spawn, seed);

            assertThat(wave.getEnemies()).anyMatch(e -> e.getType() == EnemyType.ORC);
            assertThat(wave.getEnemies()).anyMatch(e -> e.getType() == EnemyType.TROLL);
            assertThat(wave.getEnemies()).anyMatch(e -> e.getType() == EnemyType.SAPEUR);
        }
    }

    @Test
    @DisplayName("Wave number increases difficulty")
    void createWave_laterWaves_haveMoreEnemies() {
        Wave wave1 = waveFactory.createWave(1, spawn, 123L);
        Wave wave5 = waveFactory.createWave(5, spawn, 123L);

        assertThat(wave5.getEnemies().size())
                .isGreaterThan(wave1.getEnemies().size());
    }

    @Test
    @DisplayName("La croissance des PV est composée sur le segment early (avant la cassure de la vague 12)")
    void createWave_hpGrowth_isCompoundedNotLinear() {
        // Mesuré sur v1 -> v12 : depuis la courbe à deux pentes (voir
        // WaveFactory.HP_CURVE_BREAK_WAVE), la vague 20 ne suit volontairement
        // PLUS l'exponentielle pleine — l'ancienne borne (multiplicateur > 10.5
        // à la v20) est donc périmée par design, pas par régression. Le
        // comportement composé reste garanti sur le segment early, et la
        // cassure elle-même est couverte par createWave_hpGrowth_slowsAfterCurveBreak.
        Wave wave1 = waveFactory.createWave(1, spawn, 1L);
        Wave wave12 = waveFactory.createWave(12, spawn, 1L);

        int goblinHpWave1 = wave1.getEnemies().get(0).getMaxHp();
        int goblinHpWave12 = wave12.getEnemies().stream()
                .filter(e -> e.getType() == EnemyType.GOBLIN)
                .findFirst().orElseThrow()
                .getMaxHp();

        // Facteur additif équivalent à la v12 : 1 + 11*0.16 = 2.76. Le composé
        // (1.16^11 ≈ 5.1) doit le dépasser nettement.
        double additiveMultiplierWave12 = 1 + (12 - 1) * 0.16;
        double actualMultiplier = (double) goblinHpWave12 / goblinHpWave1;

        assertThat(actualMultiplier).isGreaterThan(additiveMultiplierWave12 * 1.5);
    }

    @Test
    @DisplayName("Le budget de menace Orc/Troll/Sapeur augmente avec le numéro de vague")
    void eliteBudget_growsWithWaveNumber() {
        int threshold = 3; // valeur arbitraire fixe, seule la formule est testée ici
        int budgetAtThreshold = WaveFactory.eliteBudget(threshold, threshold);
        int budgetMuchLater = WaveFactory.eliteBudget(threshold + 14, threshold);

        assertThat(budgetMuchLater).isGreaterThan(budgetAtThreshold);
    }

    @Test
    @DisplayName("Le mix Orc/Troll/Sapeur ne dépasse jamais son budget de menace")
    void eliteMix_neverExceedsBudget() {
        for (long seed : List.of(0L, 1L, 2L, 42L, -7L)) {
            int threshold = WaveFactory.eliteThreshold(seed);
            for (int waveNumber = threshold; waveNumber <= threshold + 20; waveNumber++) {
                Wave wave = waveFactory.createWave(waveNumber, spawn, seed);

                long orcCount = wave.getEnemies().stream().filter(e -> e.getType() == EnemyType.ORC).count();
                long trollCount = wave.getEnemies().stream().filter(e -> e.getType() == EnemyType.TROLL).count();
                long sapeurCount = wave.getEnemies().stream().filter(e -> e.getType() == EnemyType.SAPEUR).count();

                int spent = (int) (orcCount * EnemyType.ORC.goldReward
                        + trollCount * EnemyType.TROLL.goldReward
                        + sapeurCount * EnemyType.SAPEUR.goldReward);

                assertThat(spent).isLessThanOrEqualTo(WaveFactory.eliteBudget(waveNumber, threshold));
            }
        }
    }

    @Test
    @DisplayName("Le nombre de Chevaliers noirs augmente avec le numéro de vague (formule)")
    void darkKnightCount_growsWithWaveNumber() {
        int threshold = 10; // valeur arbitraire fixe, seule la formule est testée ici
        int countAtThreshold = WaveFactory.darkKnightCount(threshold, threshold);
        int countMuchLater = WaveFactory.darkKnightCount(threshold + 30, threshold);

        assertThat(countAtThreshold).isEqualTo(1);
        assertThat(countMuchLater).isGreaterThan(countAtThreshold);
    }

    @Test
    @DisplayName("Aucun Orc/Troll/Sapeur avant le seuil jitteré (pour un seed donné)")
    void createWave_beforeEliteThreshold_noEliteEnemies() {
        long seed = 7L;
        int threshold = WaveFactory.eliteThreshold(seed);

        for (int waveNumber = 1; waveNumber < threshold; waveNumber++) {
            Wave wave = waveFactory.createWave(waveNumber, spawn, seed);

            assertThat(wave.getEnemies()).noneMatch(e -> e.getType() == EnemyType.ORC);
            assertThat(wave.getEnemies()).noneMatch(e -> e.getType() == EnemyType.TROLL);
            assertThat(wave.getEnemies()).noneMatch(e -> e.getType() == EnemyType.SAPEUR);
        }
    }

    @Test
    @DisplayName("Orc/Troll/Sapeur apparaissent dès le seuil jitteré (pour un seed donné)")
    void createWave_atEliteThreshold_containsEliteMix() {
        long seed = 7L;
        int threshold = WaveFactory.eliteThreshold(seed);

        Wave wave = waveFactory.createWave(threshold, spawn, seed);

        assertThat(wave.getEnemies()).anyMatch(e -> e.getType() == EnemyType.ORC);
        assertThat(wave.getEnemies()).anyMatch(e -> e.getType() == EnemyType.TROLL);
        assertThat(wave.getEnemies()).anyMatch(e -> e.getType() == EnemyType.SAPEUR);
    }

    @Test
    @DisplayName("Le seuil Orc/Troll/Sapeur est jitteré entre 2 et 4 selon le seed, jamais en dehors")
    void eliteThreshold_isWithinJitterBounds() {
        IntStream.range(-50, 50).forEach(i -> {
            int threshold = WaveFactory.eliteThreshold((long) i);
            assertThat(threshold).isBetween(2, 4);
        });
    }

    @Test
    @DisplayName("Même seed + même vague => même composition (reproductible au sein d'une partie)")
    void createWave_sameSeedAndWave_isReproducible() {
        Wave first = waveFactory.createWave(8, spawn, 999L);
        Wave second = waveFactory.createWave(8, spawn, 999L);

        List<EnemyType> firstTypes = first.getEnemies().stream().map(Enemy::getType).toList();
        List<EnemyType> secondTypes = second.getEnemies().stream().map(Enemy::getType).toList();

        assertThat(firstTypes).isEqualTo(secondTypes);
    }

    @Test
    @DisplayName("Des seeds différents produisent des compositions différentes (variabilité entre parties)")
    void createWave_differentSeeds_produceDifferentCompositions() {
        // Sur un échantillon de vagues, au moins une doit différer entre deux
        // seeds — un seul seed pourrait coïncider par hasard, mais pas dix.
        boolean anyDifference = IntStream.rangeClosed(5, 14).anyMatch(waveNumber -> {
            Wave a = waveFactory.createWave(waveNumber, spawn, 11L);
            Wave b = waveFactory.createWave(waveNumber, spawn, 22L);
            List<EnemyType> typesA = a.getEnemies().stream().map(Enemy::getType).toList();
            List<EnemyType> typesB = b.getEnemies().stream().map(Enemy::getType).toList();
            return !typesA.equals(typesB);
        });

        assertThat(anyDifference).isTrue();
    }

    @Test
    @DisplayName("Le Boss apparaît toutes les 10 vagues, jamais avant ni entre deux paliers")
    void createWave_bossAppearsEveryTenWaves() {
        for (long seed : List.of(0L, 1L, 2L, 42L, -7L)) {
            for (int waveNumber = 1; waveNumber <= 30; waveNumber++) {
                Wave wave = waveFactory.createWave(waveNumber, spawn, seed);
                boolean hasBoss = wave.getEnemies().stream().anyMatch(e -> e.getType() == EnemyType.BOSS_WARLORD);

                if (waveNumber % 10 == 0) {
                    assertThat(hasBoss).as("vague %d (seed %d) devrait contenir un Boss", waveNumber, seed).isTrue();
                } else {
                    assertThat(hasBoss).as("vague %d (seed %d) ne devrait pas contenir de Boss", waveNumber, seed).isFalse();
                }
            }
        }
    }

    @Test
    @DisplayName("Une vague à Boss contient toujours une escorte d'ennemis classiques (pas un Boss seul)")
    void createWave_bossWave_alwaysHasEscort() {
        for (long seed : List.of(0L, 1L, 2L, 42L, -7L)) {
            Wave wave = waveFactory.createWave(10, spawn, seed);

            assertThat(wave.getEnemies()).anyMatch(e -> e.getType() == EnemyType.BOSS_WARLORD);
            assertThat(wave.getEnemies()).anyMatch(e -> e.getType() != EnemyType.BOSS_WARLORD);
        }
    }

    @Test
    @DisplayName("Le Chevalier noir n'apparaît pas sur une vague à Boss (pas d'empilement de mini-boss)")
    void createWave_bossWave_neverHasDarkKnight() {
        for (long seed : List.of(0L, 1L, 2L, 42L, -7L)) {
            for (int recurrence = 1; recurrence <= 3; recurrence++) {
                Wave wave = waveFactory.createWave(recurrence * 10, spawn, seed);
                assertThat(wave.getEnemies()).noneMatch(e -> e.getType() == EnemyType.DARK_KNIGHT);
            }
        }
    }

    @Test
    @DisplayName("Le Boss ouvre la vague : il est le premier spawn, jamais le dernier")
    void createWave_boss_opensTheWave() {
        for (long seed : List.of(0L, 1L, 2L, 42L, -7L)) {
            Wave wave = waveFactory.createWave(10, spawn, seed);
            // L'ordre de la liste = l'ordre de spawn (voir WaveFactory.toEnemies) :
            // le Boss doit être en tête pour apparaître dès le début de la vague —
            // l'escorte spawnée derrière le rattrape et profite de son aura.
            assertThat(wave.getEnemies().get(0).getType()).isEqualTo(EnemyType.BOSS_WARLORD);
        }
    }

    @Test
    @DisplayName("Le nombre de Sapeurs par vague est plafonné, même en vague profonde")
    void createWave_sapeurCount_isCappedPerWave() {
        for (long seed : List.of(0L, 1L, 2L, 42L, -7L)) {
            for (int waveNumber : List.of(12, 15, 20, 30)) {
                long sapeurs = waveFactory.createWave(waveNumber, spawn, seed).getEnemies().stream()
                        .filter(e -> e.getType() == EnemyType.SAPEUR)
                        .count();
                // 5 = WaveFactory.SAPEUR_WAVE_CAP : sans plafond, le budget en
                // finançait 7+ dès la v15 — churn de tours inreconstructible
                // (mesuré au harnais, 9+ tours rasées par vague).
                assertThat(sapeurs)
                        .as("vague %d (seed %d)", waveNumber, seed)
                        .isLessThanOrEqualTo(5);
            }
        }
    }

    @Test
    @DisplayName("Courbe de PV à deux pentes : la croissance ralentit après la vague 12, sans discontinuité")
    void createWave_hpGrowth_slowsAfterCurveBreak() {
        // PV d'un Goblin (présent à toutes les vagues) comme sonde de la courbe.
        double hp11 = goblinHpAtWave(11);
        double hp12 = goblinHpAtWave(12);
        double hp13 = goblinHpAtWave(13);
        double hp14 = goblinHpAtWave(14);

        // Avant la cassure : pente forte (~1.16). Après : pente douce (~1.08).
        // Tolérances larges (arrondis sur de petits PV de base).
        assertThat(hp12 / hp11).isBetween(1.12, 1.20);
        assertThat(hp13 / hp12).isBetween(1.04, 1.12);
        assertThat(hp14 / hp13).isBetween(1.04, 1.12);
        // Continuité : les PV ne chutent jamais d'une vague à l'autre.
        assertThat(hp13).isGreaterThan(hp12);
    }

    private double goblinHpAtWave(int waveNumber) {
        return waveFactory.createWave(waveNumber, spawn, 7L).getEnemies().stream()
                .filter(e -> e.getType() == EnemyType.GOBLIN)
                .findFirst().orElseThrow()
                .getMaxHp();
    }

    @Test
    @DisplayName("Le nombre de Boss augmente avec les récurrences (vague 30 >= vague 10)")
    void createWave_bossCount_growsWithRecurrence() {
        long seed = 5L;
        long bossCountWave10 = waveFactory.createWave(10, spawn, seed).getEnemies().stream()
                .filter(e -> e.getType() == EnemyType.BOSS_WARLORD).count();
        long bossCountWave30 = waveFactory.createWave(30, spawn, seed).getEnemies().stream()
                .filter(e -> e.getType() == EnemyType.BOSS_WARLORD).count();

        assertThat(bossCountWave30).isGreaterThanOrEqualTo(bossCountWave10);
    }
}
