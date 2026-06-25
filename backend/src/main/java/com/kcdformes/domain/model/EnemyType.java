package com.kcdformes.domain.model;

public enum EnemyType {
    // PV de base +25 % (passe d'équilibrage) : ce socle se cumule avec le scaling
    // par vague de WaveFactory, qui ne touche que la progression, pas le départ.
    GOBLIN(38, 0.3, 10, 5),
    ORC(100, 0.16, 25, 10),
    TROLL(250, 0.1, 60, 20),
    DARK_KNIGHT(188, 0.2, 80, 15);

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
