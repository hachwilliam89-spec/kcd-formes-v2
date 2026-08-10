package com.kcdformes.domain.service;

import com.kcdformes.domain.model.DamageType;
import com.kcdformes.domain.model.EnemyType;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;
import com.kcdformes.domain.model.match.LiveEnemy;
import com.kcdformes.domain.model.match.MatchGameState;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Random;

/**
 * Moteur de la boucle de jeu LIVE du multijoueur (coop + versus). Avance l'état
 * d'un pas à chaque tick : spawn, déplacement, combat. Service domaine pur
 * (aucune dépendance Spring — déclaré comme bean dans DomainConfig).
 *
 * FIDÉLITÉ SOLO : les particularités des unités sont portées à l'identique du
 * WaveSimulationService solo — armure magique (Chevalier noir), profils de dégâts
 * des tours (zone Catapulte, rayon continu Mage, perce-blindage Baliste), modes
 * de ciblage, rayons de siège (Troll/Chariot/Boss), Sapeur qui détruit les tours,
 * pulse d'aura/étourdissement des Boss, murs-barrage et défense du château.
 *
 * Un tick live = un tick solo (SOLO_TICK_MS) : le ticker tourne à cette cadence,
 * donc la logique se transpose 1:1 sans mise à l'échelle fractionnaire.
 */
public class MatchEngine {

    private static final double SOLO_TICK_MS = 120.0;
    private static final int SPAWN_INTERVAL_TICKS = 4;   // spawn rapproché (tension versus)
    private static final int INTER_WAVE_TICKS = 20;      // respiration entre deux vagues (~2,4 s)
    private static final int KILLS_PER_BONUS = 50;       // un bonus offert tous les 50 kills
    // Plafond d'ennemis simultanés par board : le spawn de base se met en pause
    // au plafond (la file d'attente patiente). Borne le coût par tick (combat en
    // O(n²) : zone Catapulte, aura Boss, ciblage) — sinon un board qu'on ne tient
    // plus voit ses ennemis s'accumuler sans fin, ce qui fait laguer TOUS les
    // matchs (un seul thread de tick) et fige les snapshots (or figé puis rattrapé).
    private static final int MAX_LIVE_ENEMIES = 80;
    private static final int CASTLE_MAX_HP = 100;
    private static final int STARTING_GOLD = 250;
    private static final int FIRST_WAVE_SIZE = 36;        // vague dense dès le départ

    // Défense intégrée du château (identique au solo).
    private static final double CASTLE_DEFENSE_RANGE = 3.5;
    private static final int CASTLE_DEFENSE_DAMAGE = 20;
    private static final int CASTLE_DEFENSE_COOLDOWN = 5;

    private static final double SIEGE_MELEE_RANGE = 1.0;
    private static final int WALL_SAPPER_MULTIPLIER = 3;
    // Seuil de PV de base au-delà duquel une cible est « massive » (perce-blindage).
    private static final int HEAVY_TARGET_BASE_HP_THRESHOLD = 150;

    // Scaling des PV par vague (identique au solo WaveFactory) : courbe à deux
    // pentes, pente douce au-delà de HP_CURVE_BREAK_WAVE pour garder les vagues
    // profondes atteignables. Les gobelins de la vague montent ainsi en puissance.
    private static final double HP_GROWTH_RATE = 1.16;
    private static final double HP_LATE_GROWTH_RATE = 1.08;
    private static final int HP_CURVE_BREAK_WAVE = 12;

    private final PathfindingService pathfindingService;

    public MatchEngine(PathfindingService pathfindingService) {
        this.pathfindingService = pathfindingService;
    }

    /** Prépare l'état de jeu au démarrage d'un match (chemin + PV château). */
    public MatchGameState start(GameMap map) {
        List<Position> path = pathfindingService.findCorridorPath(map);
        MatchGameState s = new MatchGameState(path, map, CASTLE_MAX_HP, STARTING_GOLD, FIRST_WAVE_SIZE);
        s.spawnQueue.addAll(buildWave(s.wave)); // compose la première vague
        return s;
    }

