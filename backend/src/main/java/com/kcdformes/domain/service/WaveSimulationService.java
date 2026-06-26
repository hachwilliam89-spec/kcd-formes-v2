package com.kcdformes.domain.service;

import com.kcdformes.domain.model.Castle;
import com.kcdformes.domain.model.DamageType;
import com.kcdformes.domain.model.Enemy;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.Tower;
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

    private final PathfindingService pathfindingService;

    public WaveSimulationService(PathfindingService pathfindingService) {
        this.pathfindingService = pathfindingService;
    }

    public record EnemySnapshot(UUID enemyId, String enemyType, double x, double y, int hp, int maxHp) {}

    public record DamageEvent(UUID towerId, UUID enemyId, int damage) {}

    /** Dégâts de siège infligés par un Sapeur (EnemyType.attacksTowers) à la tour qu'il assiège. */
    public record TowerDamageEvent(UUID enemyId, UUID towerId, int damage) {}

    public record TickSnapshot(
            int tick,
            List<EnemySnapshot> enemies,
            List<DamageEvent> damageEvents,
            List<TowerDamageEvent> towerDamageEvents,
            List<UUID> deaths,
            List<UUID> reachedCastle,
            List<UUID> destroyedTowers,
            int castleHp
    ) {}

    public record SimulationResult(List<TickSnapshot> ticks, int goldEarned, int castleDamageTaken) {}

    public SimulationResult simulate(GameMap map, Wave wave, Castle castle) {
        List<Position> path = pathfindingService.findPath(map);
        if (path == null || path.isEmpty()) {
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

        Set<UUID> escaped = new HashSet<>();
        List<TickSnapshot> ticks = new ArrayList<>();
        int castleDamageTaken = 0;
        int lastPathIndex = path.size() - 1;

        int tick = 0;
        while (tick < MAX_TICKS) {
            tick++;
            List<DamageEvent> damageEvents = new ArrayList<>();
            List<TowerDamageEvent> towerDamageEvents = new ArrayList<>();
            List<UUID> deaths = new ArrayList<>();
            List<UUID> reached = new ArrayList<>();
            List<UUID> destroyedTowers = new ArrayList<>();

            // 1. Déplacement des ennemis le long du chemin
            for (Enemy enemy : wave.getEnemies()) {
                if (enemy.isDead() || escaped.contains(enemy.getId())) {
                    continue;
                }
                if (tick <= enemy.getSpawnDelayTicks()) {
                    // Pas encore apparu : reste invisible et immobile au point de spawn.
                    continue;
                }

                if (enemy.getType().attacksTowers) {
                    boolean diverted = handleSapperTick(enemy, map, path, progress, siegeTargets,
                            towerDamageEvents, destroyedTowers);
                    if (diverted) {
                        // Ce tick a été consommé par le déplacement hors-chemin ou
                        // l'attaque de la tour visée : pas de suivi de chemin normal.
                        continue;
                    }
                }

                double p = progress.get(enemy.getId()) + enemy.getType().speed;
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

                    // Décale l'ennemi perpendiculairement à la direction du segment de
                    // chemin courant, pour plusieurs ennemis de front sur un couloir
                    // élargi plutôt qu'une file unique strictement sur l'axe du chemin.
                    double dirX = to.x() - from.x();
                    double dirY = to.y() - from.y();
                    double dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
                    if (dirLen > 0) {
                        nx += (-dirY / dirLen) * enemy.getLaneOffset();
                        ny += (dirX / dirLen) * enemy.getLaneOffset();
                    }

                    enemy.moveTo(nx, ny);
                }
            }

            // 2. Attaques des tours (cible : ennemi à portée le plus proche)
            for (Tower tower : towers) {
                if (tower.isDestroyed()) {
                    // Détruite par un Sapeur plus tôt dans la simulation (la liste
                    // `towers` capturée en début de méthode garde une référence
                    // vers l'objet, même après sa suppression de `map`) : ne tire plus.
                    continue;
                }

                if (tower.getType().damageType == DamageType.CONTINUOUS) {
                    // Pas de cooldown : un rayon continu tape chaque tick tant qu'une
                    // cible est en portée (voir TowerType pour le rééquilibrage de
                    // baseDamage qui accompagne ce profil).
                    Enemy target = findClosestTarget(tower, wave.getEnemies(), escaped, tick);
                    if (target != null) {
                        applyDamage(tower, target, tower.getDamage(), wave, damageEvents, deaths);
                    }
                    continue;
                }

                double cooldown = cooldowns.get(tower.getId()) - 1.0;
                if (cooldown > 0) {
                    cooldowns.put(tower.getId(), cooldown);
                    continue;
                }

                Enemy target = findClosestTarget(tower, wave.getEnemies(), escaped, tick);
                if (target == null) {
                    cooldowns.put(tower.getId(), 0.0);
                    continue;
                }

                applyDamage(tower, target, tower.getDamage(), wave, damageEvents, deaths);

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

            final int currentTick = tick;
            List<EnemySnapshot> snapshot = wave.getEnemies().stream()
                    .filter(enemy -> !escaped.contains(enemy.getId()))
                    .filter(enemy -> currentTick > enemy.getSpawnDelayTicks())
                    .map(enemy -> new EnemySnapshot(
                            enemy.getId(), enemy.getType().name(),
                            enemy.getX(), enemy.getY(),
                            enemy.getCurrentHp(), enemy.getMaxHp()))
                    .toList();

            ticks.add(new TickSnapshot(tick, snapshot, damageEvents, towerDamageEvents, deaths, reached,
                    destroyedTowers, castle.getHp()));

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
    private void applyDamage(Tower tower, Enemy target, int damage,
                              Wave wave, List<DamageEvent> damageEvents, List<UUID> deaths) {
        target.takeDamage(damage);
        damageEvents.add(new DamageEvent(tower.getId(), target.getId(), damage));
        if (target.isDead()) {
            wave.addGold(target.getGoldReward());
            deaths.add(target.getId());
        }
    }

    private Enemy findClosestTarget(Tower tower, List<Enemy> enemies, Set<UUID> escaped, int tick) {
        Enemy best = null;
        double bestDistSq = Double.MAX_VALUE;

        for (Enemy enemy : enemies) {
            if (enemy.isDead() || escaped.contains(enemy.getId())) {
                continue;
            }
            if (tick <= enemy.getSpawnDelayTicks()) {
                continue;
            }
            if (!tower.canTarget(enemy)) {
                continue;
            }
            double dx = tower.getX() - enemy.getX();
            double dy = tower.getY() - enemy.getY();
            double distSq = dx * dx + dy * dy;
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
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
     * proche parmi celles qui restent et recommencera le cycle (confirmé : « après
     * une tour détruite, les Sapeurs ciblent une autre »). Il ne reprend sa route
     * vers le château que lorsqu'il ne reste plus aucune tour sur la map.
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
            target.takeSiegeDamage(enemy.getType().siegeDamage);
            towerDamageEvents.add(new TowerDamageEvent(enemy.getId(), target.getId(), enemy.getType().siegeDamage));

            if (target.isDestroyed()) {
                map.removeTower(target.getX(), target.getY());
                destroyedTowers.add(target.getId());
                // Libère la cible : le prochain tick recherchera la tour la plus
                // proche parmi celles qui restent (voir javadoc ci-dessus). Tient
                // aussi à jour le point du chemin le plus proche au cas où il ne
                // resterait plus aucune tour — permet de reprendre la route vers
                // le château sans téléportation si c'est le cas.
                siegeTargets.remove(enemy.getId());
                progress.put(enemy.getId(), nearestPathIndex(enemy, path));
            }
        } else {
            double speed = enemy.getType().speed;
            enemy.moveTo(enemy.getX() + (dx / dist) * speed, enemy.getY() + (dy / dist) * speed);
        }

        return true;
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
