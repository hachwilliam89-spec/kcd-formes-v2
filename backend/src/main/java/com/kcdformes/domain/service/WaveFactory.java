package com.kcdformes.domain.service;

import com.kcdformes.domain.model.*;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Génère les vagues d'ennemis selon le numéro de vague.
 * La difficulté augmente progressivement.
 *
 * Depuis l'introduction du seed de partie (voir GameEntity.seed), la
 * composition exacte d'une vague n'est plus 100 % déterministe par numéro de
 * vague seul : elle varie d'une partie à l'autre (seed différent), mais reste
 * reproductible au sein d'une même partie (même seed + même numéro de vague
 * => même résultat, voir {@link #mixSeed}). Le niveau de difficulté global
 * (le budget de menace, voir {@link #eliteBudget}) suit toujours une
 * progression cohérente avec les anciens réglages déterministes — seule la
 * répartition entre types d'ennemis, leur ordre d'apparition et les seuils de
 * déblocage des ennemis spéciaux sont randomisés à l'intérieur de ce cadre
 * (voir {@link WaveSegment} et son pattern Composite).
 */
public class WaveFactory {

    /** Intervalle de base (en ticks) entre l'apparition de deux ennemis consécutifs, avant jitter. */
    private static final int SPAWN_INTERVAL_TICKS = 4;

    /**
     * Montée en puissance des PV par vague : composée (multiplicative), pas
     * additive — un facteur additif plafonne la difficulté sur la durée
     * (vagues infinies), un facteur composé crée un vrai mur de difficulté à
     * long terme.
     */
    private static final double HP_GROWTH_RATE = 1.16;

    /**
     * COURBE À DEUX PENTES (décision d'équilibrage, mesurée au harnais — voir
     * GAME_DESIGN 2.2) : au-delà de HP_CURVE_BREAK_WAVE, la croissance des PV
     * passe de HP_GROWTH_RATE à HP_LATE_GROWTH_RATE. À 1.16/vague partout, les
     * PV ennemis étaient x8 à la v15 et x17 à la v20 face à une défense aux
     * moyens linéaires (dégâts +50 %/niveau, revenus ~linéaires) : mort médiane
     * v15 même avec 5000 d'or et des tours niveau 5 — le double-boss de la v20
     * était mathématiquement inaccessible, pour le bot comme pour un humain.
     * La pente douce rend les vagues profondes affaire de skill et d'économie,
     * sans toucher au early game (v1-12), déjà calibré et validé.
     */
    private static final int HP_CURVE_BREAK_WAVE = 12;
    private static final double HP_LATE_GROWTH_RATE = 1.08;

    /**
     * CALENDRIER D'APPARITION FIXE (décision de design) : une nouveauté par
     * vague en début de partie — Orc v2, Troll v3, Sapeur v4, Chariot v5,
     * Chevalier noir v6, premier Boss v10. Remplace les seuils jitterés par
     * seed : la progression pédagogique (le joueur découvre une menace à la
     * fois) prime sur la variation des premières vagues — l'aléa reste entier
     * sur la COMPOSITION au-delà des minimums garantis (voir eliteBudget et
     * ThreatBudgetMix). Package-private : exposé pour les tests.
     */
    static final int ORC_THRESHOLD = 2;
    static final int TROLL_THRESHOLD = 3;
    static final int SAPEUR_THRESHOLD = 4;
    static final int CHARIOT_THRESHOLD = 5;
    static final int DARK_KNIGHT_THRESHOLD = 6;
    /** Plafond de Chariots par vague (3 -> 4, retour de partie : trop rares pour peser). */
    private static final int CHARIOT_WAVE_CAP = 4;

    /**
     * Plafond de Sapeurs par vague : PROGRESSIF, pas plat. Un plafond figé à 5
     * (première version) tuait la tension en late game — une fois les 5 abattus,
     * plus rien ne menaçait les tours pendant 9 vagues sur 10, victoire quasi
     * assurée (retour de partie). La pente douce (+1 toutes les 4 vagues après
     * la cassure : v20 -> 7, v30 -> 9) maintient une pression de siège
     * croissante mais reconstructible — contre +1 PAR vague avant plafond, qui
     * rasait 9+ tours/vague dès la v15. Package-private : exposé pour les tests.
     */
    static int sapeurWaveCap(int waveNumber) {
        int base = 5;
        if (waveNumber <= HP_CURVE_BREAK_WAVE) {
            return base;
        }
        return base + (waveNumber - HP_CURVE_BREAK_WAVE) / 4;
    }

    /**
     * Vague "effective" pour toute croissance d'effectifs : suit le numéro réel
     * jusqu'à la cassure (v12), puis avance à demi-vitesse — même philosophie
     * deux-pentes que les PV (voir HP_CURVE_BREAK_WAVE), pour que le NOMBRE
     * d'ennemis ne suive pas une croissance pleine à l'infini.
     */
    static int effectiveThreatWave(int waveNumber) {
        return waveNumber <= HP_CURVE_BREAK_WAVE
                ? waveNumber
                : HP_CURVE_BREAK_WAVE + (waveNumber - HP_CURVE_BREAK_WAVE) / 2;
    }

    /**
     * MINIMUMS GARANTIS CROISSANTS (calendrier de design) : chaque type a un
     * effectif plancher qui grandit à son propre rythme — Sapeur +1 toutes les
     * 2 vagues (le plus rapide : c'est la pression de siège), Orc +1/3, Troll
     * +1/4, Chariot +1/5, Chevalier noir +1/6. Le budget aléatoire ajoute de la
     * variation PAR-DESSUS ces planchers (voir eliteBudget). Les plafonds
     * (sapeurWaveCap, CHARIOT_WAVE_CAP...) restent prioritaires sur les minimums.
     * Package-private : exposés pour les tests.
     */
    static int orcMin(int waveNumber) {
        return waveNumber < ORC_THRESHOLD ? 0
                : 1 + Math.max(0, effectiveThreatWave(waveNumber) - ORC_THRESHOLD) / 3;
    }

    static int trollMin(int waveNumber) {
        return waveNumber < TROLL_THRESHOLD ? 0
                : 1 + Math.max(0, effectiveThreatWave(waveNumber) - TROLL_THRESHOLD) / 4;
    }

    static int sapeurMin(int waveNumber) {
        if (waveNumber < SAPEUR_THRESHOLD) {
            return 0;
        }
        int growth = 1 + Math.max(0, effectiveThreatWave(waveNumber) - SAPEUR_THRESHOLD) / 2;
        return Math.min(growth, sapeurWaveCap(waveNumber));
    }

    static int chariotMin(int waveNumber) {
        if (waveNumber < CHARIOT_THRESHOLD) {
            return 0;
        }
        int growth = 1 + Math.max(0, effectiveThreatWave(waveNumber) - CHARIOT_THRESHOLD) / 5;
        return Math.min(growth, CHARIOT_WAVE_CAP);
    }

    static int darkKnightMin(int waveNumber) {
        return waveNumber < DARK_KNIGHT_THRESHOLD ? 0
                : 1 + Math.max(0, effectiveThreatWave(waveNumber) - DARK_KNIGHT_THRESHOLD) / 6;
    }

    /**
     * Décalages perpendiculaires au chemin (en cases), répartis cycliquement
     * entre ennemis successifs pour qu'ils avancent sur plusieurs files de
     * front dans un couloir élargi, plutôt qu'en une seule file strictement
     * alignée. Appliqué pendant le déplacement par WaveSimulationService.
     */
    private static final double[] LANE_OFFSETS = { 0.0, -0.8, 0.8 };

    /** Constante de mélange (façon SplitMix) pour dériver un seed par vague à partir du seed de partie. */
    private static final long WAVE_MIX_CONSTANT = 0x9E3779B97F4A7C15L;

    /**
     * Cadence d'apparition du premier Boss (EnemyType.BOSS_WARLORD) : toutes les
     * 10 vagues, accompagné de l'escorte d'ennemis classiques générée normalement
     * pour cette vague (goblins + mix Orc/Troll/Sapeur, voir generateEnemies) —
     * pas une vague dédiée au Boss seul.
     */
    private static final int BOSS_MILESTONE_INTERVAL = 10;

    /**
     * Surcharge de confort pour les usages ponctuels où la reproductibilité
     * inter-appels n'a pas d'importance (tests ad hoc, simulation hors partie
     * réelle) : tire un seed aléatoire à chaque appel. La partie réelle
     * (GameService) doit utiliser {@link #createWave(int, Position, long)}
     * avec le seed de la partie.
     */
    public Wave createWave(int waveNumber, Position spawnPosition) {
        return createWave(waveNumber, spawnPosition, ThreadLocalRandom.current().nextLong());
    }

    public Wave createWave(int waveNumber, Position spawnPosition, long gameSeed) {
        return createWave(waveNumber, List.of(spawnPosition), gameSeed);
    }

    /**
     * Vague pour une carte à plusieurs voies : les ennemis sont répartis
     * cycliquement (round-robin) entre les départs de voie fournis, chacun
     * démarrant au départ de SA voie. Une liste d'un seul départ = comportement
     * mono-voie historique (répartition en files décalées sur un couloir large).
     */
    public Wave createWave(int waveNumber, List<Position> laneStarts, long gameSeed) {
        List<Enemy> enemies = generateEnemies(waveNumber, laneStarts, gameSeed);
        return new Wave(waveNumber, enemies);
    }

    private List<Enemy> generateEnemies(int waveNumber, List<Position> laneStarts, long gameSeed) {
        Random waveRng = new Random(mixSeed(gameSeed, waveNumber));

        List<EnemyType> order = new ArrayList<>();

        // Goblin : toujours présent (chair à canon), léger jitter +-1 autour du
        // compte de base — pas de variation au-delà, ce type n'est pas l'enjeu
        // de la randomisation (voir le mix ci-dessous).
        int goblinBase = 3 + waveNumber * 2;
        int goblinCount = Math.max(1, goblinBase + (waveRng.nextInt(3) - 1));
        new EnemyBurst(EnemyType.GOBLIN, goblinCount).resolve(waveRng, order);

        // Mix unique piloté par le CALENDRIER (voir ORC_THRESHOLD et suivants) :
        // chaque type entre à sa vague avec son minimum garanti croissant
        // (voir orcMin...) ; le budget aléatoire distribue le surplus entre les
        // types débloqués (poids : Orc courant, Sapeur/Chariot modérés, Troll
        // rare, Chevalier noir exceptionnel), dans le respect des plafonds.
        boolean bossWave = waveNumber % BOSS_MILESTONE_INTERVAL == 0;
        if (waveNumber >= ORC_THRESHOLD) {
            List<ThreatBudgetMix.Entry> mixEntries = new ArrayList<>();
            mixEntries.add(new ThreatBudgetMix.Entry(EnemyType.ORC, EnemyType.ORC.goldReward,
                    5, orcMin(waveNumber)));
            if (waveNumber >= TROLL_THRESHOLD) {
                mixEntries.add(new ThreatBudgetMix.Entry(EnemyType.TROLL, EnemyType.TROLL.goldReward,
                        2, trollMin(waveNumber)));
            }
            if (waveNumber >= SAPEUR_THRESHOLD) {
                // Plafond progressif (voir sapeurWaveCap) : sans plafond, 7+
                // Sapeurs dès la v15 rasaient 9+ tours/vague — inreconstructible.
                mixEntries.add(new ThreatBudgetMix.Entry(EnemyType.SAPEUR, EnemyType.SAPEUR.goldReward,
                        3, sapeurMin(waveNumber), sapeurWaveCap(waveNumber)));
            }
            if (waveNumber >= CHARIOT_THRESHOLD) {
                mixEntries.add(new ThreatBudgetMix.Entry(EnemyType.CHARIOT, EnemyType.CHARIOT.goldReward,
                        3, chariotMin(waveNumber), CHARIOT_WAVE_CAP));
            }
            // Chevalier noir : unité régulière du mix depuis le calendrier fixe
            // (plus un burst tous les 5 vagues). Absent des vagues à Boss, pour
            // laisser le Boss être la seule menace spéciale mise en avant.
            if (waveNumber >= DARK_KNIGHT_THRESHOLD && !bossWave) {
                mixEntries.add(new ThreatBudgetMix.Entry(EnemyType.DARK_KNIGHT, EnemyType.DARK_KNIGHT.goldReward,
                        1, darkKnightMin(waveNumber)));
            }
            new ThreatBudgetMix(eliteBudget(waveNumber), mixEntries).resolve(waveRng, order);
        }

        // Mélange GLOBAL de l'ordre de spawn : les segments ci-dessus s'ajoutent
        // en blocs (tous les Goblins, puis le mix élite, puis le Chevalier noir),
        // donc la chair à canon ouvrait systématiquement la vague et mourait
        // avant d'avoir servi à quoi que ce soit — les élites arrivaient ensuite
        // face à des tours rechargées. Mélangés, les Goblins font écran AU MILIEU
        // des menaces réelles et absorbent des tirs utiles. Reproductible : même
        // seed => même mélange (waveRng). Le Boss reste hors du mélange, inséré
        // en tête juste après (il ouvre la vague, voir ci-dessous).
        Collections.shuffle(order, waveRng);

        // Premier Boss (EnemyType.BOSS_WARLORD) : toutes les BOSS_MILESTONE_INTERVAL
        // vagues, avec l'escorte classique déjà générée ci-dessus (goblins + mix
        // Orc/Troll/Sapeur). Le nombre de Boss augmente légèrement à chaque
        // récurrence (1 puis 2 à partir de la 3e apparition, etc.) ; ses PV
        // grimpent surtout via le scaling multiplicatif par vague (scaledHp),
        // déjà bien plus marqué après 10+ vagues que pour les autres ennemis.
        // Inséré en TÊTE de vague, pas en queue : il apparaît dès le premier
        // spawn (entrée théâtrale immédiate au lieu d'arriver après toute
        // l'escorte), et — lent comme il est — l'escorte spawnée derrière le
        // rattrape et traverse son aura de soin, au lieu de courir devant sans
        // jamais en profiter.
        if (bossWave) {
            int recurrence = waveNumber / BOSS_MILESTONE_INTERVAL;
            int bossCount = 1 + (recurrence - 1) / 2;
            List<EnemyType> bossOrder = new ArrayList<>();
            new EnemyBurst(EnemyType.BOSS_WARLORD, bossCount).resolve(waveRng, bossOrder);
            order.addAll(0, bossOrder);
        }

        return toEnemies(order, waveNumber, laneStarts, waveRng);
    }

    /** Convertit la liste ordonnée de types en ennemis, avec cadence d'apparition jitterée. */
    private List<Enemy> toEnemies(List<EnemyType> order, int waveNumber, List<Position> laneStarts, Random waveRng) {
        List<Enemy> enemies = new ArrayList<>();
        boolean multiLane = laneStarts.size() > 1;
        int spawnIndex = 0;
        int delay = 0;

        for (EnemyType type : order) {
            int hp = scaledHp(type, waveNumber);
            // Répartition round-robin entre voies sur une carte multi-voies ;
            // sinon tout le monde sur la voie 0 (comportement historique).
            int lane = multiLane ? spawnIndex % laneStarts.size() : 0;
            Position spawn = laneStarts.get(lane);
            // Files décalées perpendiculairement UNIQUEMENT sur une carte mono-voie
            // (couloir large). Sur des voies fines multiples, chaque ennemi tient
            // sa voie sans décalage. Un Boss avance toujours pile au centre : sa
            // zone de menace (pulse aoeRadius/auraRadius) est calibrée depuis l'axe.
            double laneOffset = (multiLane || type.isBoss) ? 0.0
                    : LANE_OFFSETS[spawnIndex % LANE_OFFSETS.length];
            enemies.add(new Enemy(type, spawn.x(), spawn.y(), delay, hp, laneOffset, lane));

            // Cadence jitterée (+-1 tick autour de l'intervalle de base) plutôt
            // qu'un intervalle strictement fixe : les ennemis ne sortent plus à
            // un rythme parfaitement métronomique d'une partie à l'autre.
            int interval = SPAWN_INTERVAL_TICKS + (waveRng.nextInt(3) - 1);
            delay += Math.max(1, interval);
            spawnIndex++;
        }

        return enemies;
    }

    private int scaledHp(EnemyType type, int waveNumber) {
        // Deux pentes avec continuité au point de cassure : la seconde repart
        // exactement du multiplicateur atteint à HP_CURVE_BREAK_WAVE (pas de
        // saut ni de chute de PV entre la v12 et la v13).
        double multiplier = waveNumber <= HP_CURVE_BREAK_WAVE
                ? Math.pow(HP_GROWTH_RATE, waveNumber - 1)
                : Math.pow(HP_GROWTH_RATE, HP_CURVE_BREAK_WAVE - 1)
                        * Math.pow(HP_LATE_GROWTH_RATE, waveNumber - HP_CURVE_BREAK_WAVE);
        return (int) Math.round(type.baseHp * multiplier);
    }

    /**
     * Seuil de déblocage d'Orc/Troll/Sapeur, avec un léger jitter par partie
     * (2, 3 ou 4 — jamais moins de 2, pour garantir que la vague 1 reste
     * toujours 100 % Goblin, quel que soit le seed) : décidé une seule fois
     * par partie à partir du seed, indépendamment du numéro de vague, pour
     * rester cohérent entre deux appels sur la même vague d'une même partie.
     * Package-private : exposé pour les tests (WaveFactoryTest) qui ont besoin
     * de connaître le seuil exact attendu pour un seed donné.
     */
    /**
     * Budget de menace de la vague : coût des MINIMUMS garantis de tous les
     * types débloqués (voir orcMin et suivants), majoré de BUDGET_MARGIN pour
     * financer la part aléatoire distribuée par ThreatBudgetMix par-dessus les
     * planchers. La croissance suit effectiveThreatWave (deux pentes), comme
     * les effectifs. Package-private : exposé pour les tests.
     */
    static int eliteBudget(int waveNumber) {
        int guaranteedCost = orcMin(waveNumber) * EnemyType.ORC.goldReward
                + trollMin(waveNumber) * EnemyType.TROLL.goldReward
                + sapeurMin(waveNumber) * EnemyType.SAPEUR.goldReward
                + chariotMin(waveNumber) * EnemyType.CHARIOT.goldReward
                + darkKnightMin(waveNumber) * EnemyType.DARK_KNIGHT.goldReward;
        return (int) Math.round(guaranteedCost * BUDGET_MARGIN);
    }

    /** Marge du budget au-delà des minimums garantis : la part d'aléa des vagues. */
    private static final double BUDGET_MARGIN = 1.25;

    private long mixSeed(long gameSeed, int waveNumber) {
        return gameSeed ^ (waveNumber * WAVE_MIX_CONSTANT);
    }
}
