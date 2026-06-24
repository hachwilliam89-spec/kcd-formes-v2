package com.kcdformes.domain.model;

import java.util.UUID;

public class Castle {

    private final UUID id;
    private final UUID playerId;
    private String name;
    private int hp;
    private final int maxHp;
    private int level;

    public Castle(UUID playerId, String name) {
        this.id = UUID.randomUUID();
        this.playerId = playerId;
        this.name = name;
        this.hp = 100;
        this.maxHp = 100;
        this.level = 1;
    }

    public Castle(UUID id, UUID playerId, String name, int hp, int maxHp, int level) {
        this.id = id;
        this.playerId = playerId;
        this.name = name;
        this.hp = hp;
        this.maxHp = maxHp;
        this.level = level;
    }

    public void takeDamage(int damage) {
        this.hp = Math.max(0, this.hp - damage);
    }

    public boolean isDestroyed() {
        return this.hp <= 0;
    }

    public double getHpPercentage() {
        return (double) hp / maxHp * 100;
    }

    public UUID getId() { return id; }
    public UUID getPlayerId() { return playerId; }
    public String getName() { return name; }
    public int getHp() { return hp; }
    public int getMaxHp() { return maxHp; }
    public int getLevel() { return level; }
}
