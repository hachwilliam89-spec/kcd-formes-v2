package com.kcdformes.infrastructure.web.dto;

import java.util.UUID;

public record AuthResponse(
        String token,
        UUID playerId,
        String username
) {}
