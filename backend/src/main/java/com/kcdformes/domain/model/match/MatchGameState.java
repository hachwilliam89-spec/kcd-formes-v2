package com.kcdformes.domain.model.match;

import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * État de jeu LIVE d'un match en cours (Jalon 3a : ennemis qui avancent sur le
 * chemin serpentin, PV du château). Vit en mémoire, avancé par le MatchEngine et
 * diffusé en snapshots. Sera enrichi (tours, or, combat) au Jalon 3b.
 * Champs publics : état interne serveur, manipulé par le moteur.
 */
public class MatchGameState {

    public final List<Position> path;                 // cases du chemin, spawn -> château
    public final GameMap map;                         // porte les tours posées (coop : or partagé)
    public final List<LiveEnemy> enemies = new ArrayList<>();
    public int gold;                                  // or PARTAGÉ entre les deux joueurs (coop)
    public long tick = 0;
    public int wave = 1;
    public int castleHp;
    public final int castleMaxHp;

    // Cadence de spawn de la vague courante.
    public int ticksToNextSpawn = 0;
    public int spawnedThisWave = 0;
    public int waveSize;

    // Combat : cooldown de tir par tour (en « ticks solo »), et tirs du tick
    // courant pour le rendu ({fromX, fromY, toX, toY}), remis à zéro à chaque step.
    public final Map<UUID, Double> towerCooldowns = new HashMap<>();
    public final List<double[]> shots = new ArrayList<>();

    public MatchGameState(List<Position> path, GameMap map, int castleMaxHp, int startingGold, int firstWaveSize) {
        this.path = path;
        this.map = map;
        this.castleMaxHp = castleMaxHp;
        this.castleHp = castleMaxHp;
        this.gold = startingGold;
        this.waveSize = firstWaveSize;
    }
}
