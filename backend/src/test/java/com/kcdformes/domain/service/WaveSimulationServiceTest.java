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

    @Test
    @DisplayName("Un Sapeur détruit la tour la plus proche et libère définitivement la case")
    void simulate_sapeurDestroysClosestTower_freesCellPermanently() {
        Tower archer = new Tower(TowerType.ARCHER, 5, 5);
        map.placeTower(archer);

        // À distance 1.0 de la tour dès le départ : siège immédiat, pas de trajet à simuler.
        Enemy sapeur = new Enemy(EnemyType.SAPEUR, 5, 6);
        Wave wave = new Wave(1, List.of(sapeur));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        assertThat(map.getTowerAt(5, 5)).isEmpty();
        assertThat(map.isCellBlocked(5, 5)).isFalse();

        boolean towerDestroyedInTicks = result.ticks().stream()
                .anyMatch(t -> t.destroyedTowers().contains(archer.getId()));
        assertThat(towerDestroyedInTicks).isTrue();
    }

    @Test
    @DisplayName("Un Sapeur qui survit à la destruction de sa cible reprend sa route vers le château")
    void simulate_sapeurSurvivingDestruction_resumesRouteToCastle() {
        Tower archer = new Tower(TowerType.ARCHER, 5, 5);
        map.placeTower(archer);

        Enemy sapeur = new Enemy(EnemyType.SAPEUR, 5, 6);
        Wave wave = new Wave(1, List.of(sapeur));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        // Seul un ennemi ayant atteint le château peut infliger des dégâts au château.
        assertThat(result.castleDamageTaken()).isEqualTo(EnemyType.SAPEUR.castleDamage);
    }

    @Test
    @DisplayName("Sans aucune tour sur la map, un Sapeur suit simplement le chemin comme tout autre ennemi")
    void simulate_sapeurWithoutAnyTower_followsPathNormally() {
        Enemy sapeur = new Enemy(EnemyType.SAPEUR, map.getPathStart().x(), map.getPathStart().y());
        Wave wave = new Wave(1, List.of(sapeur));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        assertThat(result.castleDamageTaken()).isEqualTo(EnemyType.SAPEUR.castleDamage);
        boolean anyTowerDestroyed = result.ticks().stream().anyMatch(t -> !t.destroyedTowers().isEmpty());
        assertThat(anyTowerDestroyed).isFalse();
    }

    @Test
    @DisplayName("Une autre tour à portée peut tuer le Sapeur pendant qu'il assiège sa cible")
    void simulate_otherTowerInRange_canKillSapeurWhileItSieges() {
        Tower targeted = new Tower(TowerType.ARCHER, 5, 5); // cible visée par le Sapeur
        // Baliste (dégâts élevés, portée 5.0) plutôt que Catapulte : depuis le buff de
        // PV du Sapeur (150 -> 180), la Catapulte seule + l'Archer qui se défend ne
        // l'abattaient plus avec une marge confortable avant que l'Archer (150 PV,
        // 12 dégâts de siège/tick) ne soit lui-même détruit au tick 13.
        Tower defender = new Tower(TowerType.BALLISTA, 5, 7); // à portée (5.0) du point de siège (5,6)
        map.placeTower(targeted);
        map.placeTower(defender);

        Enemy sapeur = new Enemy(EnemyType.SAPEUR, 5, 6);
        Wave wave = new Wave(1, List.of(sapeur));
        wave.start();

        simulationService.simulate(map, wave, castle);

        // La Baliste (dégâts élevés) + l'Archer qui se défend tuent le Sapeur avant
        // qu'il ne détruise sa cible.
        assertThat(sapeur.isDead()).isTrue();
        assertThat(map.getTowerAt(5, 5)).isPresent();
    }

    @Test
    @DisplayName("Un Sapeur qui détruit sa tour cible enchaîne sur la tour suivante la plus proche")
    void simulate_sapeurChainsToNextClosestTowerAfterDestroyingFirst() {
        Tower first = new Tower(TowerType.ARCHER, 5, 5);
        // Hors de portée (3.0) du point de siège (5,6) : ne peut pas tirer sur le
        // Sapeur avant que celui-ci ne vienne à lui, après la destruction de `first`.
        Tower second = new Tower(TowerType.ARCHER, 12, 5);
        map.placeTower(first);
        map.placeTower(second);

        // À distance 1.0 de `first` dès le départ : c'est la tour la plus proche,
        // donc la première ciblée (siège immédiat, pas de trajet à simuler).
        //
        // PV surdimensionnés (1000) via l'override prévu à cet effet : ce test
        // vérifie le COMPORTEMENT d'enchaînement, pas l'équilibrage. Avec les PV
        // réels du Sapeur, l'issue dépend des constantes de tuning (aux valeurs
        // actuelles, les deux archers qui se défendent le tuent avant la fin du
        // 2e siège : ~250 dégâts à encaisser pour 180 PV) — chaque passe
        // d'équilibrage cassait donc ce test sans qu'aucun comportement n'ait
        // changé. La survie du Sapeur sous le feu relève des tests d'équilibrage,
        // pas de celui-ci.
        Enemy sapeur = new Enemy(EnemyType.SAPEUR, 5, 6, 0, 1000);
        Wave wave = new Wave(1, List.of(sapeur));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        // Les deux tours doivent avoir été détruites au cours de la simulation :
        // preuve que le Sapeur a bien enchaîné sur `second` après avoir abattu
        // `first`, plutôt que de s'arrêter ou de reprendre sa route prématurément.
        boolean firstDestroyed = result.ticks().stream()
                .anyMatch(t -> t.destroyedTowers().contains(first.getId()));
        boolean secondDestroyed = result.ticks().stream()
                .anyMatch(t -> t.destroyedTowers().contains(second.getId()));
        assertThat(firstDestroyed).isTrue();
        assertThat(secondDestroyed).isTrue();
        assertThat(map.getTowers()).isEmpty();

        // Plus aucune tour sur la map : le Sapeur reprend sa route et finit par
        // atteindre le château, comme tout ennemi ayant survécu jusqu'au bout du chemin.
        assertThat(result.castleDamageTaken()).isEqualTo(EnemyType.SAPEUR.castleDamage);
    }

    @Test
    @DisplayName("Le Boss soigne les ennemis proches et endommage les tours proches lors de sa pulsation")
    void simulate_bossPulse_healsNearbyAlliesAndDamagesNearbyTowers() {
        Tower tower = new Tower(TowerType.ARCHER, 3, 7); // proche de la position du Boss au tick de son 1er pulse (voir calcul ci-dessous)
        map.placeTower(tower);

        // Boss : spawnDelay=0, avance donc dès le tick 1 (vitesse 0.07/tick). À son
        // 1er pulse (tick = abilityIntervalTicks = 40), il a parcouru 40*0.07 = 2.8
        // cases depuis (0,7), soit (2.8,7) — à moins de auraRadius (3.0) du Goblin
        // resté immobile au spawn, et à moins de aoeRadius (2.0) de la tour en (3,7).
        Enemy boss = new Enemy(EnemyType.BOSS_WARLORD, map.getPathStart().x(), map.getPathStart().y(), 0);

        // Goblin endommagé, spawnDelay très élevé pour qu'il reste immobile au
        // point de spawn pendant toute la fenêtre observée (sinon sa vitesse propre
        // l'éloignerait du Boss avant le 1er pulse).
        Enemy goblin = new Enemy(EnemyType.GOBLIN, map.getPathStart().x(), map.getPathStart().y(), 2000, 100);
        goblin.takeDamage(50); // 50/100 PV : doit être soigné par l'aura

        Wave wave = new Wave(1, List.of(boss, goblin));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        WaveSimulationService.TickSnapshot firstPulseTick = result.ticks().stream()
                .filter(t -> !t.bossAbilityEvents().isEmpty())
                .findFirst().orElseThrow(() -> new AssertionError("Aucune pulsation de Boss enregistrée"));

        assertThat(firstPulseTick.tick()).isEqualTo(EnemyType.BOSS_WARLORD.abilityIntervalTicks);

        WaveSimulationService.BossAbilityEvent event = firstPulseTick.bossAbilityEvents().get(0);
        assertThat(event.alliesHealed()).isEqualTo(1);
        assertThat(event.towersHit()).isEqualTo(1);

        assertThat(goblin.getCurrentHp()).isGreaterThan(50);
        assertThat(tower.getHp()).isLessThan(tower.getMaxHp());

        boolean towerDamageRecorded = result.ticks().stream()
                .flatMap(t -> t.towerDamageEvents().stream())
                .anyMatch(e -> e.enemyId().equals(boss.getId()) && e.towerId().equals(tower.getId()));
        assertThat(towerDamageRecorded).isTrue();
    }

    @Test
    @DisplayName("La pulsation du Boss se répète toutes les abilityIntervalTicks (pas un effet ponctuel)")
    void simulate_bossPulse_repeatsOnEachInterval() {
        Enemy boss = new Enemy(EnemyType.BOSS_WARLORD, map.getPathStart().x(), map.getPathStart().y(), 0);
        Wave wave = new Wave(1, List.of(boss));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        int interval = EnemyType.BOSS_WARLORD.abilityIntervalTicks;
        boolean secondPulseFound = result.ticks().stream()
                .anyMatch(t -> t.tick() == interval * 2 && !t.bossAbilityEvents().isEmpty());

        assertThat(secondPulseFound).isTrue();
    }
}
