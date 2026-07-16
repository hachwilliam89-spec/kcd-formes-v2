package com.kcdformes.domain.model;

import java.util.UUID;

public class Enemy {

    private final UUID id;
    private final EnemyType type;
    private final int maxHp;
    private int currentHp;
    private double x;
    private double y;
    private boolean alive;
    /** Nombre de ticks à attendre avant que cet ennemi n'apparaisse et ne commence à avancer. */
    private final int spawnDelayTicks;
    /**
     * Décalage perpendiculaire au chemin (en cases), appliqué pendant le déplacement
     * (voir WaveSimulationService) pour que les ennemis ne soient plus tous alignés
     * en file unique sur un couloir élargi — voir WaveFactory pour l'attribution.
     */
    private final double laneOffset;

    public Enemy(EnemyType type, double startX, double startY) {
        this(type, startX, startY, 0);
    }

    public Enemy(EnemyType type, double startX, double startY, int spawnDelayTicks) {
        this(type, startX, startY, spawnDelayTicks, type.baseHp);
    }

    /**
     * @param hp PV de cet ennemi, potentiellement mis à l'échelle par le numéro de vague
     *           (voir WaveFactory) — distinct de EnemyType.baseHp qui reste la valeur de
     *           référence à la vague 1.
     */
    public Enemy(EnemyType type, double startX, double startY, int spawnDelayTicks, int hp) {
        this(type, startX, startY, spawnDelayTicks, hp, 0.0);
    }

    public Enemy(EnemyType type, double startX, double startY, int spawnDelayTicks, int hp, double laneOffset) {
        this.id = UUID.randomUUID();
        this.type = type;
        this.maxHp = hp;
        this.currentHp = hp;
        this.x = startX;
        this.y = startY;
        this.alive = true;
        this.spawnDelayTicks = spawnDelayTicks;
        this.laneOffset = laneOffset;
    }

    public void takeDamage(int damage) {
        this.currentHp = Math.max(0, this.currentHp - damage);
        if (this.currentHp == 0) this.alive = false;
    }

    /** Soigne cet ennemi, plafonné à ses PV max (utilisé par l'aura du Boss, voir WaveSimulationService). */
    public void heal(int amount) {
        this.currentHp = Math.min(maxHp, this.currentHp + amount);
    }

    public void moveTo(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public boolean isAlive() { return alive; }
    public boolean isDead() { return !alive; }
    public int getGoldReward() { return type.goldReward; }
    public int getSpawnDelayTicks() { return spawnDelayTicks; }

    public UUID getId() { return id; }
    public EnemyType getType() { return type; }
    public int getMaxHp() { return maxHp; }
    public int getCurrentHp() { return currentHp; }
    public double getX() { return x; }
    public double getY() { return y; }
    public double getLaneOffset() { return laneOffset; }
}
