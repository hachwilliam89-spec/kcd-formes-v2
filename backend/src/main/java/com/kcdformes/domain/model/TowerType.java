package com.kcdformes.domain.model;

public enum TowerType {
    // Cadences réduites par rapport à la version initiale : les ennemis restent
    // longtemps à portée d'une tour fixe (ils sont lents), donc une cadence trop
    // élevée cumule un dégât largement supérieur à leurs PV avant qu'ils ne
    // sortent de portée — une seule tour suffisait alors à tenir indéfiniment.
    // Resserrées une nouvelle fois (toujours trop facile en test local).
    // baseDamage encore réduit de 20 % (DPS = baseDamage * attackSpeed) :
    // ARCHER 15->12, MAGE 30->24, CATAPULT 50->40, BALLISTA 80->64.
    //
    // Profils de dégâts (DamageType) : mono-cible inchangé pour Archer/Baliste
    // (tir précis), zone pour la Catapulte (projectile à éclats, cohérent avec
    // le lore "siège"), continu pour le Mage (rayon magique sans cooldown).
    // Pour MAGE, attackSpeed n'est plus utilisé (dégâts appliqués chaque tick) :
    // baseDamage a été recalé à l'équivalent de l'ancien DPS moyen (24*0.45≈11)
    // pour ne pas re-déséquilibrer en changeant juste le profil de tir.
    ARCHER(12, 3.0, 50, 0.6, 0, DamageType.SINGLE_TARGET, 0),
    MAGE(11, 2.5, 100, 0.45, 0, DamageType.CONTINUOUS, 0),
    // baseDamage réduit de 40 à 27 (-33 %) : la zone restait trop dominante en
    // pratique (un seul tir touchait la cible principale + tous les ennemis
    // groupés dans splashRadius, pour un DPS effectif largement supérieur aux
    // autres profils à coût équivalent).
    CATAPULT(27, 4.0, 150, 0.3, 0, DamageType.AOE, 1.5),
    // Tour débloquée par la progression de compte (meilleure vague atteinte),
    // pas par l'or de la partie en cours : voir GameService.placeTower().
    BALLISTA(64, 5.0, 200, 0.22, 10, DamageType.SINGLE_TARGET, 0);

    public final int baseDamage;
    public final double baseRange;
    public final int baseCost;
    /** Ignoré pour DamageType.CONTINUOUS (pas de cooldown, dégâts chaque tick). */
    public final double attackSpeed;
    /** Vague (bestWave du compte) requise pour débloquer cette tour. 0 = débloquée d'office. */
    public final int unlockWave;
    public final DamageType damageType;
    /** Rayon de l'effet de zone autour de la cible principale. Utilisé seulement si damageType == AOE. */
    public final double splashRadius;

    TowerType(int baseDamage, double baseRange, int baseCost, double attackSpeed, int unlockWave,
              DamageType damageType, double splashRadius) {
        this.baseDamage = baseDamage;
        this.baseRange = baseRange;
        this.baseCost = baseCost;
        this.attackSpeed = attackSpeed;
        this.unlockWave = unlockWave;
        this.damageType = damageType;
        this.splashRadius = splashRadius;
    }
}
