package com.kcdformes.domain.model;

import java.util.UUID;

public class Tower {

    private final UUID id;
    private final TowerType type;
    private final int x;
    private final int y;
    private int level;

    public Tower(TowerType type, int x, int y) {
        this.id = UUID.randomUUID();
        this.type = type;
        this.x = x;
        this.y = y;
        this.level = 1;
    }

    public Tower(UUID id, TowerType type, int x, int y, int level) {
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;
        this.level = level;
    }

    public int getDamage() {
        return (int) (type.baseDamage * (1 + (level - 1) * 0.5));
    }

    public double getRange() {
        return type.baseRange + (level - 1) * 0.3;
    }

    public boolean canTarget(Enemy enemy) {
        double dx = this.x - enemy.getX();
        double dy = this.y - enemy.getY();
        return Math.sqrt(dx * dx + dy * dy) <= getRange();
    }

    public void upgrade() {
        this.level++;
    }

    public UUID getId() { return id; }
    public TowerType getType() { return type; }
    public int getX() { return x; }
    public int getY() { return y; }
    public int getLevel() { return level; }
}
