package com.kcdformes.domain.service;

import com.kcdformes.domain.model.EnemyType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Tests unitaires des briques du pattern Composite (voir WaveSegment) utilisées
 * par WaveFactory, en isolation de toute logique de vague.
 */
class WaveSegmentsTest {

    @Test
    @DisplayName("EnemyBurst ajoute exactement 'count' exemplaires du type donné")
    void enemyBurst_addsExactCount() {
        List<EnemyType> output = new ArrayList<>();
        new EnemyBurst(EnemyType.GOBLIN, 5).resolve(new Random(0), output);

        assertThat(output).hasSize(5);
        assertThat(output).allMatch(t -> t == EnemyType.GOBLIN);
    }

    @Test
    @DisplayName("EnemyBurst avec count=0 n'ajoute rien")
    void enemyBurst_zeroCount_addsNothing() {
        List<EnemyType> output = new ArrayList<>();
        new EnemyBurst(EnemyType.ORC, 0).resolve(new Random(0), output);

        assertThat(output).isEmpty();
    }

    @Test
    @DisplayName("SequentialSegments enchaîne ses enfants dans l'ordre, sans les mélanger")
    void sequentialSegments_concatenatesChildrenInOrder() {
        List<EnemyType> output = new ArrayList<>();
        WaveSegment segment = new SequentialSegments(List.of(
                new EnemyBurst(EnemyType.GOBLIN, 2),
                new EnemyBurst(EnemyType.ORC, 1),
                new EnemyBurst(EnemyType.TROLL, 3)
        ));

        segment.resolve(new Random(0), output);

        assertThat(output).containsExactly(
                EnemyType.GOBLIN, EnemyType.GOBLIN,
                EnemyType.ORC,
                EnemyType.TROLL, EnemyType.TROLL, EnemyType.TROLL
        );
    }

    @Test
    @DisplayName("ThreatBudgetMix respecte toujours le minimum garanti de chaque entrée")
    void threatBudgetMix_respectsMinGuaranteed() {
        // Budget volontairement juste assez grand pour les minimums garantis,
        // sans rien laisser pour un tirage aléatoire supplémentaire.
        int orcCost = EnemyType.ORC.goldReward;
        int trollCost = EnemyType.TROLL.goldReward;
        int budget = orcCost + trollCost;

        ThreatBudgetMix mix = new ThreatBudgetMix(budget, List.of(
                new ThreatBudgetMix.Entry(EnemyType.ORC, orcCost, 5, 1),
                new ThreatBudgetMix.Entry(EnemyType.TROLL, trollCost, 1, 1)
        ));

        for (long seed : List.of(0L, 1L, 2L, 99L)) {
            List<EnemyType> output = new ArrayList<>();
            mix.resolve(new Random(seed), output);

            assertThat(output).contains(EnemyType.ORC);
            assertThat(output).contains(EnemyType.TROLL);
        }
    }

    @Test
    @DisplayName("ThreatBudgetMix ne dépense jamais plus que son budget")
    void threatBudgetMix_neverExceedsBudget() {
        int orcCost = EnemyType.ORC.goldReward;
        int sapeurCost = EnemyType.SAPEUR.goldReward;
        int trollCost = EnemyType.TROLL.goldReward;
        int budget = 10 * trollCost + 7; // budget arbitraire, pas un multiple exact d'un coût

        ThreatBudgetMix mix = new ThreatBudgetMix(budget, List.of(
                new ThreatBudgetMix.Entry(EnemyType.ORC, orcCost, 5, 1),
                new ThreatBudgetMix.Entry(EnemyType.SAPEUR, sapeurCost, 3, 1),
                new ThreatBudgetMix.Entry(EnemyType.TROLL, trollCost, 2, 1)
        ));

        for (long seed : List.of(0L, 1L, 2L, 3L, 4L, 5L, 42L, 1234L)) {
            List<EnemyType> output = new ArrayList<>();
            mix.resolve(new Random(seed), output);

            int spent = output.stream().mapToInt(t -> switch (t) {
                case ORC -> orcCost;
                case SAPEUR -> sapeurCost;
                case TROLL -> trollCost;
                default -> 0;
            }).sum();

            assertThat(spent).isLessThanOrEqualTo(budget);
        }
    }

    @Test
    @DisplayName("ThreatBudgetMix avec un budget nul ne produit que les minimums garantis")
    void threatBudgetMix_zeroBudget_onlyMinGuaranteed() {
        List<EnemyType> output = new ArrayList<>();
        ThreatBudgetMix mix = new ThreatBudgetMix(0, List.of(
                new ThreatBudgetMix.Entry(EnemyType.ORC, EnemyType.ORC.goldReward, 1, 1)
        ));

        mix.resolve(new Random(0), output);

        assertThat(output).containsExactly(EnemyType.ORC);
    }

    @Test
    @DisplayName("WeightedChoice avec une seule option la choisit toujours")
    void weightedChoice_singleOption_alwaysPicksIt() {
        WaveSegment onlyOption = new EnemyBurst(EnemyType.DARK_KNIGHT, 1);
        WeightedChoice choice = new WeightedChoice(List.of(
                new WeightedChoice.Option(onlyOption, 1)
        ));

        for (long seed : List.of(0L, 1L, 2L, 99L)) {
            List<EnemyType> output = new ArrayList<>();
            choice.resolve(new Random(seed), output);

            assertThat(output).containsExactly(EnemyType.DARK_KNIGHT);
        }
    }

    @Test
    @DisplayName("WeightedChoice ne choisit jamais une option de poids nul")
    void weightedChoice_neverPicksZeroWeightOption() {
        WeightedChoice choice = new WeightedChoice(List.of(
                new WeightedChoice.Option(new EnemyBurst(EnemyType.GOBLIN, 1), 0),
                new WeightedChoice.Option(new EnemyBurst(EnemyType.TROLL, 1), 10)
        ));

        for (long seed = 0; seed < 50; seed++) {
            List<EnemyType> output = new ArrayList<>();
            choice.resolve(new Random(seed), output);

            assertThat(output).containsExactly(EnemyType.TROLL);
        }
    }

    @Test
    @DisplayName("WeightedChoice produit bien les deux options sur un grand nombre de tirages")
    void weightedChoice_bothOptionsEventuallyPicked() {
        WeightedChoice choice = new WeightedChoice(List.of(
                new WeightedChoice.Option(new EnemyBurst(EnemyType.GOBLIN, 1), 1),
                new WeightedChoice.Option(new EnemyBurst(EnemyType.TROLL, 1), 1)
        ));

        Random rng = new Random(0);
        boolean sawGoblin = false;
        boolean sawTroll = false;
        for (int i = 0; i < 200 && !(sawGoblin && sawTroll); i++) {
            List<EnemyType> output = new ArrayList<>();
            choice.resolve(rng, output);
            if (output.contains(EnemyType.GOBLIN)) sawGoblin = true;
            if (output.contains(EnemyType.TROLL)) sawTroll = true;
        }

        assertThat(sawGoblin).isTrue();
        assertThat(sawTroll).isTrue();
    }
}
