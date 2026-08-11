package com.kcdformes.domain.service;

import com.kcdformes.domain.model.Castle;
import com.kcdformes.domain.model.DamageType;
import com.kcdformes.domain.model.Enemy;
import com.kcdformes.domain.model.EnemyType;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;
import com.kcdformes.domain.model.Wave;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Simule une vague de bout en bout, tick par tick, côté serveur :
 * - les ennemis avancent le long du chemin A* à leur vitesse propre,
 * - les tours tirent sur l'ennemi à portée le plus proche selon leur cadence,
 * - un ennemi qui atteint la fin du chemin inflige des dégâts au château,
 * - un ennemi tué rapporte de l'or à la vague.
 *
 * Aucune dépendance Spring — logique domaine pure, testable unitairement.
 * Le résultat (SimulationResult) contient l'historique complet des ticks,
 * ce qui permet au frontend de rejouer l'animation sans avoir à
 * resimuler le combat lui-même.
 */
public class WaveSimulationService {

    /** Garde-fou pour éviter une boucle infinie en cas de configuration anormale. */
    private static final int MAX_TICKS = 1500;

    /** Distance (en cases) à partir de laquelle un Sapeur cesse d'avancer et attaque la tour visée. */
    private static final double SIEGE_MELEE_RANGE = 1.0;

    /**
     * Défense intégrée du château (équivalent d'archers postés sur les remparts) :
     * dernière ligne contre les ennemis qui approchent de l'arrivée. Volontairement
     * modeste — aide à finir les fuyards, ne remplace pas la défense du joueur.
     */
    private static final double CASTLE_DEFENSE_RANGE = 3.5;   // cases autour de l'arrivée
    private static final int CASTLE_DEFENSE_DAMAGE = 20;       // par tir
    private static final int CASTLE_DEFENSE_COOLDOWN = 5;      // ticks entre deux tirs

    private final PathfindingService pathfindingService;

    public WaveSimulationService(PathfindingService pathfindingService) {
        this.pathfindingService = pathfindingService;
    }

    public record EnemySnapshot(UUID enemyId, String enemyType, double x, double y, int hp, int maxHp) {}

    public record DamageEvent(UUID towerId, UUID enemyId, int damage) {}

    /** Dégâts de siège infligés par un Sapeur (EnemyType.attacksTowers) à la tour qu'il assiège. */
    public record TowerDamageEvent(UUID enemyId, UUID towerId, int damage) {}

    /** Distance (en index de chemin) à laquelle un ennemi s'arrête devant un mur intact. */
    private static final double WALL_STANDOFF = 0.6;
    /**
     * Multiplicateur des dégâts de siège d'un Sapeur contre un mur (voir
     * handleSapperTick) : casser les défenses est son métier — un mur ne doit
     * jamais être une meilleure réponse au Sapeur que de le tuer en route.
     */
    private static final int WALL_SAPPER_MULTIPLIER = 3;

    /**
     * Pulsation d'aura/AoE d'un Boss (EnemyType.isBoss, voir handleBossAbilityTick) :
     * un évènement par Boss par pulsation, même si aucun allié n'avait besoin
     * d'être soigné et aucune tour n'était à portée (alliesHealed/towersHit à 0),
     * pour permettre au frontend d'animer le pulse à chaque déclenchement.
     */
    public record BossAbilityEvent(UUID bossId, double x, double y, int alliesHealed, int towersHit) {}

    public record TickSnapshot(
            int tick,
            List<EnemySnapshot> enemies,
            List<DamageEvent> damageEvents,
            List<TowerDamageEvent> towerDamageEvents,
            List<UUID> deaths,
            List<UUID> reachedCastle,
            List<UUID> destroyedTowers,
            List<BossAbilityEvent> bossAbilityEvents,
            // Tours étourdies par le pulse d'un Boss PENDANT ce tick (état complet,
            // pas un delta) : le frontend les grise tant qu'elles y figurent, sans
            // avoir à recompter lui-même les durées (voir GameScene).
            List<UUID> stunnedTowers,
            // Ennemis touchés par la défense du château ce tick (voir
            // CASTLE_DEFENSE_*) : le frontend anime un tir depuis l'arrivée.
            List<UUID> castleAttacks,
            int castleHp
    ) {}

    public record SimulationResult(List<TickSnapshot> ticks, int goldEarned, int castleDamageTaken) {}

