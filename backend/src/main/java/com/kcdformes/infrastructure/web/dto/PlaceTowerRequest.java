package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.TowerType;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record PlaceTowerRequest(
        @NotNull TowerType towerType,
        @Min(0) int x,
        @Min(0) int y
) {}
