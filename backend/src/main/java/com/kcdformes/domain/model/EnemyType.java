package com.kcdformes.domain.model;

public enum EnemyType {
    GOBLIN(30, 1.5, 10, 5),
    ORC(80, 0.8, 25, 10),
    TROLL(200, 0.5, 60, 20),
    DARK_KNIGHT(150, 1.0, 80, 15);

    public final int baseHp;
    public final double speed;
    public final int goldReward;
    /** Dégâts infligés au château lorsque cet ennemi atteint la fin du chemin. */
    public final int castleDamage;

    EnemyType(int baseHp, double speed, int goldReward, int castleDamage) {
        this.baseHp = baseHp;
        this.speed = speed;
        this.goldReward = goldReward;
        this.castleDamage = castleDamage;
    }
}
