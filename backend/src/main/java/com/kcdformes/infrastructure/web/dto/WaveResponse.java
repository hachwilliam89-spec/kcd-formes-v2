package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.Wave;

import java.util.UUID;

public record WaveResponse(
        UUID waveId,
        int number,
        int enemyCount,
        String status
) {
    public static WaveResponse from(Wave wave) {
        return new WaveResponse(
                wave.getId(),
                wave.getNumber(),
                wave.getEnemies().size(),
                wave.getStatus().name()
        );
    }
}