    public SimulationResult simulate(GameMap map, Wave wave, Castle castle) {
        // Couloir strict : le chemin ignore les tours (elles ne peuvent de toute
        // façon pas être posées dessus, voir PlaceTowerService) — il est donc
        // stable d'une vague à l'autre, quelles que soient les tours posées.
        // Un chemin rasterisé par voie (carte multi-voies ; une seule voie = carte
        // classique). Chaque ennemi suit le chemin de SA voie (voir plus bas).
        List<List<Position>> lanePaths = pathfindingService.findLanePaths(map);
        if (lanePaths == null || lanePaths.isEmpty() || lanePaths.get(0).isEmpty()) {
            throw new IllegalStateException("Aucun chemin disponible sur la map");
        }

        List<Tower> towers = map.getTowers();
        Map<UUID, Double> cooldowns = new HashMap<>();
        for (Tower tower : towers) {
            cooldowns.put(tower.getId(), 0.0);
        }

        Map<UUID, Double> progress = new HashMap<>();
        for (Enemy enemy : wave.getEnemies()) {
            progress.put(enemy.getId(), 0.0);
        }

        // État du comportement "Sapeur" (EnemyType.attacksTowers), persistant entre
        // les ticks : la tour visée par chaque Sapeur une fois qu'il a dévié du
        // chemin. Quand cette cible est détruite, l'entrée est retirée et le
        // Sapeur en recherche une nouvelle au tick suivant (voir handleSapperTick) —
        // il ne reprend sa route vers le château que lorsqu'il ne reste plus
        // aucune tour sur la map.
        Map<UUID, UUID> siegeTargets = new HashMap<>();

        // Compte à rebours (en ticks) avant la prochaine pulsation d'aura/AoE de
        // chaque Boss (EnemyType.isBoss). Absent de la map => pas encore pulsé :
        // getOrDefault renvoie alors l'intervalle complet (premier pulse après
        // abilityIntervalTicks ticks suivant son apparition), voir plus bas.
        Map<UUID, Integer> bossCooldowns = new HashMap<>();

        // Étourdissement des tours (towerId -> ticks restants) : infligé par le
        // pulse d'un Boss (EnemyType.stunDurationTicks), une tour étourdie ne
        // tire plus. État de COMBAT, local à cette simulation, comme cooldowns et
        // siegeTargets — il ne vit jamais sur Tower et n'est donc jamais persisté
        // (une tour étourdie au dernier tick d'une vague ne doit pas le rester
        // au début de la suivante).
        Map<UUID, Integer> towerStuns = new HashMap<>();

        Set<UUID> escaped = new HashSet<>();
        List<TickSnapshot> ticks = new ArrayList<>();
        int castleDamageTaken = 0;
        // Toutes les voies terminent sur la même case château : la défense du
        // château (dernière ligne) se réfère à cette arrivée commune.
        List<Position> referenceLane = lanePaths.get(0);
        Position castlePos = referenceLane.get(referenceLane.size() - 1);
        // Couloir complet (voies + aires d'élargissement) : sert à n'autoriser le
        // décalage latéral d'un ennemi que là où la case voisine est de la route —
        // file indienne sur une route fine, désalignement dans les aires larges.
        Set<Position> corridorCells = pathfindingService.corridorCells(map);
        int castleCooldown = 0; // ticks restants avant le prochain tir de la défense

        int tick = 0;
        while (tick < MAX_TICKS) {
            tick++;
            List<DamageEvent> damageEvents = new ArrayList<>();
            List<TowerDamageEvent> towerDamageEvents = new ArrayList<>();
            List<UUID> deaths = new ArrayList<>();
            List<UUID> reached = new ArrayList<>();
            List<UUID> destroyedTowers = new ArrayList<>();
            List<BossAbilityEvent> bossAbilityEvents = new ArrayList<>();

            // 1. Déplacement des ennemis le long du chemin
            for (Enemy enemy : wave.getEnemies()) {
                if (enemy.isDead() || escaped.contains(enemy.getId())) {
                    continue;
                }
                if (tick <= enemy.getSpawnDelayTicks()) {
                    // Pas encore apparu : reste invisible et immobile au point de spawn.
                    continue;
                }

                // Chemin de la voie de cet ennemi (carte multi-voies ; voie 0 par
                // défaut sur une carte classique). Toute la logique de suivi de
                // chemin ci-dessous opère sur CE chemin.
                List<Position> path = lanePaths.get(Math.min(enemy.getLaneIndex(), lanePaths.size() - 1));
                int lastPathIndex = path.size() - 1;

                if (enemy.getType().attacksTowers) {
                    boolean diverted = handleSapperTick(enemy, map, path, progress, siegeTargets,
                            towerDamageEvents, destroyedTowers);
                    if (diverted) {
                        // Ce tick a été consommé par le déplacement hors-chemin ou
                        // l'attaque de la tour visée : pas de suivi de chemin normal.
                        continue;
                    }
                }

                double prevP = progress.get(enemy.getId());
                double p = prevP + enemy.getType().speed;

                // Mur-barrage (TowerType.WALL, voir GAME_DESIGN 2.7) : un ennemi
                // ne traverse JAMAIS une case de mur intacte — il s'arrête juste
                // devant (WALL_STANDOFF) et l'attaque au contact chaque tick
                // jusqu'à destruction. Tous les ennemis bloqués attaquent en même
                // temps : un mur face à une vague entière tombe d'autant plus
                // vite qu'elle est nombreuse — c'est ce qui garantit qu'aucune
                // vague ne reste coincée indéfiniment.
                Integer wallIdx = firstWallIndexAhead(prevP, path, map);
                if (wallIdx != null && p >= wallIdx - WALL_STANDOFF) {
                    // max(0, ...) : un mur posé sur la case de spawn elle-même
                    // (index 0) donnerait sinon une progression négative — les
                    // ennemis attaquent alors depuis le spawn, collés au mur.
                    p = Math.max(0, wallIdx - WALL_STANDOFF);
                    attackWall(enemy, path.get(wallIdx), map, towerDamageEvents, destroyedTowers);
                }
                progress.put(enemy.getId(), p);

                if (p >= lastPathIndex) {
                    Position end = path.get(lastPathIndex);
                    enemy.moveTo(end.x(), end.y());
                    escaped.add(enemy.getId());
                    reached.add(enemy.getId());
                    castle.takeDamage(enemy.getType().castleDamage);
                    castleDamageTaken += enemy.getType().castleDamage;
                } else {
                    Position from = path.get((int) Math.floor(p));
                    Position to = path.get((int) Math.min(lastPathIndex, Math.ceil(p)));
                    double frac = p - Math.floor(p);
                    double nx = from.x() + (to.x() - from.x()) * frac;
                    double ny = from.y() + (to.y() - from.y()) * frac;

                    // Décale l'ennemi perpendiculairement à la direction du segment,
                    // MAIS seulement si la case voisine de ce côté fait partie de la
                    // route (couloir large / aire de croisement) : sinon il déborderait
                    // sur une case constructible. Sur une route fine, le décalage est
                    // donc neutralisé → file indienne ; dans une aire large → désalignés.
                    double dirX = to.x() - from.x();
                    double dirY = to.y() - from.y();
                    double dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
                    double off = enemy.getLaneOffset();
                    if (dirLen > 0 && off != 0) {
                        double perpX = -dirY / dirLen;
                        double perpY = dirX / dirLen;
                        int nbx = from.x() + (int) Math.round(perpX * Math.signum(off));
                        int nby = from.y() + (int) Math.round(perpY * Math.signum(off));
                        if (corridorCells.contains(new Position(nbx, nby))) {
                            nx += perpX * off;
                            ny += perpY * off;
                        }
                    }

                    enemy.moveTo(nx, ny);
                }
            }

            // 1.5a. Rayons de siège (EnemyType.Ray — Troll, Chevalier noir,
            // Boss) : chaque tick, l'ennemi canalise sur la tour non détruite la
            // plus proche à portée, sans dévier du chemin. Généralisé du Boss :
            // le Sapeur ne doit pas être l'UNIQUE menace sur les tours, sinon
            // son contre une fois construit, plus rien n'use la défense.
            for (Enemy enemy : wave.getEnemies()) {
                if (enemy.getType().ray == null || enemy.isDead() || escaped.contains(enemy.getId())) {
                    continue;
                }
                if (tick <= enemy.getSpawnDelayTicks()) {
                    continue;
                }
                handleSiegeRayTick(enemy, map, towerDamageEvents, destroyedTowers);
            }

            // 1.5b. Pulsation des Boss (EnemyType.isBoss), tous les
            // abilityIntervalTicks : soin de zone des ennemis proches + dégâts
            // et étourdissement des tours proches — sur place, sans dévier.
            for (Enemy enemy : wave.getEnemies()) {
                if (!enemy.getType().isBoss || enemy.isDead() || escaped.contains(enemy.getId())) {
                    continue;
                }
                if (tick <= enemy.getSpawnDelayTicks()) {
                    continue;
                }

                int cooldown = bossCooldowns.getOrDefault(enemy.getId(), enemy.getType().abilityIntervalTicks) - 1;
                if (cooldown > 0) {
                    bossCooldowns.put(enemy.getId(), cooldown);
                    continue;
                }

                bossCooldowns.put(enemy.getId(), enemy.getType().abilityIntervalTicks);
                bossAbilityEvents.add(handleBossAbilityTick(enemy, map, wave, towerDamageEvents,
                        destroyedTowers, towerStuns));
            }

            // 2. Attaques des tours (cible : ennemi à portée le plus proche)
            for (Tower tower : towers) {
                if (tower.isDestroyed()) {
                    // Détruite par un Sapeur plus tôt dans la simulation (la liste
                    // `towers` capturée en début de méthode garde une référence
                    // vers l'objet, même après sa suppression de `map`) : ne tire plus.
                    continue;
                }

                // Étourdie par le pulse d'un Boss : ne tire pas ce tick. Le
                // décompte se fait ici (une seule fois par tour et par tick), et
                // l'entrée est retirée à expiration pour que stunnedTowers
                // (snapshot) reflète uniquement les étourdissements actifs.
                Integer stun = towerStuns.get(tower.getId());
                if (stun != null) {
                    if (stun <= 1) {
                        towerStuns.remove(tower.getId());
                    } else {
                        towerStuns.put(tower.getId(), stun - 1);
                    }
                    continue;
                }

                if (tower.getType().baseDamage == 0) {
                    // Structure passive (WALL) : ne tire jamais — son rôle est de
                    // bloquer (voir handleWallBlocking), pas d'attaquer.
                    continue;
                }

                if (tower.getType().damageType == DamageType.CONTINUOUS) {
                    // Pas de cooldown : un rayon continu tape chaque tick tant qu'une
                    // cible est en portée (voir TowerType pour le rééquilibrage de
                    // baseDamage qui accompagne ce profil).
                    Enemy target = findTarget(tower, wave.getEnemies(), escaped, tick, progress);
                    if (target != null) {
                        applyDamage(tower, target, effectiveDamage(tower, target), wave, damageEvents, deaths);
                    }
                    continue;
                }

                double cooldown = cooldowns.get(tower.getId()) - 1.0;
                if (cooldown > 0) {
                    cooldowns.put(tower.getId(), cooldown);
                    continue;
                }

                Enemy target = findTarget(tower, wave.getEnemies(), escaped, tick, progress);
                if (target == null) {
                    cooldowns.put(tower.getId(), 0.0);
                    continue;
                }

                applyDamage(tower, target, effectiveDamage(tower, target), wave, damageEvents, deaths);

                if (tower.getType().damageType == DamageType.AOE) {
                    // Dégâts réduits (moitié) aux ennemis proches de la cible principale,
                    // dans le rayon de la tour — un seul tir, plusieurs ennemis touchés.
                    double splashDamage = tower.getDamage() / 2.0;
                    for (Enemy other : wave.getEnemies()) {
                        if (other.getId().equals(target.getId())
                                || other.isDead() || escaped.contains(other.getId())
                                || tick <= other.getSpawnDelayTicks()) {
                            continue;
                        }
                        double dx = other.getX() - target.getX();
                        double dy = other.getY() - target.getY();
                        if (Math.sqrt(dx * dx + dy * dy) <= tower.getType().splashRadius) {
                            applyDamage(tower, other, (int) Math.round(splashDamage), wave, damageEvents, deaths);
                        }
                    }
                }

                cooldowns.put(tower.getId(), 1.0 / tower.getType().attackSpeed);
            }

            // 2.5. Défense du château (archers des remparts) : à cadence fixe,
            // tire sur l'ennemi vivant le plus proche de l'arrivée s'il est dans
            // CASTLE_DEFENSE_RANGE — dernière ligne contre les fuyards.
            List<UUID> castleAttacks = new ArrayList<>();
            if (castleCooldown > 0) {
                castleCooldown--;
            } else {
                Enemy target = null;
                double bestDistSq = CASTLE_DEFENSE_RANGE * CASTLE_DEFENSE_RANGE;
                for (Enemy enemy : wave.getEnemies()) {
                    if (enemy.isDead() || escaped.contains(enemy.getId()) || tick <= enemy.getSpawnDelayTicks()) {
                        continue;
                    }
                    double dx = enemy.getX() - castlePos.x();
                    double dy = enemy.getY() - castlePos.y();
                    double distSq = dx * dx + dy * dy;
                    if (distSq <= bestDistSq) {
                        bestDistSq = distSq;
                        target = enemy;
                    }
                }
                if (target != null) {
                    target.takeDamage(CASTLE_DEFENSE_DAMAGE);
                    castleAttacks.add(target.getId());
                    if (target.isDead()) {
                        // La défense du château ne rapporte PAS d'or (filet de
                        // sécurité, pas une source de revenu : l'économie reste
                        // pilotée par les tours du joueur). On signale juste la
                        // mort (deaths) pour l'animation d'agonie côté frontend.
                        deaths.add(target.getId());
                    }
                    castleCooldown = CASTLE_DEFENSE_COOLDOWN;
                }
            }

            // Une tour détruite (rayon ou pulse d'un Boss, Sapeur) pendant qu'elle
            // était étourdie laisserait une entrée orpheline dans towerStuns : la
            // boucle des tours saute les détruites AVANT le décompte, l'entrée n'y
            // expirerait donc jamais et stunnedTowers signalerait à vie une tour
            // qui n'existe plus.
            towerStuns.keySet().removeIf(id -> towers.stream()
                    .filter(t -> t.getId().equals(id))
                    .findFirst()
                    .map(Tower::isDestroyed)
                    .orElse(true));

            final int currentTick = tick;
            List<EnemySnapshot> snapshot = wave.getEnemies().stream()
                    .filter(enemy -> !escaped.contains(enemy.getId()))
                    // Un ennemi mort quitte le snapshot : sa mort est signalée par
                    // tick.deaths (le frontend y déclenche l'animation d'agonie).
                    // Sans ce filtre, les cadavres restaient inclus à 0 PV et
                    // s'empilaient à l'écran (visible depuis le rendu par sprites).
                    .filter(enemy -> !enemy.isDead())
                    .filter(enemy -> currentTick > enemy.getSpawnDelayTicks())
                    .map(enemy -> new EnemySnapshot(
                            enemy.getId(), enemy.getType().name(),
                            enemy.getX(), enemy.getY(),
                            enemy.getCurrentHp(), enemy.getMaxHp()))
                    .toList();

            ticks.add(new TickSnapshot(tick, snapshot, damageEvents, towerDamageEvents, deaths, reached,
                    destroyedTowers, bossAbilityEvents, List.copyOf(towerStuns.keySet()),
                    castleAttacks, castle.getHp()));

            boolean allResolved = wave.getEnemies().stream()
                    .allMatch(enemy -> enemy.isDead() || escaped.contains(enemy.getId()));
            if (allResolved || castle.isDestroyed()) {
                break;
            }
        }

        // Une vague avec des ennemis échappés n'est jamais une victoire, même si
        // Wave.allEnemiesDead() ne distingue pas explicitement ce cas (un ennemi
        // échappé reste "alive" puisqu'il n'a pas été tué).
        wave.complete();

        return new SimulationResult(ticks, wave.getGoldEarned(), castleDamageTaken);
    }

