package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.TargetingMode;
import jakarta.validation.constraints.NotNull;

/** Changement de mode de ciblage d'une tour (voir SetTargetingModeUseCase). */
public record SetTargetingModeRequest(@NotNull TargetingMode mode) {}
