package com.kcdformes.balance;

import com.kcdformes.domain.model.Castle;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;
import com.kcdformes.domain.model.Wave;
import com.kcdformes.domain.service.PathfindingService;
import com.kcdformes.domain.service.WaveFactory;
import com.kcdformes.domain.service.WaveSimulationService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Harnais d'équilibrage : joue des parties complètes (jusqu'à MAX_WAVE vagues)
 * contre des setups de tours de référence pilotés par un bot d'achat simple,
 * sur plusieurs seeds, et imprime des métriques agrégées (vague de mort
 * médiane, taux de survie aux paliers, tours perdues, or final).
 *
 * OBJECTIF : transformer chaque passe d'équilibrage (PV du boss, goldReward,
 * cadences...) en résultat MESURABLE — lancer ce test avant/après un
 * ajustement montre immédiatement son effet réel, sans jouer des parties à la
 * main. Ce n'est PAS un test de comportement : les tests de comportement
 * vivent dans WaveSimulationServiceTest / WaveFactoryTest.
 *
 * Les assertions sont volontairement lâches (invariants grossiers qui ne
 * doivent JAMAIS casser, quel que soit le tuning) : le produit principal est
 * le rapport imprimé sur stdout.
 *
 * Usage ciblé : ./mvnw test -Dtest=BalanceHarnessTest
 */
@Tag("balance")
class BalanceHarnessTest {

    // --- Constantes répliquées de la couche application (GameService) ---
    // Dupliquées sciemment : le domaine ne doit pas dépendre de l'application,
    // et le harnais simule le contexte économique que GameService fournit en
    // production. Si ces valeurs changent dans GameService, les mettre à jour ici.
    private static final int STARTING_GOLD = 250;
    private static final int BONUS_MILESTONE_INTERVAL = 5;
    private static final int GOLD_INJECTION_PER_WAVE = 40;
    private static final int CASTLE_MAX_HP = 100;

    /** Nombre de vagues maximum par run : au-delà, le run est considéré "survécu". */
    private static final int MAX_WAVE = 40;
    /** Nombre de parties simulées par setup — assez pour lisser l'aléa des seeds. */
    private static final int RUNS_PER_SETUP = 20;

    /** Emplacement d'une tour dans un setup : le bot l'achète (et la rachète si détruite) dès qu'il a l'or. */
    private record Placement(TowerType type, int x, int y) {}

    /**
     * Un setup de référence : des emplacements achetés dans l'ordre de la liste
     * (l'ordre est donc un choix de build), puis des améliorations jusqu'à
     * targetLevel avec l'or restant.
     */
    private record Setup(String name, List<Placement> placements, int targetLevel) {}

    /**
     * Résultat d'un run : deathWave = vague où le château tombe, ou MAX_WAVE + 1 si
     * survécu. hpByWave / towersLostByWave (indexés par numéro de vague - 1) tracent
     * le déroulé pour localiser la vague qui tue, pas seulement quand on meurt.
     */
    private record RunResult(int deathWave, int towersLost, int towersLostOnBossWaves, int finalGold,
                             List<Integer> hpByWave, List<Integer> towersLostByWave) {}

    // --- Setups de référence ---
    // Chemin : ligne y=7 de (0,7) à (19,7) — les tours sont posées en y=6/y=8,
    // à portée du chemin (Archer 3.0, Mage 2.5, Catapulte 4.0, Baliste 5.0).
    // "sans-tours" sert de plancher de référence pour les assertions : tout
    // vrai setup doit faire strictement mieux que lui.
    private static final Setup BASELINE = new Setup("sans-tours", List.of(), 1);

    private static final Setup ECO_ARCHERS = new Setup("eco-archers", List.of(
            new Placement(TowerType.ARCHER, 4, 6),
            new Placement(TowerType.ARCHER, 8, 8),
            new Placement(TowerType.ARCHER, 12, 6),
            new Placement(TowerType.ARCHER, 16, 8),
            new Placement(TowerType.ARCHER, 6, 8),
            new Placement(TowerType.ARCHER, 14, 8)
    ), 3);

    private static final Setup MIXTE = new Setup("mixte", List.of(
            new Placement(TowerType.ARCHER, 4, 6),
            new Placement(TowerType.MAGE, 8, 8),
            new Placement(TowerType.CATAPULT, 12, 6),
            new Placement(TowerType.ARCHER, 16, 8),
            new Placement(TowerType.MAGE, 14, 6)
    ), 3);

