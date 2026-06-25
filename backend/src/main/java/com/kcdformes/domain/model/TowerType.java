package com.kcdformes.domain.model;

public enum TowerType {
    // Cadences réduites par rapport à la version initiale : les ennemis restent
    // longtemps à portée d'une tour fixe (ils sont lents), donc une cadence trop
    // élevée cumule un dégât largement supérieur à leurs PV avant qu'ils ne
    // sortent de portée — une seule tour suffisait alors à tenir indéfiniment.
    ARCHER(15, 3.0, 50, 0.7, 0),
    MAGE(30, 2.5, 100, 0.5, 0),
    CATAPULT(50, 4.0, 150, 0.35, 0),
    // Tour débloquée par la progression de compte (meilleure vague atteinte),
    // pas par l'or de la partie en cours : voir GameService.placeTower().
    BALLISTA(80, 5.0, 200, 0.25, 10);

    public final int baseDamage;
    public final double baseRange;
    public final int baseCost;
    public final double attackSpeed;
    /** Vague (bestWave du compte) requise pour débloquer cette tour. 0 = débloquée d'office. */
    public final int unlockWave;

    TowerType(int baseDamage, double baseRange, int baseCost, double attackSpeed, int unlockWave) {
        this.baseDamage = baseDamage;
        this.baseRange = baseRange;
        this.baseCost = baseCost;
        this.attackSpeed = attackSpeed;
        this.unlockWave = unlockWave;
    }
}
