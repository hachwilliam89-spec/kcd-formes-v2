package com.kcdformes.infrastructure.web.dto;

import java.util.UUID;

/**
 * Profil de compte exposé au frontend : progression méta (bestWave) utilisée
 * pour déterminer les déblocages (tours, etc.), distincte de l'or par partie.
 */
public record PlayerProfileResponse(
        UUID playerId,
        String username,
        int elo,
        int bestWave
) {}
