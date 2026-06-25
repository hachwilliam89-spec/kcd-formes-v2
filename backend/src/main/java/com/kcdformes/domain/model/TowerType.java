package com.kcdformes.domain.model;

public enum TowerType {
    ARCHER(15, 3.0, 50, 1.2, 0),
    MAGE(30, 2.5, 100, 0.8, 0),
    CATAPULT(50, 4.0, 150, 0.4, 0),
    // Tour débloquée par la progression de compte (meilleure vague atteinte),
    // pas par l'or de la partie en cours : voir GameService.placeTower().
    BALLISTA(80, 5.0, 200, 0.3, 10);

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
