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
        // 8 dégâts de siège/tick depuis le nerf mesuré au harnais) ne soit
        // lui-même détruit au tick 19.
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

        // Boss : spawnDelay=0, avance donc dès le tick 1 (vitesse 0.08/tick). À son
        // 1er pulse (tick = abilityIntervalTicks = 40), il a parcouru 40*0.08 = 3.2
        // cases depuis (0,7), soit (3.2,7) — à moins de aoeRadius (3.0) de la tour
        // en (3,7), et à moins de auraRadius (3.0) du Goblin posté en (2,7).
        Enemy boss = new Enemy(EnemyType.BOSS_WARLORD, map.getPathStart().x(), map.getPathStart().y(), 0);

        // Goblin endommagé, spawnDelay très élevé pour qu'il reste immobile
        // pendant toute la fenêtre observée (sinon sa vitesse propre l'éloignerait
        // du Boss avant le 1er pulse). Posté en (2,7), à 1.2 case du point de
        // pulse : le spawn (0,7) serait à 3.2 > auraRadius depuis le buff de
        // vitesse du Boss (0.07 -> 0.08).
        Enemy goblin = new Enemy(EnemyType.GOBLIN, 2, 7, 2000, 100);
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
    @DisplayName("Un mur-barrage bloque les ennemis : aucun dégât au château tant qu'il tient, puis la vague passe")
    void simulate_wall_blocksEnemiesUntilDestroyed() {
        // Mur au milieu du chemin : le Goblin doit s'arrêter devant, l'attaquer
        // au contact jusqu'à destruction, puis reprendre sa route.
        Tower wall = new Tower(TowerType.WALL, 10, 7);
        map.placeTower(wall);

        Enemy goblin = new Enemy(EnemyType.GOBLIN, map.getPathStart().x(), map.getPathStart().y());
        Wave wave = new Wave(1, List.of(goblin));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        // Le mur a été attaqué au contact (TowerDamageEvents du Goblin) puis détruit.
        boolean wallAttacked = result.ticks().stream()
                .flatMap(t -> t.towerDamageEvents().stream())
                .anyMatch(e -> e.enemyId().equals(goblin.getId()) && e.towerId().equals(wall.getId()));
        int wallDestroyedTick = result.ticks().stream()
                .filter(t -> t.destroyedTowers().contains(wall.getId()))
                .mapToInt(WaveSimulationService.TickSnapshot::tick)
                .findFirst().orElseThrow(() -> new AssertionError("Le mur n'a jamais été détruit"));
        assertThat(wallAttacked).isTrue();

        // Aucun dégât au château AVANT la destruction du mur ; le Goblin finit
        // néanmoins par passer et frapper le château — pas de blocage infini.
        int castleHitTick = result.ticks().stream()
                .filter(t -> !t.reachedCastle().isEmpty())
                .mapToInt(WaveSimulationService.TickSnapshot::tick)
                .findFirst().orElseThrow(() -> new AssertionError("Le Goblin n'a jamais atteint le château"));
        assertThat(castleHitTick).isGreaterThan(wallDestroyedTick);
        assertThat(result.castleDamageTaken()).isEqualTo(EnemyType.GOBLIN.castleDamage);
        assertThat(map.getTowerAt(10, 7)).isEmpty();
    }

    @Test
    @DisplayName("Chaque type d'ennemi frappe un mur à sa propre valeur (wallDamage), pas un forfait commun")
    void simulate_wall_takesTypeSpecificDamage() {
        Tower wall = new Tower(TowerType.WALL, 10, 7);
        map.placeTower(wall);

        // Goblin et Troll bloqués ensemble devant le mur : chacun doit produire
        // des TowerDamageEvents à SA valeur de wallDamage — c'est ce qui rend un
        // mur périssable face aux Trolls et durable face à la piétaille.
        Enemy goblin = new Enemy(EnemyType.GOBLIN, map.getPathStart().x(), map.getPathStart().y());
        Enemy troll = new Enemy(EnemyType.TROLL, map.getPathStart().x(), map.getPathStart().y());
        Wave wave = new Wave(1, List.of(goblin, troll));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        List<WaveSimulationService.TowerDamageEvent> wallHits = result.ticks().stream()
                .flatMap(t -> t.towerDamageEvents().stream())
                .filter(e -> e.towerId().equals(wall.getId()))
                .toList();

        assertThat(wallHits.stream().filter(e -> e.enemyId().equals(goblin.getId())))
                .isNotEmpty().allMatch(e -> e.damage() == EnemyType.GOBLIN.wallDamage);
        // Le Troll CUMULE deux sources contre le mur qui le bloque : ses coups
        // de contact (wallDamage) et son rayon de démolition (Ray, le mur étant
        // la tour la plus proche à portée) — interaction voulue, un Troll
        // bloqué est plus dangereux pour le barrage qu'un Troll qui défile.
        List<Integer> trollDamages = wallHits.stream()
                .filter(e -> e.enemyId().equals(troll.getId()))
                .map(WaveSimulationService.TowerDamageEvent::damage)
                .toList();
        assertThat(trollDamages).contains(EnemyType.TROLL.wallDamage);
        assertThat(trollDamages).contains(EnemyType.TROLL.ray.damagePerTick());
        assertThat(trollDamages)
                .allMatch(d -> d == EnemyType.TROLL.wallDamage || d == EnemyType.TROLL.ray.damagePerTick());
        assertThat(EnemyType.TROLL.wallDamage).isGreaterThan(EnemyType.GOBLIN.wallDamage);
    }

    @Test
    @DisplayName("La Baliste inflige des dégâts doublés aux cibles massives, pas à la piétaille")
    void simulate_ballista_dealsDoubleDamageToHeavyTargets() {
        Tower ballista = new Tower(TowerType.BALLISTA, 5, 5);
        map.placeTower(ballista);

        // Troll (massif : baseHp 250 >= HEAVY_TARGET_BASE_HP_THRESHOLD) : chaque
        // tir de la Baliste doit valoir baseDamage x heavyTargetMultiplier.
        Enemy troll = new Enemy(EnemyType.TROLL, map.getPathStart().x(), map.getPathStart().y());
        Wave heavyWave = new Wave(1, List.of(troll));
        heavyWave.start();
        WaveSimulationService.SimulationResult heavyResult = simulationService.simulate(map, heavyWave, castle);

        int doubled = (int) Math.round(TowerType.BALLISTA.baseDamage * TowerType.BALLISTA.heavyTargetMultiplier);
        List<Integer> heavyShots = heavyResult.ticks().stream()
                .flatMap(t -> t.damageEvents().stream())
                .filter(e -> e.towerId().equals(ballista.getId()))
                .map(WaveSimulationService.DamageEvent::damage)
                .toList();
        assertThat(heavyShots).isNotEmpty().allMatch(d -> d == doubled);

        // Contraste : contre un Goblin (piétaille), dégâts de base inchangés.
        Enemy goblin = new Enemy(EnemyType.GOBLIN, map.getPathStart().x(), map.getPathStart().y());
        Wave lightWave = new Wave(2, List.of(goblin));
        lightWave.start();
        WaveSimulationService.SimulationResult lightResult = simulationService.simulate(map, lightWave, castle);

        List<Integer> lightShots = lightResult.ticks().stream()
                .flatMap(t -> t.damageEvents().stream())
                .filter(e -> e.towerId().equals(ballista.getId()))
                .map(WaveSimulationService.DamageEvent::damage)
                .toList();
        assertThat(lightShots).isNotEmpty().allMatch(d -> d == TowerType.BALLISTA.baseDamage);
    }

    @Test
    @DisplayName("La Baliste vise en priorité les cibles massives, et se replie sur la piétaille sinon")
    void simulate_ballista_prioritizesHeavyTargetsWithFallback() {
        Tower ballista = new Tower(TowerType.BALLISTA, 5, 5);
        map.placeTower(ballista);

        // Goblin surblindé via l'override de PV (type toujours "piétaille" : le
        // seuil massif porte sur les PV de BASE du type, pas les PV effectifs) :
        // il survit aux carreaux et reste la cible la plus PROCHE — parfait pour
        // prouver que la priorité massive l'emporte sur la distance. Rapide
        // (0.3/case), il entre à portée le premier : les premiers carreaux
        // partent sur lui (repli), puis le Troll entre à portée et doit capter
        // tous les tirs suivants malgré le Goblin plus proche.
        Enemy tankyGoblin = new Enemy(EnemyType.GOBLIN, map.getPathStart().x(), map.getPathStart().y(), 0, 5000);
        Enemy troll = new Enemy(EnemyType.TROLL, map.getPathStart().x(), map.getPathStart().y());
        Wave wave = new Wave(1, List.of(tankyGoblin, troll));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        List<WaveSimulationService.DamageEvent> ballistaShots = result.ticks().stream()
                .flatMap(t -> t.damageEvents().stream())
                .filter(e -> e.towerId().equals(ballista.getId()))
                .toList();

        int firstGoblinShotTick = firstShotTickOn(result, ballista, tankyGoblin);
        int firstTrollShotTick = firstShotTickOn(result, ballista, troll);
        int lastGoblinShotTick = result.ticks().stream()
                .filter(t -> t.damageEvents().stream().anyMatch(
                        e -> e.towerId().equals(ballista.getId()) && e.enemyId().equals(tankyGoblin.getId())))
                .mapToInt(WaveSimulationService.TickSnapshot::tick).max().orElseThrow();

        assertThat(ballistaShots).isNotEmpty();
        // Repli : la piétaille est visée tant qu'aucun massif n'est à portée...
        assertThat(firstGoblinShotTick).isLessThan(firstTrollShotTick);
        // ...priorité : dès que le Troll est à portée, il capte les carreaux
        // alors que le Goblin (vivant, plus proche) reprend des tirs seulement
        // une fois le Troll abattu.
        assertThat(firstTrollShotTick).isLessThan(lastGoblinShotTick);
        assertThat(troll.isDead()).isTrue();
    }

    private int firstShotTickOn(WaveSimulationService.SimulationResult result, Tower tower, Enemy enemy) {
        return result.ticks().stream()
                .filter(t -> t.damageEvents().stream().anyMatch(
                        e -> e.towerId().equals(tower.getId()) && e.enemyId().equals(enemy.getId())))
                .mapToInt(WaveSimulationService.TickSnapshot::tick)
                .findFirst()
                .orElseThrow(() -> new AssertionError("Aucun tir sur " + enemy.getType()));
    }

    @Test
    @DisplayName("Le Chariot-baliste tire en avançant : il use les tours SANS jamais s'arrêter ni dévier")
    void simulate_chariot_channelsWhileAdvancing() {
        Tower front = new Tower(TowerType.ARCHER, 5, 5);
        Tower back = new Tower(TowerType.ARCHER, 12, 9);
        map.placeTower(front);
        map.placeTower(back);

        // PV surdimensionnés via l'override : on teste le COMPORTEMENT du rayon,
        // pas la survie du Chariot sous le feu des deux archers.
        Enemy chariot = new Enemy(EnemyType.CHARIOT, map.getPathStart().x(), map.getPathStart().y(), 0, 100000);
        Wave wave = new Wave(1, List.of(chariot));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        // Il a canalisé sur les DEUX tours au fil de sa progression (retarget
        // permanent sur la plus proche à portée — il ne se fixe sur aucune)...
        List<WaveSimulationService.TowerDamageEvent> hits = result.ticks().stream()
                .flatMap(t -> t.towerDamageEvents().stream())
                .filter(e -> e.enemyId().equals(chariot.getId()))
                .toList();
        assertThat(hits).anyMatch(e -> e.towerId().equals(front.getId()));
        assertThat(hits).anyMatch(e -> e.towerId().equals(back.getId()));
        assertThat(hits).allMatch(e -> e.damage() == EnemyType.CHARIOT.ray.damagePerTick());

        // ...et il a fini sa route : jamais arrêté, le château encaisse son passage.
        assertThat(result.castleDamageTaken()).isEqualTo(EnemyType.CHARIOT.castleDamage);
    }

    @Test
    @DisplayName("Le rayon continu du Boss canalise chaque tick sur la tour la plus proche à portée")
    void simulate_bossRay_channelsEveryTickOnClosestTowerInRange() {
        // À 2 cases perpendiculaires du chemin (position légale type) : dans le
        // rayon de menace (3.0) pendant toute une fenêtre de passage du Boss.
        Tower tower = new Tower(TowerType.ARCHER, 5, 5);
        map.placeTower(tower);

        Enemy boss = new Enemy(EnemyType.BOSS_WARLORD, map.getPathStart().x(), map.getPathStart().y(), 0);
        Wave wave = new Wave(1, List.of(boss));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        // Rayon continu = un TowerDamageEvent à ray.damagePerTick par tick
        // d'exposition : il doit y en avoir bien plus que les 1-2 pulses de la
        // même fenêtre (~2.24 cases de part et d'autre à 0.08/tick ≈ 55 ticks).
        long rayTicks = result.ticks().stream()
                .flatMap(t -> t.towerDamageEvents().stream())
                .filter(e -> e.enemyId().equals(boss.getId())
                        && e.towerId().equals(tower.getId())
                        && e.damage() == EnemyType.BOSS_WARLORD.ray.damagePerTick())
                .count();

        assertThat(rayTicks).isGreaterThan(10);
        assertThat(tower.getHp()).isLessThan(tower.getMaxHp());
    }

    @Test
    @DisplayName("Le pulse du Boss étourdit la tour touchée : elle cesse de tirer, puis l'effet expire")
    void simulate_bossPulse_stunsTowerThenExpires() {
        // Même géométrie que le test de pulse : tour à portée du Boss à son 1er
        // pulse (tick 40, position ~(2.8, 7)), et à portée de tir du chemin.
        Tower tower = new Tower(TowerType.ARCHER, 3, 7);
        map.placeTower(tower);

        Enemy boss = new Enemy(EnemyType.BOSS_WARLORD, map.getPathStart().x(), map.getPathStart().y(), 0);
        Wave wave = new Wave(1, List.of(boss));
        wave.start();

        WaveSimulationService.SimulationResult result = simulationService.simulate(map, wave, castle);

        int pulse = EnemyType.BOSS_WARLORD.abilityIntervalTicks;
        int stun = EnemyType.BOSS_WARLORD.stunDurationTicks;

        // Pendant l'étourdissement (du pulse inclus à l'expiration exclue) : la
        // tour est signalée étourdie et ne tire jamais. Bornes calées sur la
        // mécanique : le décompte se fait dans la boucle des tours, l'entrée
        // disparaît de stunnedTowers au dernier tick d'effet (tir déjà sauté).
        boolean stunnedDuring = result.ticks().stream()
                .filter(t -> t.tick() >= pulse && t.tick() < pulse + stun - 1)
                .allMatch(t -> t.stunnedTowers().contains(tower.getId()));
        boolean firedDuring = result.ticks().stream()
                .filter(t -> t.tick() >= pulse && t.tick() < pulse + stun)
                .flatMap(t -> t.damageEvents().stream())
                .anyMatch(e -> e.towerId().equals(tower.getId()));
        assertThat(stunnedDuring).isTrue();
        assertThat(firedDuring).isFalse();

        // Avant le 1er pulse, elle tirait normalement (le Boss est à portée dès le départ).
        boolean firedBefore = result.ticks().stream()
                .filter(t -> t.tick() < pulse)
                .flatMap(t -> t.damageEvents().stream())
                .anyMatch(e -> e.towerId().equals(tower.getId()));
        assertThat(firedBefore).isTrue();

        // Entre l'expiration du stun (pulse + stun) et le pulse suivant (2 * pulse),
        // la tour est libérée : plus dans stunnedTowers sur au moins un tick.
        boolean releasedBetween = result.ticks().stream()
                .filter(t -> t.tick() > pulse + stun && t.tick() < 2 * pulse)
                .anyMatch(t -> !t.stunnedTowers().contains(tower.getId()));
        assertThat(releasedBetween).isTrue();
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
