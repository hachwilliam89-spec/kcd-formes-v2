package com.kcdformes.domain.model;

import java.util.UUID;

public class Tower {

    private final UUID id;
    private final TowerType type;
    private final int x;
    private final int y;
    private int level;
    private int hp;

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

    public int getDamage() {
        return (int) (type.baseDamage * (1 + (level - 1) * 0.5));
    }

    public double getRange() {
        return type.baseRange + (level - 1) * 0.3;
    }

    public boolean canTarget(Enemy enemy) {
        double dx = this.x - enemy.getX();
        double dy = this.y - enemy.getY();
        return Math.sqrt(dx * dx + dy * dy) <= getRange();
    }

    public void upgrade() {
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
        return (int) Math.round(type.baseCost * 3 * (1 + (level - 1) * 0.2));
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
     * face à l'achat de nouvelles tours faibles.
     */
    public int getUpgradeCost() {
        return type.baseCost * level;
    }

    public UUID getId() { return id; }
    public TowerType getType() { return type; }
    public int getX() { return x; }
    public int getY() { return y; }
    public int getLevel() { return level; }
    public int getHp() { return hp; }
}
