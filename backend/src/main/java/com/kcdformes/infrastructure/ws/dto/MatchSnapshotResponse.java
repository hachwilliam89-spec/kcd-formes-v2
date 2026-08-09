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
        List<TowerView> towers,
        List<ShotView> shots
) {
    public record EnemyView(String id, String type, double x, double y, int hp, int maxHp) {}
    public record TowerView(String id, String type, int x, int y, int level) {}
    public record ShotView(double fromX, double fromY, double toX, double toY) {}

    public static MatchSnapshotResponse from(Match match) {
        MatchGameState s = match.getGameState();
        List<EnemyView> enemies = s.enemies.stream().map(MatchSnapshotResponse::toView).toList();
        List<TowerView> towers = s.map.getTowers().stream().map(MatchSnapshotResponse::toView).toList();
        List<ShotView> shots = s.shots.stream()
                .map(sh -> new ShotView(sh[0], sh[1], sh[2], sh[3]))
                .toList();
        return new MatchSnapshotResponse(
                s.tick, s.wave, s.gold, s.castleHp, s.castleMaxHp,
                match.getStatus().name(), enemies, towers, shots);
    }

    private static EnemyView toView(LiveEnemy e) {
        return new EnemyView(e.id.toString(), e.type.name(), e.x, e.y, e.hp, e.maxHp);
    }

    private static TowerView toView(Tower t) {
        return new TowerView(t.getId().toString(), t.getType().name(), t.getX(), t.getY(), t.getLevel());
    }
}