    /** Avance l'état d'un tick (dtMs = durée réelle du tick, calée sur SOLO_TICK_MS). */
    public void step(MatchGameState s, double dtMs) {
        s.tick++;
        s.shots.clear();
        double soloTicks = dtMs / SOLO_TICK_MS; // ≈ 1 (le ticker tourne à SOLO_TICK_MS)
        GameMap map = s.map;
        Position start = s.path.get(0);

        // 0) Ennemis ENVOYÉS par l'adversaire (versus rush) : un par tick, scalés
        // sur la vague courante du board qui les reçoit (menace proportionnée).
        EnemyType sent = s.incomingSends.poll();
        if (sent != null) {
            s.enemies.add(new LiveEnemy(sent, start.x(), start.y(), scaledHp(sent, s.wave)));
        }

        // 1) Spawn cadencé depuis la file de la vague + enchaînement CONTINU : une
        // fois la file vidée, la vague suivante est composée après une courte
        // respiration — SANS attendre que le board soit vide (sinon un ennemi
        // lent/immortel, ex. Chevalier noir envoyé sans Mage, coupe tout le flux).
        // Le revenu passif versus est crédité au passage de vague.
        if (s.ticksToNextSpawn > 0) {
            s.ticksToNextSpawn--;
        } else if (!s.spawnQueue.isEmpty()) {
            // Pause du spawn au plafond d'ennemis (borne le coût par tick) : la file
            // patiente sans se vider tant que le board est saturé.
            if (s.enemies.size() < MAX_LIVE_ENEMIES) {
                EnemyType next = s.spawnQueue.poll();
                s.enemies.add(new LiveEnemy(next, start.x(), start.y(), scaledHp(next, s.wave)));
                s.ticksToNextSpawn = SPAWN_INTERVAL_TICKS;
            }
        } else {
            s.wave++;
            s.gold += s.income;
            s.spawnQueue.addAll(buildWave(s.wave));
            s.ticksToNextSpawn = INTER_WAVE_TICKS;
        }

        // 2) Déplacement + comportements spéciaux (Sapeur), arrivée au château.
        Iterator<LiveEnemy> it = s.enemies.iterator();
        while (it.hasNext()) {
            LiveEnemy e = it.next();
            // Sapeur (attacksTowers) : dévie pour détruire la tour la plus proche.
            if (e.type.attacksTowers && handleSapper(s, e)) {
                continue; // tick consommé par le siège / déplacement hors-chemin
            }
            advance(s, e, e.type.speed * soloTicks); // suit le chemin, bloqué par les murs
            if (e.reachedEnd) {
                s.castleHp = Math.max(0, s.castleHp - e.type.castleDamage);
                it.remove();
            }
        }

        // 3) Rayons de siège continus (Troll, Chariot, Boss) : usent les tours.
        for (LiveEnemy e : s.enemies) {
            if (e.type.ray != null) handleSiegeRay(s, e);
        }

        // 4) Pulsations des Boss (aura de soin + dégâts/étourdissement des tours).
        for (LiveEnemy e : s.enemies) {
            if (!e.type.isBoss) continue;
            int cd = s.bossCooldowns.getOrDefault(e.id, e.type.abilityIntervalTicks) - 1;
            if (cd > 0) { s.bossCooldowns.put(e.id, cd); continue; }
            s.bossCooldowns.put(e.id, e.type.abilityIntervalTicks);
            handleBossPulse(s, e);
        }

        // 5) Tir des tours (cible selon le mode ; profils de dégâts fidèles au solo).
        for (Tower tower : new ArrayList<>(map.getTowers())) {
            if (tower.isDestroyed()) continue;

            // Étourdie par un Boss : décompte puis on saute le tir.
            Integer stun = s.towerStuns.get(tower.getId());
            if (stun != null) {
                if (stun <= 1) s.towerStuns.remove(tower.getId());
                else s.towerStuns.put(tower.getId(), stun - 1);
                continue;
            }
            if (tower.getType().baseDamage == 0) continue; // WALL : structure passive

            if (tower.getType().damageType == DamageType.CONTINUOUS) {
                // Rayon continu (Mage) : pas de cooldown, tape chaque tick.
                LiveEnemy target = findTarget(tower, s.enemies);
                if (target != null) fireAt(s, tower, target);
                continue;
            }

            double cd = s.towerCooldowns.getOrDefault(tower.getId(), 0.0) - soloTicks;
            if (cd > 0) { s.towerCooldowns.put(tower.getId(), cd); continue; }

            LiveEnemy target = findTarget(tower, s.enemies);
            if (target == null) { s.towerCooldowns.put(tower.getId(), 0.0); continue; }

            fireAt(s, tower, target);
            if (tower.getType().damageType == DamageType.AOE) {
                // Éclats de zone : dégâts réduits (moitié) aux ennemis proches de la cible.
                int splash = (int) Math.round(tower.getDamage() / 2.0);
                for (LiveEnemy other : s.enemies) {
                    if (other == target || other.hp <= 0) continue;
                    if (Math.hypot(other.x - target.x, other.y - target.y) <= tower.getType().splashRadius) {
                        applyDamage(tower, other, splash);
                    }
                }
            }
            s.towerCooldowns.put(tower.getId(), 1.0 / tower.getType().attackSpeed);
        }

        // 6) Défense du château (archers des remparts) : filet contre les fuyards.
        Position castle = s.path.get(s.path.size() - 1);
        if (s.castleCooldown > 0) {
            s.castleCooldown--;
        } else {
            LiveEnemy target = null;
            double bestDistSq = CASTLE_DEFENSE_RANGE * CASTLE_DEFENSE_RANGE;
            for (LiveEnemy e : s.enemies) {
                if (e.hp <= 0) continue;
                double distSq = (e.x - castle.x()) * (e.x - castle.x()) + (e.y - castle.y()) * (e.y - castle.y());
                if (distSq <= bestDistSq) { bestDistSq = distSq; target = e; }
            }
            if (target != null) {
                target.hp -= CASTLE_DEFENSE_DAMAGE; // pas d'or (filet de sécurité)
                s.castleCooldown = CASTLE_DEFENSE_COOLDOWN;
            }
        }

        // 7) Morts : retire les ennemis à 0 PV, crédite l'or PARTAGÉ, incrémente le score.
        Iterator<LiveEnemy> dead = s.enemies.iterator();
        while (dead.hasNext()) {
            LiveEnemy e = dead.next();
            if (e.hp <= 0) {
                s.gold += e.type.goldReward;
                s.enemiesKilled++;
                // Bonus au nombre de kills (choix non bloquant, voir MatchService).
                if (++s.killsSinceBonus >= KILLS_PER_BONUS) {
                    s.killsSinceBonus -= KILLS_PER_BONUS;
                    s.pendingBonuses++;
                }
                s.bossCooldowns.remove(e.id);
                s.siegeTargets.remove(e.id);
                dead.remove();
            }
        }

        // 8) Nettoyage des étourdissements orphelins (tour détruite étourdie).
        s.towerStuns.keySet().removeIf(id -> map.getTowerById(id).map(Tower::isDestroyed).orElse(true));
    }

