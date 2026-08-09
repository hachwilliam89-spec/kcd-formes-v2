package com.kcdformes.infrastructure.ws.dto;

import com.kcdformes.domain.model.match.LiveEnemy;
import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchGameState;

import java.util.List;

/**
 * Snapshot de jeu live diffusé à ~15 Hz sur /topic/match/{id}/state (Jalon 3a).
 * Le client interpole entre deux snapshots pour un rendu fluide.
 */
public record MatchSnapshotResponse(
        long tick,
        int wave,
        int castleHp,
        int castleMaxHp,
        String status,
        List<EnemyView> enemies
) {
    public record EnemyView(String id, String type, double x, double y, int hp, int maxHp) {}

    public static MatchSnapshotResponse from(Match match) {
        MatchGameState s = match.getGameState();
        List<EnemyView> enemies = s.enemies.stream()
                .map(MatchSnapshotResponse::toView)
                .toList();
        return new MatchSnapshotResponse(
                s.tick, s.wave, s.castleHp, s.castleMaxHp, match.getStatus().name(), enemies);
    }

    private static EnemyView toView(LiveEnemy e) {
        return new EnemyView(e.id.toString(), e.type.name(), e.x, e.y, e.hp, e.maxHp);
    }
}