    /** Inflige des dégâts à un ennemi, enregistre l'évènement et le crédit en or s'il meurt. */
    /**
     * Seuil (en PV de BASE du type, pas les PV scalés par vague — sinon tout
     * finirait "massif" passé la vague 5) au-delà duquel une cible est considérée
     * massive : Troll (250), Chevalier noir (188), Sapeur (180) et Boss (900) le
     * sont ; Goblin (38) et Orc (100) ne le sont pas.
     */
    private static final int HEAVY_TARGET_BASE_HP_THRESHOLD = 150;

    /** Dégâts effectifs d'un tir : bonus perce-blindage contre les cibles massives (voir TowerType.heavyTargetMultiplier). */
    private int effectiveDamage(Tower tower, Enemy target) {
        int damage = tower.getDamage();
        if (tower.getType().heavyTargetMultiplier > 1.0
                && target.getType().baseHp >= HEAVY_TARGET_BASE_HP_THRESHOLD) {
            damage = (int) Math.round(damage * tower.getType().heavyTargetMultiplier);
        }
        return damage;
    }

    private void applyDamage(Tower tower, Enemy target, int damage,
                              Wave wave, List<DamageEvent> damageEvents, List<UUID> deaths) {
        // Armure enchantée (EnemyType.magicArmor) : tout dégât non-Mage ricoche.
        // Le tir PART quand même (l'ennemi aggro les tours et consomme leur
        // cadence — c'est son rôle de leurre) : l'évènement est émis à 0 pour
        // que le front montre l'impact sans perte de PV.
        if (target.getType().magicArmor && tower.getType() != TowerType.MAGE) {
            damage = 0;
        }
        target.takeDamage(damage);
        damageEvents.add(new DamageEvent(tower.getId(), target.getId(), damage));
        if (target.isDead()) {
            wave.addGold(target.getGoldReward());
            deaths.add(target.getId());
        }
    }