    // ── Tir d'une tour ────────────────────────────────────────────────────

    /** Résout un tir tour → ennemi : dégâts effectifs + trait pour le rendu. */
    private void fireAt(MatchGameState s, Tower tower, LiveEnemy target) {
        applyDamage(tower, target, effectiveDamage(tower, target));
        s.shots.add(new double[]{tower.getX(), tower.getY(), target.x, target.y});
    }

    /** Dégâts effectifs : bonus perce-blindage contre les cibles massives (Baliste). */
    private int effectiveDamage(Tower tower, LiveEnemy target) {
        int damage = tower.getDamage();
        if (tower.getType().heavyTargetMultiplier > 1.0
                && target.type.baseHp >= HEAVY_TARGET_BASE_HP_THRESHOLD) {
            damage = (int) Math.round(damage * tower.getType().heavyTargetMultiplier);
        }
        return damage;
    }

    /** Applique les dégâts : l'armure magique annule tout dégât non-Mage (leurre). */
    private void applyDamage(Tower tower, LiveEnemy target, int damage) {
        if (target.type.magicArmor && tower.getType() != TowerType.MAGE) damage = 0;
        target.hp -= damage;
    }

    /**
     * Sélection de cible : priorité perce-blindage aux cibles massives (Baliste),
     * puis mode de ciblage du joueur (CLOSEST / FIRST / STRONGEST).
     */
    private LiveEnemy findTarget(Tower tower, List<LiveEnemy> enemies) {
        if (tower.getType().heavyTargetMultiplier > 1.0) {
            LiveEnemy heavy = bestTarget(tower, enemies, true);
            if (heavy != null) return heavy;
        }
        return bestTarget(tower, enemies, false);
    }

