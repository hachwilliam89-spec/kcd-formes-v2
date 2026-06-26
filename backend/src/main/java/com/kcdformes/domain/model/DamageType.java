package com.kcdformes.domain.model;

/**
 * Profil de dégâts d'une tour — voir TowerType pour le mapping tour -> type,
 * et WaveSimulationService pour l'application effective pendant la simulation.
 */
public enum DamageType {
    /** Un tir, une cible : comportement historique, inchangé. */
    SINGLE_TARGET,
    /** Un tir sur la cible principale + dégâts réduits aux ennemis proches (splashRadius). */
    AOE,
    /** Pas de cooldown : dégâts appliqués chaque tick à la cible en portée (effet "rayon continu"). */
    CONTINUOUS
}