    /**
     * Sélection de cible d'une tour, selon son TargetingMode (choisi par le
     * joueur) : CLOSEST (plus proche), FIRST (plus avancé sur le chemin),
     * STRONGEST (plus de PV courants). Pour une tour perce-blindage (Baliste,
     * heavyTargetMultiplier > 1), PRIORITÉ aux cibles massives : le mode
     * s'applique d'abord PARMI les massives à portée, puis en repli sur le
     * reste — à un carreau toutes les ~8 ticks, chaque tir gaspillé sur un
     * Goblin est une catastrophe (repli plutôt que ciblage exclusif : une tour
     * inerte devant une vague de piétaille serait vécue comme un bug).
     */
    private Enemy findTarget(Tower tower, List<Enemy> enemies, Set<UUID> escaped, int tick,
                              Map<UUID, Double> progress) {
        if (tower.getType().heavyTargetMultiplier > 1.0) {
            Enemy heavy = findBestTarget(tower, enemies, escaped, tick, progress, true);
            if (heavy != null) {
                return heavy;
            }
        }
        return findBestTarget(tower, enemies, escaped, tick, progress, false);
    }

    private Enemy findBestTarget(Tower tower, List<Enemy> enemies, Set<UUID> escaped, int tick,
                                  Map<UUID, Double> progress, boolean heavyOnly) {
        Enemy best = null;
        double bestScore = Double.NEGATIVE_INFINITY;

        for (Enemy enemy : enemies) {
            if (enemy.isDead() || escaped.contains(enemy.getId())) {
                continue;
            }
            if (tick <= enemy.getSpawnDelayTicks()) {
                continue;
            }
            if (heavyOnly && enemy.getType().baseHp < HEAVY_TARGET_BASE_HP_THRESHOLD) {
                continue;
            }
            // Seule la passe PRIORITAIRE (perce-blindage de la Baliste) évite
            // l'armure enchantée : choisir délibérément une cible qu'on ne peut
            // pas blesser serait absurde. En ciblage normal, les tours physiques
            // prennent bien le Chevalier noir pour cible — et leurs tirs
            // ricochent (voir applyDamage) : il AGGRO la défense, c'est tout
            // l'intérêt du leurre.
            if (heavyOnly && enemy.getType().magicArmor && tower.getType() != TowerType.MAGE) {
                continue;
            }
            if (!tower.canTarget(enemy)) {
                continue;
            }

            // Score à MAXIMISER selon le mode : distance inversée (CLOSEST),
            // progression sur le chemin (FIRST), PV courants (STRONGEST).
            double dx = tower.getX() - enemy.getX();
            double dy = tower.getY() - enemy.getY();
            double score = switch (tower.getTargetingMode()) {
                case CLOSEST -> -(dx * dx + dy * dy);
                case FIRST -> progress.getOrDefault(enemy.getId(), 0.0);
                case STRONGEST -> enemy.getCurrentHp();
            };
            if (score > bestScore) {
                bestScore = score;
                best = enemy;
            }
        }

        return best;
    }

