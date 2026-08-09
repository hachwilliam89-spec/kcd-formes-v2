package com.kcdformes.infrastructure.ws.dto;

import com.kcdformes.domain.model.Tower;
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
        int gold,
        int castleHp,
        int castleMaxHp,
        String status,
        List<EnemyView> enemies,
        List<TowerView> towers
) {
    public record EnemyView(String id, String type, double x, double y, int hp, int maxHp) {}
    public record TowerView(String id, String type, int x, int y, int level) {}

    public static MatchSnapshotResponse from(Match match) {
        MatchGameState s = match.getGameState();
        List<EnemyView> enemies = s.enemies.stream().map(MatchSnapshotResponse::toView).toList();
        List<TowerView> towers = s.map.getTowers().stream().map(MatchSnapshotResponse::toView).toList();
        return new MatchSnapshotResponse(
                s.tick, s.wave, s.gold, s.castleHp, s.castleMaxHp,
                match.getStatus().name(), enemies, towers);
    }

    private static EnemyView toView(LiveEnemy e) {
        return new EnemyView(e.id.toString(), e.type.name(), e.x, e.y, e.hp, e.maxHp);
    }

    private static TowerView toView(Tower t) {
        return new TowerView(t.getId().toString(), t.getType().name(), t.getX(), t.getY(), t.getLevel());
    }
}
