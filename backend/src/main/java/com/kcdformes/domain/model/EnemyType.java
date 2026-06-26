package com.kcdformes.domain.model;

public enum EnemyType {
    // PV de base +25 % (passe d'équilibrage) : ce socle se cumule avec le scaling
    // par vague de WaveFactory, qui ne touche que la progression, pas le départ.
    //
    // goldReward réduit de ~45-50 % (passe d'équilibrage économique) : combiné au
    // nombre d'ennemis qui croît linéairement par vague (voir WaveFactory), les
    // anciennes valeurs faisaient grimper le revenu du joueur plus vite que la
    // difficulté, supprimant toute rareté de l'or en milieu/fin de partie.
    GOBLIN(38, 0.3, 6, 5),
    ORC(100, 0.16, 14, 10),
    TROLL(250, 0.1, 32, 20),
    DARK_KNIGHT(188, 0.2, 42, 15);

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
