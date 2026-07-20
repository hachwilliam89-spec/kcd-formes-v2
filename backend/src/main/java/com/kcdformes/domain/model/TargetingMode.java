package com.kcdformes.domain.model;

/**
 * Mode de ciblage d'une tour, choisi par le joueur (voir SetTargetingModeUseCase).
 * Choix stratégique classique du tower defense : la même tour au même endroit
 * change de rôle selon son mode — CLOSEST maximise l'uptime, FIRST arrête les
 * fuyards avant le château, STRONGEST focalise les élites qui, sinon,
 * traversent sous les tirs éparpillés sur la piétaille.
 */
public enum TargetingMode {
    /** L'ennemi le plus proche de la tour (défaut historique) : maximise le temps à portée. */
    CLOSEST,
    /** L'ennemi le plus AVANCÉ sur le chemin : le dernier rempart avant le château. */
    FIRST,
    /** L'ennemi avec le plus de PV courants : concentre le feu sur les élites. */
    STRONGEST
}
