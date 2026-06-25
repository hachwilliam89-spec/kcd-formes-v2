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
     * Montée en puissance des PV par vague (+15 % par vague par rapport à la vague 1).
     * Sans ce facteur, seul le nombre d'ennemis augmente : des tours suffisamment
     * placées dès les premières vagues tuent alors tout indéfiniment, quelle que
     * soit la vague atteinte (plus aucun ennemi ne passe jamais).
     */
    private static final double HP_SCALING_PER_WAVE = 0.15;

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

        if (waveNumber >= 6) {
            enemies.add(spawnEnemy(EnemyType.TROLL, spawn, waveNumber, spawnIndex++));
        }

        if (waveNumber >= 10 && waveNumber % 5 == 0) {
            enemies.add(spawnEnemy(EnemyType.DARK_KNIGHT, spawn, waveNumber, spawnIndex++));
        }

        return enemies;
    }

    private Enemy spawnEnemy(EnemyType type, Position spawn, int waveNumber, int spawnIndex) {
        int hp = scaledHp(type, waveNumber);
        return new Enemy(type, spawn.x(), spawn.y(), spawnIndex * SPAWN_INTERVAL_TICKS, hp);
    }

    private int scaledHp(EnemyType type, int waveNumber) {
        double multiplier = 1 + (waveNumber - 1) * HP_SCALING_PER_WAVE;
        return (int) Math.round(type.baseHp * multiplier);
    }
}
