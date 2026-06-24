package com.kcdformes.domain.model;

public enum TowerType {
    ARCHER(15, 3.0, 50, 1.2),
    MAGE(30, 2.5, 100, 0.8),
    CATAPULT(50, 4.0, 150, 0.4);

    public final int baseDamage;
    public final double baseRange;
    public final int baseCost;
    public final double attackSpeed;

    TowerType(int baseDamage, double baseRange, int baseCost, double attackSpeed) {
        this.baseDamage = baseDamage;
        this.baseRange = baseRange;
        this.baseCost = baseCost;
        this.attackSpeed = attackSpeed;
    }
}
