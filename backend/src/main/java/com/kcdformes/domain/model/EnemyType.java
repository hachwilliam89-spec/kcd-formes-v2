package com.kcdformes.domain.model;

public enum EnemyType {
    // PV de base +25 % (passe d'équilibrage) : ce socle se cumule avec le scaling
    // par vague de WaveFactory, qui ne touche que la progression, pas le départ.
    //
    // goldReward réduit de ~45-50 % (passe d'équilibrage économique) : combiné au
    // nombre d'ennemis qui croît linéairement par vague (voir WaveFactory), les
    // anciennes valeurs faisaient grimper le revenu du joueur plus vite que la
    // difficulté, supprimant toute rareté de l'or en milieu/fin de partie.
    //
    // goldReward remonté de +20 % ensuite (retour d'expérience : mort en vague 7,
    // budget de construction/upgrade trop serré pour viser la vague 10) :
    // GOBLIN 6->7, ORC 14->17, TROLL 32->38, DARK_KNIGHT 42->50, SAPEUR 18->22.
    // Objectif : rendre la vague 10 atteignable sans la garantir (pas un simple
    // détricotage du nerf précédent, qui visait un problème différent — la
    // croissance du nombre d'ennemis par vague, toujours valable).
    //
    // goldReward remonté de +25 % supplémentaires :
    // GOBLIN 7->9, ORC 17->21, TROLL 38->48, DARK_KNIGHT 50->63, SAPEUR 22->28.
    GOBLIN(38, 0.3, 9, 5, false, 0),
    ORC(100, 0.16, 21, 10, false, 0),
    TROLL(250, 0.1, 48, 20, false, 0),
    DARK_KNIGHT(188, 0.2, 63, 15, false, 0),
    /**
     * Nouvel ennemi (à partir de la vague 3, voir WaveFactory) : au lieu de
     * suivre le chemin jusqu'au château, dévie pour foncer sur la tour la plus
     * proche (sans limite de portée) et la détruit à coups de dégâts de siège
     * (voir WaveSimulationService.handleSapperTick) — la tour est perdue
     * définitivement, sa case redevient constructible. S'il survit à sa cible,
     * il enchaîne ensuite sur la tour suivante la plus proche, et ainsi de
     * suite jusqu'à ce qu'il ne reste plus aucune tour sur la map ; ce n'est
     * qu'à ce moment-là qu'il reprend sa route vers le château.
     */
    // PV +20 % (180, au lieu de 150) : le rend plus difficile à abattre en route
    // vers sa tour cible, pour augmenter la pression qu'il met sur le joueur.
    // Dégâts de siège 12 -> 8 (harnais d'équilibrage, voir BalanceHarnessTest) :
    // à 12, les Sapeurs détruisaient les tours plus vite que l'économie ne
    // permettait de les racheter (4-5 tours perdues PAR VAGUE dès la vague 5,
    // mort médiane vague 7 quel que soit le build, boss vague 10 inatteignable).
    // À 8, un Archer (150 PV) tient 19 ticks de siège au lieu de 13 — le temps
    // pour la défense de tuer le Sapeur avant de perdre la tour.
    SAPEUR(180, 0.12, 28, 8, true, 8),

    /**
     * Premier boss du jeu (voir WaveFactory.BOSS_MILESTONE_INTERVAL) : apparaît
     * toutes les 10 vagues, accompagné d'une escorte d'ennemis classiques (voir
     * WaveFactory.generateEnemies). Contrairement au Sapeur, il ne dévie jamais
     * du chemin vers le château : à la place, toutes les abilityIntervalTicks,
     * il (1) soigne les ennemis proches d'une fraction (auraHealRatio) de leurs
     * PV max dans un rayon auraRadius, et (2) inflige aoeDamage à toutes les
     * tours dans un rayon aoeRadius (voir
     * WaveSimulationService.handleBossAbilityTick). PV de base très élevés,
     * encore amplifiés par le scaling multiplicatif par vague (HP_GROWTH_RATE) :
     * à la vague 10 il dépasse déjà largement les PV d'un Troll de la même vague.
     */
    BOSS_WARLORD(900, 0.07, 220, 40, false, 0,
            true, 0.06, 3.0, 15, 2.0, 40);

    public final int baseHp;
    public final double speed;
    public final int goldReward;
    /** Dégâts infligés au château lorsque cet ennemi atteint la fin du chemin. */
    public final int castleDamage;
    /** Si vrai, dévie du chemin pour cibler et détruire la tour la plus proche. */
    public final boolean attacksTowers;
    /** Dégâts de siège infligés à la tour ciblée, par tick, une fois à portée de mêlée. */
    public final int siegeDamage;
    /** Si vrai, c'est un boss : déclenche le pulse d'aura/AoE (voir WaveSimulationService.handleBossAbilityTick). */
    public final boolean isBoss;
    /** Fraction des PV max soignée à chaque ennemi proche à chaque pulsation (boss uniquement). */
    public final double auraHealRatio;
    /** Rayon (en cases) de l'aura de soin (boss uniquement). */
    public final double auraRadius;
    /** Dégâts infligés à chaque tour dans aoeRadius à chaque pulsation (boss uniquement). */
    public final int aoeDamage;
    /** Rayon (en cases) de l'attaque de zone périodique (boss uniquement). */
    public final double aoeRadius;
    /** Intervalle (en ticks) entre deux pulsations d'aura/AoE (boss uniquement). */
    public final int abilityIntervalTicks;

    EnemyType(int baseHp, double speed, int goldReward, int castleDamage,
              boolean attacksTowers, int siegeDamage) {
        this(baseHp, speed, goldReward, castleDamage, attacksTowers, siegeDamage,
                false, 0, 0, 0, 0, 0);
    }

    EnemyType(int baseHp, double speed, int goldReward, int castleDamage,
              boolean attacksTowers, int siegeDamage,
              boolean isBoss, double auraHealRatio, double auraRadius,
              int aoeDamage, double aoeRadius, int abilityIntervalTicks) {
        this.baseHp = baseHp;
        this.speed = speed;
        this.goldReward = goldReward;
        this.castleDamage = castleDamage;
        this.attacksTowers = attacksTowers;
        this.siegeDamage = siegeDamage;
        this.isBoss = isBoss;
        this.auraHealRatio = auraHealRatio;
        this.auraRadius = auraRadius;
        this.aoeDamage = aoeDamage;
        this.aoeRadius = aoeRadius;
        this.abilityIntervalTicks = abilityIntervalTicks;
    }
}
