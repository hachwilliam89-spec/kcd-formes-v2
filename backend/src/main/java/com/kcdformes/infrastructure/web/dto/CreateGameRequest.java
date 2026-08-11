package com.kcdformes.infrastructure.web.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateGameRequest(
        @NotBlank @Size(max = 100) String castleName,
        // Map choisie (id du catalogue) — optionnel, désert par défaut (voir MapCatalog).
        String mapId
) {}
