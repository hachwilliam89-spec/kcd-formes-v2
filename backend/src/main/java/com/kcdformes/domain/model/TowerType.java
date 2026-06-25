package com.kcdformes.domain.model;

public enum TowerType {
    // Cadences réduites par rapport à la version initiale : les ennemis restent
    // longtemps à portée d'une tour fixe (ils sont lents), donc une cadence trop
    // élevée cumule un dégât largement supérieur à leurs PV avant qu'ils ne
    // sortent de portée — une seule tour suffisait alors à tenir indéfiniment.
    // Resserrées une nouvelle fois (toujours trop facile en test local).
    // baseDamage encore réduit de 20 % (DPS = baseDamage * attackSpeed) :
    // ARCHER 15->12, MAGE 30->24, CATAPULT 50->40, BALLISTA 80->64.
    ARCHER(12, 3.0, 50, 0.6, 0),
    MAGE(24, 2.5, 100, 0.45, 0),
    CATAPULT(40, 4.0, 150, 0.3, 0),
    // Tour débloquée par la progression de compte (meilleure vague atteinte),
    // pas par l'or de la partie en cours : voir GameService.placeTower().
    BALLISTA(64, 5.0, 200, 0.22, 10);

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
