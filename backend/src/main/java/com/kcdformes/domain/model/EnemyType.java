package com.kcdformes.domain.model;

public enum EnemyType {
    GOBLIN(30, 1.5, 10),
    ORC(80, 0.8, 25),
    TROLL(200, 0.5, 60),
    DARK_KNIGHT(150, 1.0, 80);

    public final int baseHp;
    public final double speed;
    public final int goldReward;

    EnemyType(int baseHp, double speed, int goldReward) {
        this.baseHp = baseHp;
        this.speed = speed;
        this.goldReward = goldReward;
    }
}
