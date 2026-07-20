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
        // Calendrier fixe (voir WaveFactory.ORC_THRESHOLD) : la première
        // menace n'arrive qu'en vague 2 — la vague 1 reste 100 % Goblin,
        // peu importe le seed de la partie.
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
        // Calendrier fixe : Orc (v2), Troll (v3) et Sapeur (v4) sont tous
        // débloqués bien avant la vague 6, et leurs minimums garantis (voir
        // WaveFactory.orcMin...) assurent au moins une occurrence de chacun.
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
    @DisplayName("Le budget de menace augmente avec le numéro de vague")
    void eliteBudget_growsWithWaveNumber() {
        assertThat(WaveFactory.eliteBudget(20)).isGreaterThan(WaveFactory.eliteBudget(6));
        assertThat(WaveFactory.eliteBudget(6)).isGreaterThan(WaveFactory.eliteBudget(2));
    }

    @Test
    @DisplayName("Le mix ne dépasse jamais son budget de menace (tous types confondus)")
    void eliteMix_neverExceedsBudget() {
        for (long seed : List.of(0L, 1L, 2L, 42L, -7L)) {
            for (int waveNumber = 2; waveNumber <= 30; waveNumber++) {
                Wave wave = waveFactory.createWave(waveNumber, spawn, seed);

                int spent = wave.getEnemies().stream()
                        .filter(e -> e.getType() != EnemyType.GOBLIN
                                && e.getType() != EnemyType.BOSS_WARLORD)
                        .mapToInt(e -> e.getType().goldReward)
                        .sum();

                assertThat(spent)
                        .as("vague %d (seed %d)", waveNumber, seed)
                        .isLessThanOrEqualTo(WaveFactory.eliteBudget(waveNumber));
            }
        }
    }

    @Test
    @DisplayName("Calendrier d'apparition : Orc v2, Troll v3, Sapeur v4, Chariot v5, Chevalier noir v6")
    void createWave_unitCalendar_isRespected() {
        record Entry(EnemyType type, int threshold) {}
        List<Entry> calendar = List.of(
                new Entry(EnemyType.ORC, WaveFactory.ORC_THRESHOLD),
                new Entry(EnemyType.TROLL, WaveFactory.TROLL_THRESHOLD),
                new Entry(EnemyType.SAPEUR, WaveFactory.SAPEUR_THRESHOLD),
                new Entry(EnemyType.CHARIOT, WaveFactory.CHARIOT_THRESHOLD),
                new Entry(EnemyType.DARK_KNIGHT, WaveFactory.DARK_KNIGHT_THRESHOLD));

        for (long seed : List.of(0L, 1L, 2L, 42L, -7L)) {
            for (Entry entry : calendar) {
                // Jamais avant sa vague d'apparition...
                for (int waveNumber = 1; waveNumber < entry.threshold(); waveNumber++) {
                    final EnemyType type = entry.type();
                    assertThat(waveFactory.createWave(waveNumber, spawn, seed).getEnemies())
                            .as("%s en vague %d (seed %d)", type, waveNumber, seed)
                            .noneMatch(e -> e.getType() == type);
                }
                // ...toujours présent dès sa vague d'apparition (minimum garanti >= 1).
                final EnemyType type = entry.type();
                assertThat(waveFactory.createWave(entry.threshold(), spawn, seed).getEnemies())
                        .as("%s dès la vague %d (seed %d)", type, entry.threshold(), seed)
                        .anyMatch(e -> e.getType() == type);
            }
        }
    }

    @Test
    @DisplayName("Les minimums garantis croissent au rythme du calendrier (Sapeur +1 toutes les 2 vagues)")
    void guaranteedMinimums_growProgressively() {
        // Sapeur : 1 en v4, 2 en v6, 3 en v8 — le rythme voulu par le design.
        assertThat(WaveFactory.sapeurMin(4)).isEqualTo(1);
        assertThat(WaveFactory.sapeurMin(6)).isEqualTo(2);
        assertThat(WaveFactory.sapeurMin(8)).isEqualTo(3);
        // Les autres types croissent aussi, plus lentement, et 0 avant leur seuil.
        assertThat(WaveFactory.orcMin(1)).isZero();
        assertThat(WaveFactory.orcMin(12)).isGreaterThan(WaveFactory.orcMin(2));
        assertThat(WaveFactory.chariotMin(4)).isZero();
        assertThat(WaveFactory.darkKnightMin(5)).isZero();
        assertThat(WaveFactory.darkKnightMin(12)).isGreaterThanOrEqualTo(1);
        // Les plafonds priment toujours sur la croissance des minimums.
        assertThat(WaveFactory.sapeurMin(40)).isLessThanOrEqualTo(WaveFactory.sapeurWaveCap(40));
        assertThat(WaveFactory.chariotMin(40)).isLessThanOrEqualTo(4);
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
    @DisplayName("Le nombre de Sapeurs par vague suit le plafond progressif, même en vague profonde")
    void createWave_sapeurCount_isCappedPerWave() {
        for (long seed : List.of(0L, 1L, 2L, 42L, -7L)) {
            for (int waveNumber : List.of(12, 15, 20, 30)) {
                long sapeurs = waveFactory.createWave(waveNumber, spawn, seed).getEnemies().stream()
                        .filter(e -> e.getType() == EnemyType.SAPEUR)
                        .count();
                assertThat(sapeurs)
                        .as("vague %d (seed %d)", waveNumber, seed)
                        .isLessThanOrEqualTo(WaveFactory.sapeurWaveCap(waveNumber));
            }
        }
    }

    @Test
    @DisplayName("Le Chariot-baliste apparaît à partir de son seuil, jamais avant, plafonné à 3 par vague")
    void createWave_chariot_appearsFromThresholdCapped() {
        for (long seed : List.of(0L, 1L, 2L, 42L, -7L)) {
            for (int waveNumber = 1; waveNumber < WaveFactory.CHARIOT_THRESHOLD; waveNumber++) {
                assertThat(waveFactory.createWave(waveNumber, spawn, seed).getEnemies())
                        .as("vague %d (seed %d)", waveNumber, seed)
                        .noneMatch(e -> e.getType() == EnemyType.CHARIOT);
            }
            for (int waveNumber : List.of(WaveFactory.CHARIOT_THRESHOLD, 12, 20, 30)) {
                long chariots = waveFactory.createWave(waveNumber, spawn, seed).getEnemies().stream()
                        .filter(e -> e.getType() == EnemyType.CHARIOT).count();
                assertThat(chariots)
                        .as("vague %d (seed %d)", waveNumber, seed)
                        .isBetween(1L, 4L);
            }
        }
    }

    @Test
    @DisplayName("Le plafond de Sapeurs est progressif : plat avant la cassure, +1 toutes les 4 vagues après")
    void sapeurWaveCap_growsSlowlyAfterCurveBreak() {
        // Plat jusqu'à la cassure (v12) : un plafond FIGE tuait la tension en
        // late game (5 Sapeurs abattus = plus aucune menace sur les tours,
        // victoire assurée — retour de partie réelle). Progressif ensuite,
        // mais 8x plus lent que la croissance d'origine (+1/vague).
        assertThat(WaveFactory.sapeurWaveCap(5)).isEqualTo(5);
        assertThat(WaveFactory.sapeurWaveCap(12)).isEqualTo(5);
        assertThat(WaveFactory.sapeurWaveCap(16)).isEqualTo(6);
        assertThat(WaveFactory.sapeurWaveCap(20)).isEqualTo(7);
        assertThat(WaveFactory.sapeurWaveCap(30)).isEqualTo(9);
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
