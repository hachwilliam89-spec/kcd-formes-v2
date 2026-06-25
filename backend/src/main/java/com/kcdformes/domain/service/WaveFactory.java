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

    public Wave createWave(int waveNumber, Position spawnPosition) {
        List<Enemy> enemies = generateEnemies(waveNumber, spawnPosition);
        return new Wave(waveNumber, enemies);
    }

    private List<Enemy> generateEnemies(int waveNumber, Position spawn) {
        List<Enemy> enemies = new ArrayList<>();
        int spawnIndex = 0;

        int goblinCount = 3 + waveNumber * 2;
        for (int i = 0; i < goblinCount; i++) {
            enemies.add(new Enemy(EnemyType.GOBLIN, spawn.x(), spawn.y(), spawnIndex++ * SPAWN_INTERVAL_TICKS));
        }

        if (waveNumber >= 3) {
            int orcCount = waveNumber - 2;
            for (int i = 0; i < orcCount; i++) {
                enemies.add(new Enemy(EnemyType.ORC, spawn.x(), spawn.y(), spawnIndex++ * SPAWN_INTERVAL_TICKS));
            }
        }

        if (waveNumber >= 6) {
            enemies.add(new Enemy(EnemyType.TROLL, spawn.x(), spawn.y(), spawnIndex++ * SPAWN_INTERVAL_TICKS));
        }

        if (waveNumber >= 10 && waveNumber % 5 == 0) {
            enemies.add(new Enemy(EnemyType.DARK_KNIGHT, spawn.x(), spawn.y(), spawnIndex++ * SPAWN_INTERVAL_TICKS));
        }

        return enemies;
    }
}
