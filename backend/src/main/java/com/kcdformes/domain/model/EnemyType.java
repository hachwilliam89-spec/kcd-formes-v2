package com.kcdformes.domain.model;

public enum EnemyType {
    // PV de base +25 % (passe d'équilibrage) : ce socle se cumule avec le scaling
    // par vague de WaveFactory, qui ne touche que la progression, pas le départ.
    //
    // goldReward réduit de ~45-50 % (passe d'équilibrage économique) : combiné au
    // nombre d'ennemis qui croît linéairement par vague (voir WaveFactory), les
    // anciennes valeurs faisaient grimper le revenu du joueur plus vite que la
    // difficulté, supprimant toute rareté de l'or en milieu/fin de partie.
    GOBLIN(38, 0.3, 6, 5, false, 0),
    ORC(100, 0.16, 14, 10, false, 0),
    TROLL(250, 0.1, 32, 20, false, 0),
    DARK_KNIGHT(188, 0.2, 42, 15, false, 0),
    /**
     * Nouvel ennemi (à partir de la vague 3, voir WaveFactory) : au lieu de
     * suivre le chemin jusqu'au château, dévie pour foncer sur la tour la plus
     * proche (sans limite de portée) et la détruit à coups de dégâts de siège
     * (voir WaveSimulationService.handleSapperTick) — la tour est perdue
     * définitivement, sa case redevient constructible. S'il survit à sa cible,
     * il reprend ensuite sa route vers le château sans plus jamais dévier.
     */
    // PV +20 % (180, au lieu de 150) : le rend plus difficile à abattre en route
    // vers sa tour cible, pour augmenter la pression qu'il met sur le joueur.
    SAPEUR(180, 0.12, 18, 8, true, 12);

    public final int baseHp;
    public final double speed;
    public final int goldReward;
    /** Dégâts infligés au château lorsque cet ennemi atteint la fin du chemin. */
    public final int castleDamage;
    /** Si vrai, dévie du chemin pour cibler et détruire la tour la plus proche. */
    public final boolean attacksTowers;
    /** Dégâts de siège infligés à la tour ciblée, par tick, une fois à portée de mêlée. */
    public final int siegeDamage;

    EnemyType(int baseHp, double speed, int goldReward, int castleDamage,
              boolean attacksTowers, int siegeDamage) {
        this.baseHp = baseHp;
        this.speed = speed;
        this.goldReward = goldReward;
        this.castleDamage = castleDamage;
        this.attacksTowers = attacksTowers;
        this.siegeDamage = siegeDamage;
    }
}
