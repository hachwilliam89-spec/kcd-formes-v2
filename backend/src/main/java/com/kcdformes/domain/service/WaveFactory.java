package com.kcdformes.domain.service;

import com.kcdformes.domain.model.*;

import java.util.ArrayList;
import java.util.List;

/**
 * Génère les vagues d'ennemis selon le numéro de vague.
 * La difficulté augmente progressivement.
 */
public class WaveFactory {

    /** Écart (en ticks) entre l'apparition de deux ennemis consécutifs d'une même vague. */
    private static final int SPAWN_INTERVAL_TICKS = 4;

    /**
     * Montée en puissance des PV par vague : composée (multiplicative), pas additive.
     * Avec un facteur additif (multiplier = 1 + (wave-1)*0.5), l'avance en or et en
     * tours du joueur finit toujours par dépasser la croissance des PV sur la durée
     * (vagues infinies) — la difficulté plafonne et le jeu devient trivial passé un
     * certain nombre de vagues, quel que soit le réglage du coefficient. Un facteur
     * composé (multiplier = HP_GROWTH_RATE^(wave-1)) crée un vrai mur de difficulté
     * à long terme, conforme aux pratiques observées dans les TD à vagues infinies
     * (Bloons TD, Kingdom Rush...). 1.16 reste proche de l'ancien +50 %/vague sur les
     * premières vagues (~équivalent jusqu'à la vague 4-5) mais diverge fortement
     * ensuite — valeur de départ à retester en jeu.
     */
    private static final double HP_GROWTH_RATE = 1.16;

    /**
     * Décalages perpendiculaires au chemin (en cases), répartis cycliquement entre
     * ennemis successifs pour qu'ils avancent sur plusieurs files de front dans un
     * couloir élargi, plutôt qu'en une seule file strictement alignée. Appliqué
     * pendant le déplacement par WaveSimulationService.
     */
    private static final double[] LANE_OFFSETS = { 0.0, -0.8, 0.8 };

    public Wave createWave(int waveNumber, Position spawnPosition) {
        List<Enemy> enemies = generateEnemies(waveNumber, spawnPosition);
        return new Wave(waveNumber, enemies);
    }

    private List<Enemy> generateEnemies(int waveNumber, Position spawn) {
        List<Enemy> enemies = new ArrayList<>();
        int spawnIndex = 0;

        int goblinCount = 3 + waveNumber * 2;
        for (int i = 0; i < goblinCount; i++) {
            enemies.add(spawnEnemy(EnemyType.GOBLIN, spawn, waveNumber, spawnIndex++));
        }

        if (waveNumber >= 3) {
            int orcCount = waveNumber - 2;
            for (int i = 0; i < orcCount; i++) {
                enemies.add(spawnEnemy(EnemyType.ORC, spawn, waveNumber, spawnIndex++));
            }
        }

        // Auparavant fixé à 1 occurrence indéfiniment (seuls Goblin/Orc montaient en
        // nombre) : au-delà de la vague 6, le nombre de Trolls n'augmentait plus jamais,
        // ce qui plafonnait la difficulté qu'ils apportent. +1 Troll toutes les 4 vagues.
        if (waveNumber >= 6) {
            int trollCount = 1 + (waveNumber - 6) / 4;
            for (int i = 0; i < trollCount; i++) {
                enemies.add(spawnEnemy(EnemyType.TROLL, spawn, waveNumber, spawnIndex++));
            }
        }

        // Idem pour le Chevalier noir (1 occurrence fixe toutes les 5 vagues) : +1
        // exemplaire supplémentaire toutes les 15 vagues passé la vague 10, plus lent
        // que le Troll car c'est l'ennemi le plus coûteux à tuer.
        if (waveNumber >= 10 && waveNumber % 5 == 0) {
            int darkKnightCount = 1 + (waveNumber - 10) / 15;
            for (int i = 0; i < darkKnightCount; i++) {
                enemies.add(spawnEnemy(EnemyType.DARK_KNIGHT, spawn, waveNumber, spawnIndex++));
            }
        }

        return enemies;
    }

    private Enemy spawnEnemy(EnemyType type, Position spawn, int waveNumber, int spawnIndex) {
        int hp = scaledHp(type, waveNumber);
        double laneOffset = LANE_OFFSETS[spawnIndex % LANE_OFFSETS.length];
        return new Enemy(type, spawn.x(), spawn.y(), spawnIndex * SPAWN_INTERVAL_TICKS, hp, laneOffset);
    }

    private int scaledHp(EnemyType type, int waveNumber) {
        double multiplier = Math.pow(HP_GROWTH_RATE, waveNumber - 1);
        return (int) Math.round(type.baseHp * multiplier);
    }
}
