package com.kcdformes.domain.exception;

import java.util.UUID;

/**
 * Levée si l'on tente de lancer une nouvelle vague (StartWaveUseCase) alors
 * qu'un palier de bonus (toutes les 5 vagues, voir GameEntity.awaitingBonusChoice)
 * attend encore un choix du joueur (voir ChooseBonusUseCase). Le joueur doit
 * d'abord choisir un bonus avant de pouvoir continuer.
 */
public class BonusChoicePendingException extends RuntimeException {
    public BonusChoicePendingException(UUID gameId) {
        super("A bonus choice is pending for game %s: choose a bonus before starting the next wave"
                .formatted(gameId));
    }
}
