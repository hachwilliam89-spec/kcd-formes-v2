package com.kcdformes.domain.port.in.command;

import com.kcdformes.domain.model.BonusType;

import java.util.UUID;

public interface ChooseBonusUseCase {

    record ChooseBonusCommand(UUID gameId, BonusType bonusType) {}

    /**
     * Résultat du choix : seuls les champs pertinents pour le bonus choisi varient
     * vraiment (ex. gold après GOLD_INJECTION, castleHp après CASTLE_REPAIR), mais
     * on renvoie l'état complet pertinent pour que le frontend n'ait pas besoin
     * d'un refetch séparé pour rafraîchir l'affichage.
     */
    record ChooseBonusResult(BonusType bonusType, int gold, int castleHp, int castleMaxHp) {}

    ChooseBonusResult chooseBonus(ChooseBonusCommand command);
}