    private LiveEnemy bestTarget(Tower tower, List<LiveEnemy> enemies, boolean heavyOnly) {
        double range = tower.getRange();
        LiveEnemy best = null;
        double bestScore = Double.NEGATIVE_INFINITY;
        for (LiveEnemy e : enemies) {
            if (e.hp <= 0) continue;
            if (heavyOnly && e.type.baseHp < HEAVY_TARGET_BASE_HP_THRESHOLD) continue;
            // La passe prioritaire évite l'armure magique (choisir une cible
            // qu'on ne peut pas blesser serait absurde) ; en ciblage normal, les
            // tours physiques prennent quand même le Chevalier noir (leurre).
            if (heavyOnly && e.type.magicArmor && tower.getType() != TowerType.MAGE) continue;
            double dx = tower.getX() - e.x, dy = tower.getY() - e.y;
            double distSq = dx * dx + dy * dy;
            if (distSq > range * range) continue;
            double score = switch (tower.getTargetingMode()) {
                case CLOSEST -> -distSq;
                case FIRST -> e.pathIndex + segmentFraction(e);
                case STRONGEST -> e.hp;
            };
            if (score > bestScore) { bestScore = score; best = e; }
        }
        return best;
    }

    // ── Déplacement le long du chemin (avec murs-barrage) ─────────────────

    /** Fait avancer un ennemi de `dist` cases, bloqué par un mur intact sur sa route. */
    private void advance(MatchGameState s, LiveEnemy e, double dist) {
        GameMap map = s.map;
        while (dist > 0 && e.pathIndex < s.path.size() - 1) {
            Position next = s.path.get(e.pathIndex + 1);
            Tower wall = map.getTowerAt(next.x(), next.y())
                    .filter(t -> t.getType() == TowerType.WALL && !t.isDestroyed())
                    .orElse(null);
            if (wall != null) {
                // Mur-barrage sur la case suivante : on s'arrête devant et on le frappe.
                wall.takeSiegeDamage(e.type.wallDamage);
                if (wall.isDestroyed()) map.removeTower(wall.getX(), wall.getY());
                return;
            }
            double dx = next.x() - e.x, dy = next.y() - e.y;
            double d = Math.hypot(dx, dy);
            if (d <= dist) {
                e.x = next.x(); e.y = next.y(); e.pathIndex++; dist -= d;
            } else {
                e.x += dx / d * dist; e.y += dy / d * dist; dist = 0;
            }
        }
        if (e.pathIndex >= s.path.size() - 1) e.reachedEnd = true;
    }

    /** Fraction (0..1) parcourue dans le segment courant — pour le mode FIRST. */
    private double segmentFraction(LiveEnemy e) {
        return 0.0; // approximation : l'index de segment suffit à ordonner les ennemis
    }

    // ── Sapeur : détruit les tours ────────────────────────────────────────

    /** Comportement Sapeur pour ce tick. @return true si le tick a été consommé. */
    private boolean handleSapper(MatchGameState s, LiveEnemy e) {
        GameMap map = s.map;
        java.util.UUID targetId = s.siegeTargets.get(e.id);
        Tower target;
        if (targetId == null) {
            target = closestTower(e, map.getTowers());
            if (target == null) return false; // plus aucune tour : reprend le chemin
            s.siegeTargets.put(e.id, target.getId());
        } else {
            target = map.getTowerById(targetId).orElse(null);
            if (target == null) { s.siegeTargets.remove(e.id); return true; }
        }
        double dx = target.getX() - e.x, dy = target.getY() - e.y;
        double dist = Math.hypot(dx, dy);
        if (dist <= SIEGE_MELEE_RANGE) {
            int dmg = e.type.siegeDamage * (target.getType() == TowerType.WALL ? WALL_SAPPER_MULTIPLIER : 1);
            target.takeSiegeDamage(dmg);
            if (target.isDestroyed()) {
                map.removeTower(target.getX(), target.getY());
                s.siegeTargets.remove(e.id);
                e.pathIndex = nearestPathIndex(e, s.path);
            }
        } else {
            e.x += dx / dist * e.type.speed;
            e.y += dy / dist * e.type.speed;
        }
        return true;
    }

    // ── Rayon de siège (Troll / Chariot / Boss) ───────────────────────────

    private void handleSiegeRay(MatchGameState s, LiveEnemy e) {
        EnemyType.Ray ray = e.type.ray;
        GameMap map = s.map;
        Tower closest = null;
        double closestDist = Double.MAX_VALUE;
        for (Tower t : map.getTowers()) {
            if (t.isDestroyed()) continue;
            double d = Math.hypot(t.getX() - e.x, t.getY() - e.y);
            if (d <= ray.range() && d < closestDist) { closestDist = d; closest = t; }
        }
        if (closest == null) return;
        closest.takeSiegeDamage(ray.damagePerTick());
        if (closest.isDestroyed()) map.removeTower(closest.getX(), closest.getY());
    }

