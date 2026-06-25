package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.Wave;
import com.kcdformes.domain.port.in.command.StartWaveUseCase.StartWaveResult;
import com.kcdformes.domain.service.WaveSimulationService.TickSnapshot;

import java.util.List;
import java.util.UUID;

public record WaveResponse(
        UUID waveId,
        int number,
        int enemyCount,
        String status,
        int goldEarned,
        int castleHp,
        int castleMaxHp,
        int castleDamageTaken,
        boolean castleDestroyed,
        String gameStatus,
        List<TickResponse> ticks
) {
    public record EnemyResponse(UUID id, String type, double x, double y, int hp, int maxHp) {}

    public record DamageEventResponse(UUID towerId, UUID enemyId, int damage) {}

    public record TickResponse(
            int tick,
            List<EnemyResponse> enemies,
            List<DamageEventResponse> damageEvents,
            List<UUID> deaths,
            List<UUID> reachedCastle,
            int castleHp
    ) {}

    public static WaveResponse from(StartWaveResult result) {
        Wave wave = result.wave();

        List<TickResponse> ticks = result.ticks().stream()
                .map(WaveResponse::fromTick)
                .toList();

        return new WaveResponse(
                wave.getId(),
                wave.getNumber(),
                wave.getEnemies().size(),
                wave.getStatus().name(),
                result.goldEarned(),
                result.castleHp(),
                result.castleMaxHp(),
                result.castleDamageTaken(),
                result.castleDestroyed(),
                result.gameStatus(),
                ticks
        );
    }

    private static TickResponse fromTick(TickSnapshot tick) {
        return new TickResponse(
                tick.tick(),
                tick.enemies().stream()
                        .map(e -> new EnemyResponse(e.enemyId(), e.enemyType(), e.x(), e.y(), e.hp(), e.maxHp()))
                        .toList(),
                tick.damageEvents().stream()
                        .map(d -> new DamageEventResponse(d.towerId(), d.enemyId(), d.damage()))
                        .toList(),
                tick.deaths(),
                tick.reachedCastle(),
                tick.castleHp()
        );
    }
}
