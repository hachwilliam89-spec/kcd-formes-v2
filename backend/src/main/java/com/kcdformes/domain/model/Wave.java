package com.kcdformes.domain.model;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class Wave {

    private final UUID id;
    private final int number;
    private final List<Enemy> enemies;
    private WaveStatus status;
    private int goldEarned;

    public Wave(int number, List<Enemy> enemies) {
        this.id = UUID.randomUUID();
        this.number = number;
        this.enemies = new ArrayList<>(enemies);
        this.status = WaveStatus.PENDING;
        this.goldEarned = 0;
    }

    public void start() {
        this.status = WaveStatus.IN_PROGRESS;
    }

    public void addGold(int amount) {
        this.goldEarned += amount;
    }

    public void complete() {
        this.status = allEnemiesDead() ? WaveStatus.VICTORY : WaveStatus.DEFEAT;
    }

    public boolean allEnemiesDead() {
        return enemies.stream().allMatch(Enemy::isDead);
    }

    public List<Enemy> getAliveEnemies() {
        return enemies.stream().filter(Enemy::isAlive).toList();
    }

    public UUID getId() { return id; }
    public int getNumber() { return number; }
    public List<Enemy> getEnemies() { return List.copyOf(enemies); }
    public WaveStatus getStatus() { return status; }
    public int getGoldEarned() { return goldEarned; }

    public enum WaveStatus {
        PENDING, IN_PROGRESS, VICTORY, DEFEAT
    }
}