    // ── Pulse de Boss (aura de soin + AoE/étourdissement) ─────────────────

    private void handleBossPulse(MatchGameState s, LiveEnemy boss) {
        EnemyType type = boss.type;
        for (LiveEnemy other : s.enemies) {
            if (other == boss || other.hp <= 0 || other.hp >= other.maxHp) continue;
            if (Math.hypot(other.x - boss.x, other.y - boss.y) <= type.auraRadius) {
                other.hp = Math.min(other.maxHp, other.hp + (int) Math.round(other.maxHp * type.auraHealRatio));
            }
        }
        GameMap map = s.map;
        for (Tower tower : new ArrayList<>(map.getTowers())) {
            if (tower.isDestroyed()) continue;
            if (Math.hypot(tower.getX() - boss.x, tower.getY() - boss.y) <= type.aoeRadius) {
                tower.takeSiegeDamage(type.aoeDamage);
                if (tower.isDestroyed()) {
                    map.removeTower(tower.getX(), tower.getY());
                } else if (type.stunDurationTicks > 0) {
                    s.towerStuns.merge(tower.getId(), type.stunDurationTicks, Math::max);
                }
            }
        }
    }

    // ── Utilitaires ───────────────────────────────────────────────────────

    private Tower closestTower(LiveEnemy e, List<Tower> towers) {
        Tower best = null;
        double bestDistSq = Double.MAX_VALUE;
        for (Tower t : towers) {
            double distSq = (t.getX() - e.x) * (t.getX() - e.x) + (t.getY() - e.y) * (t.getY() - e.y);
            if (distSq < bestDistSq) { bestDistSq = distSq; best = t; }
        }
        return best;
    }

    /**
     * Composition d'une vague de base (calendrier d'apparition inspiré du solo
     * WaveFactory) : gros socle de gobelins pour la tension, puis élites qui
     * arrivent au fil des vagues — Orc v2, Troll v3, Sapeur v4, Chariot v5,
     * Chevalier noir v6, et un Boss toutes les 10 vagues (en tête, entrée
     * théâtrale). La piétaille et les élites sont mélangées, le Boss reste devant.
     */
    private List<EnemyType> buildWave(int wave) {
        List<EnemyType> list = new ArrayList<>();
        boolean bossWave = wave % 10 == 0;
        if (bossWave) list.add(EnemyType.BOSS_WARLORD);

        int goblins = 24 + wave * 5;
        for (int i = 0; i < goblins; i++) list.add(EnemyType.GOBLIN);
        if (wave >= 2) addN(list, EnemyType.ORC, 2 + wave / 3);
        if (wave >= 3) addN(list, EnemyType.TROLL, 1 + wave / 5);
        if (wave >= 4) addN(list, EnemyType.SAPEUR, wave / 4);
        if (wave >= 5) addN(list, EnemyType.CHARIOT, wave / 6);
        if (wave >= 6) addN(list, EnemyType.DARK_KNIGHT, 1 + wave / 6);

        // Mélange tout sauf le Boss (laissé en tête pour ouvrir la vague).
        Collections.shuffle(list.subList(bossWave ? 1 : 0, list.size()), new Random(wave * 2654435761L));
        return list;
    }

    private void addN(List<EnemyType> list, EnemyType type, int n) {
        for (int i = 0; i < n; i++) list.add(type);
    }

    /** PV d'un ennemi scalés sur la vague (courbe à deux pentes, comme le solo). */
    private int scaledHp(EnemyType type, int wave) {
        double multiplier = wave <= HP_CURVE_BREAK_WAVE
                ? Math.pow(HP_GROWTH_RATE, wave - 1)
                : Math.pow(HP_GROWTH_RATE, HP_CURVE_BREAK_WAVE - 1)
                        * Math.pow(HP_LATE_GROWTH_RATE, wave - HP_CURVE_BREAK_WAVE);
        return (int) Math.round(type.baseHp * multiplier);
    }

    private int nearestPathIndex(LiveEnemy e, List<Position> path) {
        int bestIndex = 0;
        double bestDistSq = Double.MAX_VALUE;
        for (int i = 0; i < path.size(); i++) {
            Position p = path.get(i);
            double distSq = (p.x() - e.x) * (p.x() - e.x) + (p.y() - e.y) * (p.y() - e.y);
            if (distSq < bestDistSq) { bestDistSq = distSq; bestIndex = i; }
        }
        return bestIndex;
    }
}
