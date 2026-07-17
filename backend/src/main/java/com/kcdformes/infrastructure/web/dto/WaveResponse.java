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
        List<TickResponse> ticks,
        // Non vide uniquement si cette vague est un palier de bonus (toutes les 5
        // vagues, voir GameService.BONUS_MILESTONE_INTERVAL) : le frontend doit
        // alors présenter ce choix avant de permettre le lancement de la vague
        // suivante (voir ChooseBonusUseCase).
        boolean awaitingBonusChoice,
        List<BonusOptionResponse> availableBonuses
) {
    public record EnemyResponse(UUID id, String type, double x, double y, int hp, int maxHp) {}

    public record DamageEventResponse(UUID towerId, UUID enemyId, int damage) {}

    /** Dégâts de siège infligés par un Sapeur à la tour qu'il assiège (voir WaveSimulationService.TowerDamageEvent). */
    public record TowerDamageEventResponse(UUID enemyId, UUID towerId, int damage) {}

    /** Pulsation d'aura/AoE d'un Boss (voir WaveSimulationService.BossAbilityEvent) — pour l'animer côté frontend. */
    public record BossAbilityEventResponse(UUID bossId, double x, double y, int alliesHealed, int towersHit) {}

    public record TickResponse(
            int tick,
            List<EnemyResponse> enemies,
            List<DamageEventResponse> damageEvents,
            List<TowerDamageEventResponse> towerDamageEvents,
            List<UUID> deaths,
            List<UUID> reachedCastle,
            // Tours détruites pendant ce tick — la case correspondante redevient
            // constructible côté domaine (voir GameMap.removeTower) ; le frontend
            // s'en sert pour retirer la tour de l'affichage sans attendre la fin
            // de l'animation de la vague.
            List<UUID> destroyedTowers,
            List<BossAbilityEventResponse> bossAbilityEvents,
            // Tours étourdies par le pulse d'un Boss pendant ce tick (état complet
            // par tick, voir WaveSimulationService.TickSnapshot) : le frontend les
            // grise tant qu'elles y figurent, sans compter les durées lui-même.
            List<UUID> stunnedTowers,
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
                ticks,
                result.awaitingBonusChoice(),
                result.availableBonuses().stream().map(BonusOptionResponse::from).toList()
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
                tick.towerDamageEvents().stream()
                        .map(d -> new TowerDamageEventResponse(d.enemyId(), d.towerId(), d.damage()))
                        .toList(),
                tick.deaths(),
                tick.reachedCastle(),
                tick.destroyedTowers(),
                tick.bossAbilityEvents().stream()
                        .map(b -> new BossAbilityEventResponse(b.bossId(), b.x(), b.y(), b.alliesHealed(), b.towersHit()))
                        .toList(),
                tick.stunnedTowers(),
                tick.castleHp()
        );
    }
}