    private static final Setup PREMIUM = new Setup("premium", List.of(
            new Placement(TowerType.ARCHER, 4, 6),
            new Placement(TowerType.CATAPULT, 8, 8),
            new Placement(TowerType.BALLISTA, 12, 6),
            new Placement(TowerType.MAGE, 14, 8),
            new Placement(TowerType.BALLISTA, 16, 6)
    ), 3);

    private final WaveFactory waveFactory = new WaveFactory();
    private final WaveSimulationService simulationService =
            new WaveSimulationService(new PathfindingService());

    @Test
    @DisplayName("Rapport d'équilibrage : chaque setup de référence survit strictement mieux que sans tours")
    void balanceReport() {
        List<Setup> setups = List.of(BASELINE, ECO_ARCHERS, MIXTE, PREMIUM);

        System.out.printf("%n=== Harnais d'équilibrage — %d runs/setup, max %d vagues ===%n",
                RUNS_PER_SETUP, MAX_WAVE);
        System.out.printf("%-12s %-18s %-9s %-9s %-9s %-14s %-10s%n",
                "Setup", "Mort méd/min/max", "Survie@10", "@20", "@30", "Tours perdues", "Or final");

        int baselineMedian = -1;
        for (Setup setup : setups) {
            List<RunResult> results = new ArrayList<>();
            for (int seedIndex = 0; seedIndex < RUNS_PER_SETUP; seedIndex++) {
                results.add(runGame(setup, seedIndex * 1_000_003L));
            }
            printAggregates(setup, results);
            printWaveTrace(setup, results);

            int median = medianDeathWave(results);
            if (setup == BASELINE) {
                baselineMedian = median;
                // Invariant absolu : sans aucune tour, aucun or n'est jamais gagné
                // et le château doit tomber très vite. Si ça casse, ce n'est pas
                // un problème d'équilibrage mais un bug de simulation.
                assertThat(median).as("sans tours, le château doit tomber rapidement").isLessThanOrEqualTo(5);
            } else {
                // Invariant volontairement lâche, insensible au tuning : un vrai
                // setup doit toujours faire strictement mieux que ne rien poser.
                assertThat(median)
                        .as("le setup %s doit survivre plus longtemps que sans tours", setup.name())
                        .isGreaterThan(baselineMedian);
            }
        }
    }

    /** Joue une partie complète avec le bot d'achat, et retourne ses métriques. */
    private RunResult runGame(Setup setup, long seed) {
        GameMap map = new GameMap(20, 15, new Position(0, 7), new Position(19, 7));
        int gold = STARTING_GOLD;
        int castleHp = CASTLE_MAX_HP;
        int towersLost = 0;
        int towersLostOnBossWaves = 0;
        List<Integer> hpByWave = new ArrayList<>();
        List<Integer> towersLostByWave = new ArrayList<>();

        for (int waveNumber = 1; waveNumber <= MAX_WAVE; waveNumber++) {
            gold = buyAndUpgrade(setup, map, gold);

            Wave wave = waveFactory.createWave(waveNumber, map.getPathStart(), seed);
            wave.start();

            // Même convention que GameService.startWave : le Castle domaine est
            // reconstruit à chaque vague à partir des PV persistés.
            Castle castle = new Castle(UUID.randomUUID(), UUID.randomUUID(), "harness",
                    castleHp, CASTLE_MAX_HP, 1);
            WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

            int lost = (int) result.ticks().stream()
                    .mapToLong(t -> t.destroyedTowers().size()).sum();
            towersLost += lost;
            towersLostByWave.add(lost);
            if (waveNumber % 10 == 0) {
                towersLostOnBossWaves += lost;
            }

            gold += result.goldEarned();
            castleHp = castle.getHp();
            hpByWave.add(castleHp);

            if (castle.isDestroyed()) {
                return new RunResult(waveNumber, towersLost, towersLostOnBossWaves, gold,
                        hpByWave, towersLostByWave);
            }

            // Palier de bonus : même heuristique qu'un joueur raisonnable —
            // survie d'abord (château), résilience ensuite (tours), or sinon.
            if (waveNumber % BONUS_MILESTONE_INTERVAL == 0) {
                if (castleHp < CASTLE_MAX_HP / 2) {
                    castleHp = CASTLE_MAX_HP;
                } else if (map.getTowers().stream().anyMatch(t -> t.getHp() < t.getMaxHp())) {
                    map.getTowers().forEach(Tower::repair);
                } else {
                    gold += waveNumber * GOLD_INJECTION_PER_WAVE;
                }
            }
        }

        return new RunResult(MAX_WAVE + 1, towersLost, towersLostOnBossWaves, gold,
                hpByWave, towersLostByWave);
    }

