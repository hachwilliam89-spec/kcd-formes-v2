package com.kcdformes.domain.service;

import com.kcdformes.domain.model.EnemyType;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;
import com.kcdformes.domain.model.match.LiveEnemy;
import com.kcdformes.domain.model.match.MatchGameState;

import java.util.Iterator;
import java.util.List;

/**
 * Moteur de la boucle de jeu LIVE du multijoueur (Jalon 3a). Avance l'état d'un
 * pas à chaque tick : spawn des ennemis, déplacement le long du chemin serpentin,
 * dégâts au château à l'arrivée. Service domaine pur (aucune dépendance Spring —
 * déclaré comme bean dans DomainConfig).
 *
 * Jalon 3a = mouvement seul (pas encore de tours ni de combat : ça vient au 3b).
 * On réutilise le chemin (PathfindingService) et la vitesse des EnemyType du solo,
 * mais la simulation est ici STEPPÉE en direct au lieu d'être pré-calculée.
 */
public class MatchEngine {

    // La vitesse des EnemyType est calibrée par tick de 120 ms (solo). La boucle
    // live tourne plus vite (~66 ms) : on met à l'échelle pour garder le même ressenti.
    private static final double SOLO_TICK_MS = 120.0;
    private static final int SPAWN_INTERVAL_TICKS = 18;
    private static final int CASTLE_MAX_HP = 100;
    private static final int STARTING_GOLD = 250;   // or PARTAGÉ au départ (coop)
    private static final int FIRST_WAVE_SIZE = 6;

    private final PathfindingService pathfindingService;

    public MatchEngine(PathfindingService pathfindingService) {
        this.pathfindingService = pathfindingService;
    }

    /** Prépare l'état de jeu au démarrage d'un match (chemin + PV château). */
    public MatchGameState start(GameMap map) {
        List<Position> path = pathfindingService.findCorridorPath(map);
        return new MatchGameState(path, map, CASTLE_MAX_HP, STARTING_GOLD, FIRST_WAVE_SIZE);
    }

    /** Avance l'état d'un tick (dtMs = durée réelle du tick). */
    public void step(MatchGameState s, double dtMs) {
        s.tick++;
        s.shots.clear();
        double soloTicks = dtMs / SOLO_TICK_MS; // « ticks solo » écoulés ce tick live

        // 1) Spawn cadencé jusqu'à atteindre la taille de vague.
        if (s.spawnedThisWave < s.waveSize) {
            if (s.ticksToNextSpawn <= 0) {
                Position start = s.path.get(0);
                s.enemies.add(new LiveEnemy(EnemyType.GOBLIN, start.x(), start.y()));
                s.spawnedThisWave++;
                s.ticksToNextSpawn = SPAWN_INTERVAL_TICKS;
            } else {
                s.ticksToNextSpawn--;
            }
        }

        // 2) Déplacement + arrivée au château.
        Iterator<LiveEnemy> it = s.enemies.iterator();
        while (it.hasNext()) {
            LiveEnemy e = it.next();
            advance(s, e, e.type.speed * (dtMs / SOLO_TICK_MS));
            if (e.reachedEnd) {
                s.castleHp = Math.max(0, s.castleHp - e.type.castleDamage);
                it.remove();
            }
        }

        // 3) Combat : chaque tour (hors mur) vise l'ennemi le plus proche à portée
        // selon sa cadence, et lui inflige ses dégâts. (3b : cible unique pour tous
        // les types — l'AOE de la Catapulte et l'armure du Chevalier viendront après.)
        for (Tower tower : s.map.getTowers()) {
            if (tower.getType() == TowerType.WALL) continue;
            double cd = s.towerCooldowns.getOrDefault(tower.getId(), 0.0) - soloTicks;
            if (cd <= 0) {
                LiveEnemy target = nearestInRange(tower, s.enemies);
                if (target != null) {
                    target.hp -= tower.getDamage();
                    s.shots.add(new double[]{tower.getX(), tower.getY(), target.x, target.y});
                    cd = 1.0 / tower.getType().attackSpeed; // prochaine salve (en ticks solo)
                } else {
                    cd = 0; // pas de cible : reste prêt à tirer
                }
            }
            s.towerCooldowns.put(tower.getId(), cd);
        }

        // 4) Morts : retire les ennemis à 0 PV et crédite l'or PARTAGÉ.
        Iterator<LiveEnemy> dead = s.enemies.iterator();
        while (dead.hasNext()) {
            LiveEnemy e = dead.next();
            if (e.hp <= 0) {
                s.gold += e.type.goldReward;
                dead.remove();
            }
        }

        // 5) Vague suivante quand tout est spawné et nettoyé.
        if (s.spawnedThisWave >= s.waveSize && s.enemies.isEmpty()) {
            s.wave++;
            s.spawnedThisWave = 0;
            s.waveSize += 2;
        }
    }

    /** Ennemi vivant le plus proche dans la portée de la tour (cases). */
    private LiveEnemy nearestInRange(Tower tower, List<LiveEnemy> enemies) {
        double range = tower.getRange();
        LiveEnemy best = null;
        double bestDist = Double.MAX_VALUE;
        for (LiveEnemy e : enemies) {
            if (e.hp <= 0) continue;
            double d = Math.hypot(tower.getX() - e.x, tower.getY() - e.y);
            if (d <= range && d < bestDist) {
                bestDist = d;
                best = e;
            }
        }
        return best;
    }

    /** Fait avancer un ennemi de `dist` cases le long du chemin. */
    private void advance(MatchGameState s, LiveEnemy e, double dist) {
        while (dist > 0 && e.pathIndex < s.path.size() - 1) {
            Position target = s.path.get(e.pathIndex + 1);
            double dx = target.x() - e.x;
            double dy = target.y() - e.y;
            double d = Math.hypot(dx, dy);
            if (d <= dist) {
                e.x = target.x();
                e.y = target.y();
                e.pathIndex++;
                dist -= d;
            } else {
                e.x += dx / d * dist;
                e.y += dy / d * dist;
                dist = 0;
            }
        }
        if (e.pathIndex >= s.path.size() - 1) {
            e.reachedEnd = true;
        }
    }
}