    /**
     * Gère le comportement d'un Sapeur (EnemyType.attacksTowers) pour ce tick.
     *
     * Tant qu'il n'a pas de cible courante (siegeTargets ne contient pas son id) :
     * choisit la tour la plus proche parmi celles restant sur la map, sans limite
     * de portée (comportement confirmé : « fonce sur la tour la plus proche »).
     * Une fois accroché à une cible, il ne la change jamais en cours de route,
     * même si une autre tour devient plus proche pendant le trajet.
     *
     * Une fois à portée de mêlée, il s'arrête et inflige des dégâts de siège
     * chaque tick au lieu d'avancer. Quand la tour tombe, elle est retirée de la
     * map (case définitivement libérée — confirmé) et l'entrée de siegeTargets
     * est retirée : au tick suivant, ce même Sapeur recherchera la tour la plus
     * proche parmi celles qui restent et recommencera le cycle. Il ne reprend sa
     * route vers le château que lorsqu'il ne reste plus aucune tour sur la map.
     *
     * @return true si ce tick a été consommé par ce comportement (déplacement
     *         hors chemin ou attaque) ; false si aucune tour ne reste sur la map,
     *         auquel cas l'appelant doit appliquer le suivi de chemin normal.
     */
    private boolean handleSapperTick(Enemy enemy, GameMap map, List<Position> path,
                                      Map<UUID, Double> progress, Map<UUID, UUID> siegeTargets,
                                      List<TowerDamageEvent> towerDamageEvents, List<UUID> destroyedTowers) {
        UUID targetId = siegeTargets.get(enemy.getId());
        Tower target;

        if (targetId == null) {
            target = findClosestTower(enemy, map.getTowers());
            if (target == null) {
                // Plus aucune tour sur la map (toutes détruites, ou aucune n'a
                // jamais été posée) : reprend/suit le chemin normalement.
                return false;
            }
            siegeTargets.put(enemy.getId(), target.getId());
        } else {
            target = map.getTowerById(targetId).orElse(null);
            if (target == null) {
                // Garde-fou : la cible a disparu sans repasser par le nettoyage
                // ci-dessous (ne devrait pas arriver). On retire l'entrée pour
                // retenter une nouvelle cible dès le prochain tick.
                siegeTargets.remove(enemy.getId());
                return true;
            }
        }

        double dx = target.getX() - enemy.getX();
        double dy = target.getY() - enemy.getY();
        double dist = Math.sqrt(dx * dx + dy * dy);

        if (dist <= SIEGE_MELEE_RANGE) {
            // Contre un mur, le Sapeur frappe x3 (voir WALL_SAPPER_MULTIPLIER) :
            // casser les défenses est sa spécialité, le mur ne doit jamais être
            // une meilleure réponse au Sapeur que de l'abattre en route.
            int damage = enemy.getType().siegeDamage
                    * (target.getType() == TowerType.WALL ? WALL_SAPPER_MULTIPLIER : 1);
            target.takeSiegeDamage(damage);
            towerDamageEvents.add(new TowerDamageEvent(enemy.getId(), target.getId(), damage));

            if (target.isDestroyed()) {
                map.removeTower(target.getX(), target.getY());
                destroyedTowers.add(target.getId());
                // Libère la cible : le prochain tick recherchera la tour la plus
                // proche parmi celles qui restent. Tient aussi à jour le point du
                // chemin le plus proche au cas où il ne resterait plus aucune
                // tour — permet de reprendre la route sans téléportation.
                siegeTargets.remove(enemy.getId());
                progress.put(enemy.getId(), nearestPathIndex(enemy, path));
            }
        } else {
            double speed = enemy.getType().speed;
            enemy.moveTo(enemy.getX() + (dx / dist) * speed, enemy.getY() + (dy / dist) * speed);
        }

        return true;
    }