    /**
     * Bot d'achat : (1) pose — ou repose, après destruction par Sapeur/Boss —
     * les emplacements du setup dans l'ordre, tant que l'or suffit ; puis
     * (2) améliore la tour la moins chère à améliorer, jusqu'à targetLevel.
     * Volontairement simple : le but est un comportement REPRODUCTIBLE d'une
     * exécution à l'autre, pas un joueur optimal.
     */
    private int buyAndUpgrade(Setup setup, GameMap map, int gold) {
        for (Placement placement : setup.placements()) {
            if (map.getTowerAt(placement.x(), placement.y()).isPresent()) {
                continue;
            }
            if (gold < placement.type().baseCost) {
                break; // achats dans l'ordre du build : on ne saute pas un slot trop cher
            }
            map.placeTower(new Tower(placement.type(), placement.x(), placement.y()));
            gold -= placement.type().baseCost;
        }

        while (true) {
            Tower cheapest = map.getTowers().stream()
                    .filter(t -> t.getLevel() < setup.targetLevel())
                    .min(Comparator.comparingInt(Tower::getUpgradeCost))
                    .orElse(null);
            if (cheapest == null || gold < cheapest.getUpgradeCost()) {
                return gold;
            }
            gold -= cheapest.getUpgradeCost();
            cheapest.upgrade();
        }
    }

    // --- Agrégation et affichage ---

    private void printAggregates(Setup setup, List<RunResult> results) {
        List<Integer> deaths = results.stream().map(RunResult::deathWave).sorted().toList();
        int min = deaths.get(0);
        int max = deaths.get(deaths.size() - 1);
        int median = medianDeathWave(results);

        double avgTowersLost = results.stream().mapToInt(RunResult::towersLost).average().orElse(0);
        double avgBossLost = results.stream().mapToInt(RunResult::towersLostOnBossWaves).average().orElse(0);
        List<Integer> golds = results.stream().map(RunResult::finalGold).sorted().toList();
        int medianGold = golds.get(golds.size() / 2);

        System.out.printf("%-12s %-18s %-9s %-9s %-9s %-14s %-10d%n",
                setup.name(),
                fmtWave(median) + "/" + fmtWave(min) + "/" + fmtWave(max),
                pctSurvived(deaths, 10), pctSurvived(deaths, 20), pctSurvived(deaths, 30),
                String.format("%.1f (boss %.1f)", avgTowersLost, avgBossLost),
                medianGold);
    }

    /**
     * Trace vague par vague : PV médians du château (les runs déjà morts comptent
     * à 0, donc la médiane à 0 = la moitié des runs sont morts à ce stade) et
     * tours perdues en moyenne sur cette vague — pour repérer LA vague qui tue
     * (chute brutale des PV) et celle où la pression de siège explose, plutôt
     * que de ne connaître que la vague de mort finale.
     */
    private void printWaveTrace(Setup setup, List<RunResult> results) {
        int lastWave = results.stream().mapToInt(r -> r.hpByWave().size()).max().orElse(0);

        StringBuilder hpLine = new StringBuilder("    PV château (méd) : ");
        StringBuilder lostLine = new StringBuilder("    Tours perdues/vague : ");
        for (int w = 0; w < lastWave; w++) {
            final int wave = w;
            List<Integer> hps = results.stream()
                    .map(r -> wave < r.hpByWave().size() ? r.hpByWave().get(wave) : 0)
                    .sorted().toList();
            double avgLost = results.stream()
                    .mapToInt(r -> wave < r.towersLostByWave().size() ? r.towersLostByWave().get(wave) : 0)
                    .average().orElse(0);
            hpLine.append(String.format("v%d:%d ", w + 1, hps.get(hps.size() / 2)));
            lostLine.append(String.format("v%d:%.1f ", w + 1, avgLost));
        }
        System.out.println(hpLine);
        System.out.println(lostLine);
    }

    private int medianDeathWave(List<RunResult> results) {
        List<Integer> sorted = results.stream().map(RunResult::deathWave).sorted().toList();
        return sorted.get(sorted.size() / 2);
    }

    /** MAX_WAVE + 1 = le run a survécu jusqu'au bout : affiché ">MAX_WAVE" plutôt qu'une fausse vague de mort. */
    private String fmtWave(int deathWave) {
        return deathWave > MAX_WAVE ? ">" + MAX_WAVE : String.valueOf(deathWave);
    }

    private String pctSurvived(List<Integer> deaths, int wave) {
        long survived = deaths.stream().filter(d -> d > wave).count();
        return Math.round(100.0 * survived / deaths.size()) + "%";
    }
}
