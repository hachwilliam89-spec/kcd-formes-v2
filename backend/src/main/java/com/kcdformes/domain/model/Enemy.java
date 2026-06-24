package com.kcdformes.domain.model;

import java.util.UUID;

public class Enemy {

    private final UUID id;
    private final EnemyType type;
    private int currentHp;
    private double x;
    private double y;
    private boolean alive;

    public Enemy(EnemyType type, double startX, double startY) {
        this.id = UUID.randomUUID();
        this.type = type;
        this.currentHp = type.baseHp;
        this.x = startX;
        this.y = startY;
        this.alive = true;
    }

    public void takeDamage(int damage) {
        this.currentHp = Math.max(0, this.currentHp - damage);
        if (this.currentHp == 0) this.alive = false;
    }

    public void moveTo(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public boolean isAlive() { return alive; }
    public boolean isDead() { return !alive; }
    public int getGoldReward() { return type.goldReward; }

    public UUID getId() { return id; }
    public EnemyType getType() { return type; }
    public int getCurrentHp() { return currentHp; }
    public double getX() { return x; }
    public double getY() { return y; }
}
