package com.kcdformes.domain.model.match;

import com.kcdformes.domain.model.EnemyType;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Queue;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * État de jeu LIVE d'un match en cours (Jalon 3a : ennemis qui avancent sur le
 * chemin serpentin, PV du château). Vit en mémoire, avancé par le MatchEngine et
 * diffusé en snapshots. Sera enrichi (tours, or, combat) au Jalon 3b.
 * Champs publics : état interne serveur, manipulé par le moteur.
 */
public class MatchGameState {

    // Voies du chemin (carte multi-voies) : une liste de cases par voie, toutes
    // terminant sur le château. Une carte mono-voie n'a qu'un élément.
    public final List<List<Position>> lanePaths;
    public final List<Position> path;                 // = lanePaths.get(0) : voie de réf. (château partagé)
    public int spawnLaneCursor = 0;                    // répartition round-robin des spawns entre voies
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
    // File des ennemis à faire apparaître pour la vague courante (composition
    // construite par MatchEngine.buildWave — gobelins + élites selon la vague).
    public final java.util.Deque<EnemyType> spawnQueue = new java.util.ArrayDeque<>();

    // Combat : cooldown de tir par tour (en « ticks solo »), et tirs du tick
    // courant pour le rendu ({fromX, fromY, toX, toY}), remis à zéro à chaque step.
    public final Map<UUID, Double> towerCooldowns = new HashMap<>();
    public final List<double[]> shots = new ArrayList<>();

    // État de combat persistant entre ticks (porté du solo WaveSimulationService,
    // pour que les particularités des unités soient identiques au solo) :
    // - siegeTargets : tour visée par chaque Sapeur une fois dévié du chemin.
    // - bossCooldowns : compte à rebours avant la prochaine pulsation d'un Boss.
    // - towerStuns : tours étourdies par un pulse (ticks restants), ne tirent plus.
    public final Map<UUID, UUID> siegeTargets = new HashMap<>();
    public final Map<UUID, Integer> bossCooldowns = new HashMap<>();
    public final Map<UUID, Integer> towerStuns = new HashMap<>();
    public int castleCooldown = 0; // défense du château (archers des remparts)

    // ── Versus ────────────────────────────────────────────────────────────
    // Vaincu quand le château tombe (le board n'est plus avancé). Score = ennemis
    // tués (départage si les deux tombent au même tick).
    public boolean defeated = false;
    public int enemiesKilled = 0;
    // Revenu passif (versus rush) : crédité à chaque fin de vague. Augmente quand
    // le joueur envoie des ennemis (voir SendCatalog) — cœur de la boucle rush.
    public int income = 0;
    // Bonus au nombre de kills (mêmes bonus que le solo) : tous les KILLS_PER_BONUS
    // ennemis tués, un bonus est offert (pendingBonuses) — choix NON bloquant en
    // temps réel (voir MatchService.chooseBonus).
    public int killsSinceBonus = 0;
    public int pendingBonuses = 0;
    // File des ennemis ENVOYÉS par l'adversaire (rush, Jalon V2) : injectés au
    // spawn en plus de la vague de base. Thread-safe : rempli depuis l'action
    // d'envoi, vidé par le moteur dans le thread du ticker.
    public final Queue<EnemyType> incomingSends = new ConcurrentLinkedQueue<>();

    public MatchGameState(List<List<Position>> lanePaths, GameMap map, int castleMaxHp, int startingGold, int firstWaveSize) {
        this.lanePaths = lanePaths;
        this.path = lanePaths.get(0);
        this.map = map;
        this.castleMaxHp = castleMaxHp;
        this.castleHp = castleMaxHp;
        this.gold = startingGold;
        this.waveSize = firstWaveSize;
    }
}
