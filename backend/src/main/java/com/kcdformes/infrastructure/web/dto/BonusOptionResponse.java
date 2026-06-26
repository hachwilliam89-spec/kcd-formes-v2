package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.BonusType;

/** Une option de bonus telle qu'affichée côté frontend (voir BonusType). */
public record BonusOptionResponse(String type, String label, String description) {
    public static BonusOptionResponse from(BonusType bonusType) {
        return new BonusOptionResponse(bonusType.name(), bonusType.label, bonusType.description);
    }
}
