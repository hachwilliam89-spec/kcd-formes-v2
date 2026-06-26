package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.BonusType;
import jakarta.validation.constraints.NotNull;

public record ChooseBonusRequest(@NotNull BonusType bonusType) {}
