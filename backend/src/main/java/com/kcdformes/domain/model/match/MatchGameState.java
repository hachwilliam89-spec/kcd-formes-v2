package com.kcdformes.domain.model.match;

import com.kcdformes.domain.model.Position;

import java.util.ArrayList;
import java.util.List;

/**
 * État de jeu LIVE d'un match en cours (Jalon 3a : ennemis qui avancent sur le
 * chemin serpentin, PV du château). Vit en mémoire, avancé par le MatchEngine et
 * diffusé en snapshots. Sera enrichi (tours, or, combat) au Jalon 3b.
 * Champs publics : état interne serveur, manipulé par le moteur.
 */
public class MatchGameState {

    public final List<Position> path;                 // cases du chemin, spawn -> château
    public final List<LiveEnemy> enemies = new ArrayList<>();
    public long tick = 0;
    public int wave = 1;
    public int castleHp;
    public final int castleMaxHp;

    // Cadence de spawn de la vague courante.
    public int ticksToNextSpawn = 0;
    public int spawnedThisWave = 0;
    public int waveSize;

    public MatchGameState(List<Position> path, int castleMaxHp, int firstWaveSize) {
        this.path = path;
        this.castleMaxHp = castleMaxHp;
        this.castleHp = castleMaxHp;
        this.waveSize = firstWaveSize;
    }
}