    /**
     * Première case de mur intacte sur le chemin STRICTEMENT devant l'ennemi
     * (index >= ceil(progress) : une case déjà franchie ne bloque plus). Null si
     * la route est dégagée jusqu'au château.
     */
    private Integer firstWallIndexAhead(double progress, List<Position> path, GameMap map) {
        for (int i = (int) Math.ceil(progress); i < path.size(); i++) {
            Position cell = path.get(i);
            Tower tower = map.getTowerAt(cell.x(), cell.y()).orElse(null);
            if (tower != null && tower.getType() == TowerType.WALL && !tower.isDestroyed()) {
                return i;
            }
        }
        return null;
    }

    /**
     * Attaque de contact d'un ennemi bloqué contre le mur qui lui barre la route :
     * chaque type frappe à sa propre valeur (EnemyType.wallDamage — le Goblin
     * gratte, le Troll démolit), la composition de la vague détermine donc la
     * durée de vie du barrage. Le mur détruit est retiré de la map (case à
     * nouveau franchissable ET constructible), comme toute structure.
     */
    private void attackWall(Enemy enemy, Position wallCell, GameMap map,
                             List<TowerDamageEvent> towerDamageEvents, List<UUID> destroyedTowers) {
        Tower wall = map.getTowerAt(wallCell.x(), wallCell.y()).orElse(null);
        if (wall == null || wall.isDestroyed()) {
            return;
        }
        int damage = enemy.getType().wallDamage;
        wall.takeSiegeDamage(damage);
        towerDamageEvents.add(new TowerDamageEvent(enemy.getId(), wall.getId(), damage));
        if (wall.isDestroyed()) {
            map.removeTower(wall.getX(), wall.getY());
            destroyedTowers.add(wall.getId());
        }
    }

