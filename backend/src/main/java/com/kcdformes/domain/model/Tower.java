package com.kcdformes.domain.model;

import java.util.UUID;

public class Tower {

    /** Niveau d'amélioration maximum : une tour niv. 3 est un investissement final,
     *  coûteux mais décisif (voir getDamage/getRange/getUpgradeCost). */
    public static final int MAX_LEVEL = 3;

    private final UUID id;
    private final TowerType type;
    private final int x;
    private final int y;
    private int level;
    private int hp;
    /**
     * Mode de ciblage choisi par le joueur (voir TargetingMode) — mutable et
     * persisté avec la map (voir GameMapMapper) : le choix survit aux vagues
     * et aux rechargements, contrairement aux états de combat éphémères.
     */
    private TargetingMode targetingMode = TargetingMode.CLOSEST;

    public Tower(TowerType type, int x, int y) {
        this.id = UUID.randomUUID();
        this.type = type;
        this.x = x;
        this.y = y;
        this.level = 1;
        this.hp = getMaxHp();
    }

    public Tower(UUID id, TowerType type, int x, int y, int level) {
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;
        this.level = level;
        this.hp = getMaxHp();
    }

    /**
     * Constructeur de réhydratation JSON avec PV explicites (voir GameMapMapper) :
     * une tour endommagée par un Sapeur (voir EnemyType.attacksTowers,
     * WaveSimulationService) doit rester endommagée après un rechargement de la
     * map, au lieu de revenir systématiquement à pleine vie.
     */
    public Tower(UUID id, TowerType type, int x, int y, int level, int hp) {
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;
        this.level = level;
        this.hp = hp;
    }

    // Progression des dégâts/portée par niveau (1 → 3). Le niveau 3 offre un bond
    // marqué (×2.6 dégâts, +0.9 portée) : une tour au max change vraiment le combat,
    // pour justifier son coût élevé (voir getUpgradeCost).
    public int getDamage() {
        double mult = level >= 3 ? 2.6 : 1 + (level - 1) * 0.6; // niv1=1.0, niv2=1.6, niv3=2.6
        return (int) (type.baseDamage * mult);
    }

    public double getRange() {
        double bonus = level >= 3 ? 0.9 : (level - 1) * 0.35; // niv1=+0, niv2=+0.35, niv3=+0.9
        return type.baseRange + bonus;
    }

    public boolean isMaxLevel() {
        return level >= MAX_LEVEL;
    }

    public boolean canTarget(Enemy enemy) {
        double dx = this.x - enemy.getX();
        double dy = this.y - enemy.getY();
        return Math.sqrt(dx * dx + dy * dy) <= getRange();
    }

    public void upgrade() {
        if (level >= MAX_LEVEL) return; // garde-fou : le cap est aussi refusé en amont (GameService)
        this.level++;
        // Une tour améliorée est reconstruite/renforcée : elle repart à pleine
        // vie au nouveau niveau (getMaxHp() en dépend) plutôt que de garder ses
        // PV courants, qui n'auraient plus aucun sens face au nouveau plafond.
        this.hp = getMaxHp();
    }

    /**
     * PV maximum de la structure elle-même (distincts des PV des ennemis) —
     * cible des dégâts de siège d'un Sapeur (voir EnemyType.attacksTowers,
     * WaveSimulationService). Croît avec le niveau : une tour améliorée est
     * aussi plus résistante à la destruction, pas seulement plus puissante.
     */
    public int getMaxHp() {
        // structureHp > 0 : PV explicites découplés du coût (cas du WALL, voir
        // TowerType.structureHp) ; sinon formule standard dérivée du coût.
        int base = type.structureHp > 0 ? type.structureHp : type.baseCost * 3;
        return (int) Math.round(base * (1 + (level - 1) * 0.2));
    }

    public boolean isDestroyed() {
        return hp <= 0;
    }

    /** Inflige des dégâts de siège (Sapeur) à la structure de la tour elle-même. */
    public void takeSiegeDamage(int damage) {
        this.hp = Math.max(0, this.hp - damage);
    }

    /**
     * Répare entièrement la structure (palier de bonus TOWER_REPAIR, voir
     * BonusType / GameService.chooseBonus) : remet les PV à leur maximum courant,
     * sans changer le niveau de la tour (à la différence de upgrade()).
     */
    public void repair() {
        this.hp = getMaxHp();
    }

    /**
     * Coût en or pour passer cette tour au niveau suivant (calculé sur le niveau
     * COURANT, avant l'incrément). Calé sur baseCost * level : au niveau 1,
     * améliorer coûte autant que poser une tour neuve du même type — un vrai choix
     * à chaque fois, pas un coup gratuit — puis le coût grimpe avec le niveau
     * (x2, x3, ...) pour que réinvestir dans une tour existante reste un sacrifice
     * face à l'achat de nouvelles tours faibles. Coût renforcé (× level × 2) : le
     * passage au niveau 3 (baseCost × 4) est un vrai sacrifice pour un gain décisif.
     */
    public int getUpgradeCost() {
        return type.baseCost * level * 2;
    }

    public TargetingMode getTargetingMode() { return targetingMode; }
    public void setTargetingMode(TargetingMode targetingMode) { this.targetingMode = targetingMode; }

    public UUID getId() { return id; }
    public TowerType getType() { return type; }
    public int getX() { return x; }
    public int getY() { return y; }
    public int getLevel() { return level; }
    public int getHp() { return hp; }
}
