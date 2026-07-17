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
     * Décalages perpendiculaires au chemin (en cases), répartis cycliquement
     * entre ennemis successifs pour qu'ils avancent sur plusieurs files de
     * front dans un couloir élargi, plutôt qu'en une seule file strictement
     * alignée. Appliqué pendant le déplacement par WaveSimulationService.
     */
    private static final double[] LANE_OFFSETS = { 0.0, -0.8, 0.8 };

    /**
     * Décalage XOR appliqué au seed de partie pour dériver le seuil du
     * Chevalier noir sans corréler son tirage à celui du seuil Orc/Troll/Sapeur
     * (un même seed, sur un même appel Random.nextInt, donnerait sinon
     * exactement la même valeur jitterée pour les deux seuils).
     */
    private static final long DARK_KNIGHT_SALT = 0xD1B54A32D192ED03L;

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
        List<Enemy> enemies = generateEnemies(waveNumber, spawnPosition, gameSeed);
        return new Wave(waveNumber, enemies);
    }

    private List<Enemy> generateEnemies(int waveNumber, Position spawn, long gameSeed) {
        Random waveRng = new Random(mixSeed(gameSeed, waveNumber));

        int eliteThreshold = eliteThreshold(gameSeed);
        int darkKnightThreshold = darkKnightThreshold(gameSeed);

        List<EnemyType> order = new ArrayList<>();

        // Goblin : toujours présent (chair à canon), léger jitter +-1 autour du
        // compte de base — pas de variation au-delà, ce type n'est pas l'enjeu
        // de la randomisation (voir le mix Orc/Troll/Sapeur ci-dessous).
        int goblinBase = 3 + waveNumber * 2;
        int goblinCount = Math.max(1, goblinBase + (waveRng.nextInt(3) - 1));
        new EnemyBurst(EnemyType.GOBLIN, goblinCount).resolve(waveRng, order);

        if (waveNumber >= eliteThreshold) {
            int budget = eliteBudget(waveNumber, eliteThreshold);
            ThreatBudgetMix eliteMix = new ThreatBudgetMix(budget, List.of(
                    // Poids de tirage : l'Orc (le moins coûteux/dangereux) sort le
                    // plus souvent, le Sapeur modérément, le Troll (le plus
                    // dangereux) le plus rarement.
                    new ThreatBudgetMix.Entry(EnemyType.ORC, EnemyType.ORC.goldReward, 5, 1),
                    new ThreatBudgetMix.Entry(EnemyType.SAPEUR, EnemyType.SAPEUR.goldReward, 3, 1),
                    new ThreatBudgetMix.Entry(EnemyType.TROLL, EnemyType.TROLL.goldReward, 2, 1)
            ));
            eliteMix.resolve(waveRng, order);
        }

        // Chevalier noir : cadence fixe conservée (tous les 5 vagues une fois
        // débloqué) — le "mini-boss" actuel de la vague. Absent des vagues à
        // Boss (voir ci-dessous) pour laisser le Boss être la seule menace
        // spéciale mise en avant sur ces vagues-là, plutôt que d'empiler les deux.
        boolean bossWave = waveNumber % BOSS_MILESTONE_INTERVAL == 0;
        if (waveNumber >= darkKnightThreshold && waveNumber % 5 == 0 && !bossWave) {
            new EnemyBurst(EnemyType.DARK_KNIGHT, darkKnightCount(waveNumber, darkKnightThreshold)).resolve(waveRng, order);
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

        return toEnemies(order, waveNumber, spawn, waveRng);
    }

    /** Convertit la liste ordonnée de types en ennemis, avec cadence d'apparition jitterée. */
    private List<Enemy> toEnemies(List<EnemyType> order, int waveNumber, Position spawn, Random waveRng) {
        List<Enemy> enemies = new ArrayList<>();
        int spawnIndex = 0;
        int delay = 0;

        for (EnemyType type : order) {
            int hp = scaledHp(type, waveNumber);
            // Un Boss avance toujours PILE au centre du couloir (pas de file
            // décalée) : sa zone de menace (pulse aoeRadius/auraRadius, voir
            // EnemyType) reste symétrique et prévisible pour le joueur — et son
            // rayon d'AoE est calibré depuis le centre du chemin (voir le
            // commentaire de BOSS_WARLORD), un décalage de +/-0.8 fausserait
            // cette géométrie d'un côté comme de l'autre.
            double laneOffset = type.isBoss ? 0.0 : LANE_OFFSETS[spawnIndex % LANE_OFFSETS.length];
            enemies.add(new Enemy(type, spawn.x(), spawn.y(), delay, hp, laneOffset));

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
        double multiplier = Math.pow(HP_GROWTH_RATE, waveNumber - 1);
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
    static int eliteThreshold(long gameSeed) {
        return 3 + (new Random(gameSeed).nextInt(3) - 1);
    }

    /** Même principe que {@link #eliteThreshold}, pour le Chevalier noir (9, 10 ou 11). */
    static int darkKnightThreshold(long gameSeed) {
        return 10 + (new Random(gameSeed ^ DARK_KNIGHT_SALT).nextInt(3) - 1);
    }

    /**
     * Budget de menace alloué au mix Orc/Troll/Sapeur pour une vague donnée :
     * calculé à partir des anciens comptes fixes par type (multipliés par leur
     * goldReward, déjà calibré au fil des passes d'équilibrage précédentes)
     * afin que le niveau de difficulté global reste cohérent avec les
     * réglages existants — seule la répartition entre types devient aléatoire.
     * Package-private : exposé pour les tests.
     */
    static int eliteBudget(int waveNumber, int eliteThreshold) {
        int orcCountRef = waveNumber - (eliteThreshold - 1);
        int trollCountRef = 1 + (waveNumber - eliteThreshold) / 4;
        int sapeurCountRef = 1 + (waveNumber - eliteThreshold);
        return orcCountRef * EnemyType.ORC.goldReward
                + trollCountRef * EnemyType.TROLL.goldReward
                + sapeurCountRef * EnemyType.SAPEUR.goldReward;
    }

    /** Compte de Chevaliers noirs pour une vague donnée, une fois le seuil atteint. Package-private : exposé pour les tests. */
    static int darkKnightCount(int waveNumber, int darkKnightThreshold) {
        return 1 + (waveNumber - darkKnightThreshold) / 15;
    }

    private long mixSeed(long gameSeed, int waveNumber) {
        return gameSeed ^ (waveNumber * WAVE_MIX_CONSTANT);
    }
}