    /**
     * Rayon de siège continu (EnemyType.Ray — Troll, Chevalier noir, Boss,
     * profil "tour Mage" inversé) : canalise chaque tick, sans cooldown, sur la
     * tour non détruite la plus proche à portée — retarget à chaque tick, comme
     * une tour CONTINUOUS retarget chaque tick l'ennemi le plus proche. Une tour
     * détruite par le rayon est retirée de la map (case libérée), comme pour le
     * Sapeur et le pulse.
     */
    private void handleSiegeRayTick(Enemy enemy, GameMap map,
                                     List<TowerDamageEvent> towerDamageEvents,
                                     List<UUID> destroyedTowers) {
        EnemyType.Ray ray = enemy.getType().ray;

        Tower closest = null;
        double closestDist = Double.MAX_VALUE;
        for (Tower tower : map.getTowers()) {
            if (tower.isDestroyed()) {
                continue;
            }
            double dx = tower.getX() - enemy.getX();
            double dy = tower.getY() - enemy.getY();
            double dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= ray.range() && dist < closestDist) {
                closestDist = dist;
                closest = tower;
            }
        }
        if (closest == null) {
            return;
        }

        closest.takeSiegeDamage(ray.damagePerTick());
        towerDamageEvents.add(new TowerDamageEvent(enemy.getId(), closest.getId(), ray.damagePerTick()));
        if (closest.isDestroyed()) {
            map.removeTower(closest.getX(), closest.getY());
            destroyedTowers.add(closest.getId());
        }
    }

    /**
     * Exécute une pulsation d'aura/AoE d'un Boss (EnemyType.isBoss) : soigne les
     * ennemis vivants dans auraRadius (hors lui-même) d'une fraction de leurs PV
     * max, puis inflige aoeDamage à chaque tour dans aoeRadius — potentiellement
     * plusieurs tours en une seule pulsation, contrairement au Sapeur qui ne vise
     * qu'une tour à la fois — et les ÉTOURDIT stunDurationTicks (elles cessent de
     * tirer, voir towerStuns dans simulate) : le boss est une zone morte mobile,
     * pas un simple sac de PV. Une tour détruite par ce pulse est retirée de la
     * map (case libérée), comme pour le Sapeur (voir handleSapperTick).
     */
    private BossAbilityEvent handleBossAbilityTick(Enemy boss, GameMap map, Wave wave,
                                                     List<TowerDamageEvent> towerDamageEvents,
                                                     List<UUID> destroyedTowers,
                                                     Map<UUID, Integer> towerStuns) {
        EnemyType type = boss.getType();

        int alliesHealed = 0;
        for (Enemy other : wave.getEnemies()) {
            if (other.getId().equals(boss.getId()) || other.isDead() || other.getCurrentHp() >= other.getMaxHp()) {
                continue;
            }
            double dx = other.getX() - boss.getX();
            double dy = other.getY() - boss.getY();
            if (Math.sqrt(dx * dx + dy * dy) <= type.auraRadius) {
                other.heal((int) Math.round(other.getMaxHp() * type.auraHealRatio));
                alliesHealed++;
            }
        }

        int towersHit = 0;
        // Copie défensive : une tour détruite par ce pulse est retirée de `map`
        // en cours d'itération (même besoin que handleSapperTick).
        for (Tower tower : new ArrayList<>(map.getTowers())) {
            if (tower.isDestroyed()) {
                continue;
            }
            double dx = tower.getX() - boss.getX();
            double dy = tower.getY() - boss.getY();
            if (Math.sqrt(dx * dx + dy * dy) <= type.aoeRadius) {
                tower.takeSiegeDamage(type.aoeDamage);
                towerDamageEvents.add(new TowerDamageEvent(boss.getId(), tower.getId(), type.aoeDamage));
                towersHit++;
                if (tower.isDestroyed()) {
                    map.removeTower(tower.getX(), tower.getY());
                    destroyedTowers.add(tower.getId());
                } else if (type.stunDurationTicks > 0) {
                    // Étourdissement (voir EnemyType.stunDurationTicks) : merge en
                    // MAX et non en addition — deux boss qui pulsent la même tour
                    // rafraîchissent l'étourdissement, ils ne l'empilent pas
                    // (sinon un duo de boss vague 30+ la verrouillerait sans fin).
                    towerStuns.merge(tower.getId(), type.stunDurationTicks, Math::max);
                }
            }
        }

        return new BossAbilityEvent(boss.getId(), boss.getX(), boss.getY(), alliesHealed, towersHit);
    }

    /** Tour la plus proche d'un ennemi donné, sans limite de distance. Null si la map n'a aucune tour. */
    private Tower findClosestTower(Enemy enemy, List<Tower> towers) {
        Tower best = null;
        double bestDistSq = Double.MAX_VALUE;

        for (Tower tower : towers) {
            double dx = tower.getX() - enemy.getX();
            double dy = tower.getY() - enemy.getY();
            double distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                best = tower;
            }
        }

        return best;
    }

    /** Index du point du chemin le plus proche de la position courante d'un ennemi qui en a dévié. */
    private double nearestPathIndex(Enemy enemy, List<Position> path) {
        int bestIndex = 0;
        double bestDistSq = Double.MAX_VALUE;

        for (int i = 0; i < path.size(); i++) {
            Position p = path.get(i);
            double dx = p.x() - enemy.getX();
            double dy = p.y() - enemy.getY();
            double distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestIndex = i;
            }
        }

        return bestIndex;
    }
}
