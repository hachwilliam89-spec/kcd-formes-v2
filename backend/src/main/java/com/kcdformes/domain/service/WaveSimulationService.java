package com.kcdformes.domain.service;

import com.kcdformes.domain.model.Castle;
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
    private static final int MAX_TICKS = 600;

    private final PathfindingService pathfindingService;

    public WaveSimulationService(PathfindingService pathfindingService) {
        this.pathfindingService = pathfindingService;
    }

    public record EnemySnapshot(UUID enemyId, String enemyType, double x, double y, int hp, int maxHp) {}

    public record DamageEvent(UUID towerId, UUID enemyId, int damage) {}

    public record TickSnapshot(
            int tick,
            List<EnemySnapshot> enemies,
            List<DamageEvent> damageEvents,
            List<UUID> deaths,
            List<UUID> reachedCastle,
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

        Set<UUID> escaped = new HashSet<>();
        List<TickSnapshot> ticks = new ArrayList<>();
        int castleDamageTaken = 0;
        int lastPathIndex = path.size() - 1;

        int tick = 0;
        while (tick < MAX_TICKS) {
            tick++;
            List<DamageEvent> damageEvents = new ArrayList<>();
            List<UUID> deaths = new ArrayList<>();
            List<UUID> reached = new ArrayList<>();

            // 1. Déplacement des ennemis le long du chemin
            for (Enemy enemy : wave.getEnemies()) {
                if (enemy.isDead() || escaped.contains(enemy.getId())) {
                    continue;
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
                    enemy.moveTo(nx, ny);
                }
            }

            // 2. Attaques des tours (cible : ennemi à portée le plus proche)
            for (Tower tower : towers) {
                double cooldown = cooldowns.get(tower.getId()) - 1.0;
                if (cooldown > 0) {
                    cooldowns.put(tower.getId(), cooldown);
                    continue;
                }

                Enemy target = findClosestTarget(tower, wave.getEnemies(), escaped);
                if (target == null) {
                    cooldowns.put(tower.getId(), 0.0);
                    continue;
                }

                target.takeDamage(tower.getDamage());
                damageEvents.add(new DamageEvent(tower.getId(), target.getId(), tower.getDamage()));
                if (target.isDead()) {
                    wave.addGold(target.getGoldReward());
                    deaths.add(target.getId());
                }
                cooldowns.put(tower.getId(), 1.0 / tower.getType().attackSpeed);
            }

            List<EnemySnapshot> snapshot = wave.getEnemies().stream()
                    .filter(enemy -> !escaped.contains(enemy.getId()))
                    .map(enemy -> new EnemySnapshot(
                            enemy.getId(), enemy.getType().name(),
                            enemy.getX(), enemy.getY(),
                            enemy.getCurrentHp(), enemy.getType().baseHp))
                    .toList();

            ticks.add(new TickSnapshot(tick, snapshot, damageEvents, deaths, reached, castle.getHp()));

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

    private Enemy findClosestTarget(Tower tower, List<Enemy> enemies, Set<UUID> escaped) {
        Enemy best = null;
        double bestDistSq = Double.MAX_VALUE;

        for (Enemy enemy : enemies) {
            if (enemy.isDead() || escaped.contains(enemy.getId())) {
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
}
