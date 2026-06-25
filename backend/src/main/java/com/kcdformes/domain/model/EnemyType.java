package com.kcdformes.domain.model;

public enum EnemyType {
    GOBLIN(30, 0.3, 10, 5),
    ORC(80, 0.16, 25, 10),
    TROLL(200, 0.1, 60, 20),
    DARK_KNIGHT(150, 0.2, 80, 15);

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
