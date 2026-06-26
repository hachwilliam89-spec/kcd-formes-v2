package com.kcdformes.domain.model;

/**
 * Paliers de bonus : toutes les 5 vagues (voir GameService.startWave), le joueur
 * doit choisir UN bonus parmi ces options avant de pouvoir relancer une vague
 * (voir GameEntity.awaitingBonusChoice). Objectif : maintenir une difficulté
 * stable — dure mais pas impossible — en laissant le joueur compenser le point
 * faible de sa run en cours (or insuffisant, château fragilisé, tours abîmées
 * par un Sapeur) plutôt que de subir un effet automatique qui ne correspond pas
 * toujours à son besoin du moment.
 */
public enum BonusType {
    GOLD_INJECTION(
            "Trésor de guerre",
            "Reçoit immédiatement un bonus d'or proportionnel à la vague atteinte."),
    CASTLE_REPAIR(
            "Réparation du château",
            "Restaure entièrement les PV du château."),
    TOWER_REPAIR(
            "Maintenance des tours",
            "Répare toutes les tours endommagées à leurs PV maximum.");

    public final String label;
    public final String description;

    BonusType(String label, String description) {
        this.label = label;
        this.description = description;
    }
}
