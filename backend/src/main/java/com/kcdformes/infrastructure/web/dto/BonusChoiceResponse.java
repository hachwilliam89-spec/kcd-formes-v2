package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.port.in.command.ChooseBonusUseCase.ChooseBonusResult;

public record BonusChoiceResponse(String bonusType, int gold, int castleHp, int castleMaxHp) {
    public static BonusChoiceResponse from(ChooseBonusResult result) {
        return new BonusChoiceResponse(
                result.bonusType().name(), result.gold(), result.castleHp(), result.castleMaxHp());
    }
}
