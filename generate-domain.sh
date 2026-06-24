#!/bin/bash
# Script de génération des classes domaine
# Lance depuis ~/kcd-formes-v2

BASE="backend/src/main/java/com/kcdformes"

# ── TowerType.java ────────────────────────────────────────────────────────
cat > $BASE/domain/model/TowerType.java << 'EOF'
package com.kcdformes.domain.model;

public enum TowerType {
    ARCHER(15, 3.0, 50, 1.2),
    MAGE(30, 2.5, 100, 0.8),
    CATAPULT(50, 4.0, 150, 0.4);

    public final int baseDamage;
    public final double baseRange;
    public final int baseCost;
    public final double attackSpeed;

    TowerType(int baseDamage, double baseRange, int baseCost, double attackSpeed) {
        this.baseDamage = baseDamage;
        this.baseRange = baseRange;
        this.baseCost = baseCost;
        this.attackSpeed = attackSpeed;
    }
}
EOF

# ── Tower.java ────────────────────────────────────────────────────────────
cat > $BASE/domain/model/Tower.java << 'EOF'
package com.kcdformes.domain.model;

import java.util.UUID;

public class Tower {

    private final UUID id;
    private final TowerType type;
    private final int x;
    private final int y;
    private int level;

    public Tower(TowerType type, int x, int y) {
        this.id = UUID.randomUUID();
        this.type = type;
        this.x = x;
        this.y = y;
        this.level = 1;
    }

    public Tower(UUID id, TowerType type, int x, int y, int level) {
        this.id = id;
        this.type = type;
        this.x = x;
        this.y = y;
        this.level = level;
    }

    public int getDamage() {
        return (int) (type.baseDamage * (1 + (level - 1) * 0.5));
    }

    public double getRange() {
        return type.baseRange + (level - 1) * 0.3;
    }

    public boolean canTarget(Enemy enemy) {
        double dx = this.x - enemy.getX();
        double dy = this.y - enemy.getY();
        return Math.sqrt(dx * dx + dy * dy) <= getRange();
    }

    public void upgrade() {
        this.level++;
    }

    public UUID getId() { return id; }
    public TowerType getType() { return type; }
    public int getX() { return x; }
    public int getY() { return y; }
    public int getLevel() { return level; }
}
EOF

# ── EnemyType.java ────────────────────────────────────────────────────────
cat > $BASE/domain/model/EnemyType.java << 'EOF'
package com.kcdformes.domain.model;

public enum EnemyType {
    GOBLIN(30, 1.5, 10),
    ORC(80, 0.8, 25),
    TROLL(200, 0.5, 60),
    DARK_KNIGHT(150, 1.0, 80);

    public final int baseHp;
    public final double speed;
    public final int goldReward;

    EnemyType(int baseHp, double speed, int goldReward) {
        this.baseHp = baseHp;
        this.speed = speed;
        this.goldReward = goldReward;
    }
}
EOF

# ── Enemy.java ────────────────────────────────────────────────────────────
cat > $BASE/domain/model/Enemy.java << 'EOF'
package com.kcdformes.domain.model;

import java.util.UUID;

public class Enemy {

    private final UUID id;
    private final EnemyType type;
    private int currentHp;
    private double x;
    private double y;
    private boolean alive;

    public Enemy(EnemyType type, double startX, double startY) {
        this.id = UUID.randomUUID();
        this.type = type;
        this.currentHp = type.baseHp;
        this.x = startX;
        this.y = startY;
        this.alive = true;
    }

    public void takeDamage(int damage) {
        this.currentHp = Math.max(0, this.currentHp - damage);
        if (this.currentHp == 0) this.alive = false;
    }

    public void moveTo(double x, double y) {
        this.x = x;
        this.y = y;
    }

    public boolean isAlive() { return alive; }
    public boolean isDead() { return !alive; }
    public int getGoldReward() { return type.goldReward; }

    public UUID getId() { return id; }
    public EnemyType getType() { return type; }
    public int getCurrentHp() { return currentHp; }
    public double getX() { return x; }
    public double getY() { return y; }
}
EOF

# ── Castle.java ────────────────────────────────────────────────────────────
cat > $BASE/domain/model/Castle.java << 'EOF'
package com.kcdformes.domain.model;

import java.util.UUID;

public class Castle {

    private final UUID id;
    private final UUID playerId;
    private String name;
    private int hp;
    private final int maxHp;
    private int level;

    public Castle(UUID playerId, String name) {
        this.id = UUID.randomUUID();
        this.playerId = playerId;
        this.name = name;
        this.hp = 100;
        this.maxHp = 100;
        this.level = 1;
    }

    public Castle(UUID id, UUID playerId, String name, int hp, int maxHp, int level) {
        this.id = id;
        this.playerId = playerId;
        this.name = name;
        this.hp = hp;
        this.maxHp = maxHp;
        this.level = level;
    }

    public void takeDamage(int damage) {
        this.hp = Math.max(0, this.hp - damage);
    }

    public boolean isDestroyed() {
        return this.hp <= 0;
    }

    public double getHpPercentage() {
        return (double) hp / maxHp * 100;
    }

    public UUID getId() { return id; }
    public UUID getPlayerId() { return playerId; }
    public String getName() { return name; }
    public int getHp() { return hp; }
    public int getMaxHp() { return maxHp; }
    public int getLevel() { return level; }
}
EOF

# ── Position.java (Value Object) ──────────────────────────────────────────
cat > $BASE/domain/model/Position.java << 'EOF'
package com.kcdformes.domain.model;

public record Position(int x, int y) {

    public double distanceTo(Position other) {
        int dx = this.x - other.x;
        int dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    public boolean isAdjacentTo(Position other) {
        return Math.abs(this.x - other.x) <= 1 && Math.abs(this.y - other.y) <= 1;
    }

    @Override
    public String toString() {
        return "(%d, %d)".formatted(x, y);
    }
}
EOF

# ── GameMap.java ──────────────────────────────────────────────────────────
cat > $BASE/domain/model/GameMap.java << 'EOF'
package com.kcdformes.domain.model;

import com.kcdformes.domain.exception.CellOccupiedException;
import com.kcdformes.domain.exception.InvalidPositionException;

import java.util.*;

public class GameMap {

    private final int width;
    private final int height;
    private final Position pathStart;
    private final Position pathEnd;
    private final Map<String, Tower> towers = new HashMap<>();

    public GameMap(int width, int height, Position pathStart, Position pathEnd) {
        this.width = width;
        this.height = height;
        this.pathStart = pathStart;
        this.pathEnd = pathEnd;
    }

    public void placeTower(Tower tower) {
        validatePosition(tower.getX(), tower.getY());
        String key = key(tower.getX(), tower.getY());
        if (towers.containsKey(key)) {
            throw new CellOccupiedException(tower.getX(), tower.getY());
        }
        towers.put(key, tower);
    }

    public Optional<Tower> removeTower(int x, int y) {
        return Optional.ofNullable(towers.remove(key(x, y)));
    }

    public Optional<Tower> getTowerAt(int x, int y) {
        return Optional.ofNullable(towers.get(key(x, y)));
    }

    public boolean isCellBlocked(int x, int y) {
        return towers.containsKey(key(x, y));
    }

    public boolean isValidPosition(int x, int y) {
        return x >= 0 && x < width && y >= 0 && y < height;
    }

    public List<Tower> getTowers() {
        return List.copyOf(towers.values());
    }

    private void validatePosition(int x, int y) {
        if (!isValidPosition(x, y)) {
            throw new InvalidPositionException(x, y, width, height);
        }
    }

    private String key(int x, int y) {
        return x + "," + y;
    }

    public int getWidth() { return width; }
    public int getHeight() { return height; }
    public Position getPathStart() { return pathStart; }
    public Position getPathEnd() { return pathEnd; }
}
EOF

# ── Wave.java ─────────────────────────────────────────────────────────────
cat > $BASE/domain/model/Wave.java << 'EOF'
package com.kcdformes.domain.model;

import java.util.List;
import java.util.UUID;

public class Wave {

    private final UUID id;
    private final int number;
    private final List<Enemy> enemies;
    private WaveStatus status;
    private int goldEarned;

    public Wave(int number, List<Enemy> enemies) {
        this.id = UUID.randomUUID();
        this.number = number;
        this.enemies = new ArrayList<>(enemies);
        this.status = WaveStatus.PENDING;
        this.goldEarned = 0;
    }

    public void start() {
        this.status = WaveStatus.IN_PROGRESS;
    }

    public void addGold(int amount) {
        this.goldEarned += amount;
    }

    public void complete() {
        this.status = allEnemiesDead() ? WaveStatus.VICTORY : WaveStatus.DEFEAT;
    }

    public boolean allEnemiesDead() {
        return enemies.stream().allMatch(Enemy::isDead);
    }

    public List<Enemy> getAliveEnemies() {
        return enemies.stream().filter(Enemy::isAlive).toList();
    }

    public UUID getId() { return id; }
    public int getNumber() { return number; }
    public List<Enemy> getEnemies() { return List.copyOf(enemies); }
    public WaveStatus getStatus() { return status; }
    public int getGoldEarned() { return goldEarned; }

    public enum WaveStatus {
        PENDING, IN_PROGRESS, VICTORY, DEFEAT
    }
}
EOF

# ── Exceptions domaine ────────────────────────────────────────────────────
mkdir -p $BASE/domain/exception

cat > $BASE/domain/exception/CellOccupiedException.java << 'EOF'
package com.kcdformes.domain.exception;

public class CellOccupiedException extends RuntimeException {
    public CellOccupiedException(int x, int y) {
        super("Cell (%d, %d) is already occupied".formatted(x, y));
    }
}
EOF

cat > $BASE/domain/exception/InvalidPositionException.java << 'EOF'
package com.kcdformes.domain.exception;

public class InvalidPositionException extends RuntimeException {
    public InvalidPositionException(int x, int y, int width, int height) {
        super("Position (%d, %d) is outside map bounds (%d x %d)".formatted(x, y, width, height));
    }
}
EOF

cat > $BASE/domain/exception/InsufficientGoldException.java << 'EOF'
package com.kcdformes.domain.exception;

public class InsufficientGoldException extends RuntimeException {
    public InsufficientGoldException(int required, int available) {
        super("Insufficient gold: required %d, available %d".formatted(required, available));
    }
}
EOF

# ── Ports in — Commands ───────────────────────────────────────────────────
cat > $BASE/domain/port/in/command/PlaceTowerUseCase.java << 'EOF'
package com.kcdformes.domain.port.in.command;

import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;

import java.util.UUID;

public interface PlaceTowerUseCase {

    record PlaceTowerCommand(UUID gameId, TowerType towerType, int x, int y) {}

    Tower placeTower(PlaceTowerCommand command);
}
EOF

cat > $BASE/domain/port/in/command/RemoveTowerUseCase.java << 'EOF'
package com.kcdformes.domain.port.in.command;

import java.util.UUID;

public interface RemoveTowerUseCase {

    record RemoveTowerCommand(UUID gameId, int x, int y) {}

    void removeTower(RemoveTowerCommand command);
}
EOF

cat > $BASE/domain/port/in/command/StartWaveUseCase.java << 'EOF'
package com.kcdformes.domain.port.in.command;

import com.kcdformes.domain.model.Wave;

import java.util.UUID;

public interface StartWaveUseCase {

    record StartWaveCommand(UUID gameId) {}

    Wave startWave(StartWaveCommand command);
}
EOF

# ── Ports in — Queries ────────────────────────────────────────────────────
cat > $BASE/domain/port/in/query/GetGameStateUseCase.java << 'EOF'
package com.kcdformes.domain.port.in.query;

import com.kcdformes.domain.model.GameMap;

import java.util.UUID;

public interface GetGameStateUseCase {

    record GameStateResult(UUID gameId, GameMap map, int waveNumber, int gold, String status) {}

    GameStateResult getGameState(UUID gameId);
}
EOF

cat > $BASE/domain/port/in/query/GetLeaderboardUseCase.java << 'EOF'
package com.kcdformes.domain.port.in.query;

import java.util.List;
import java.util.UUID;

public interface GetLeaderboardUseCase {

    record LeaderboardEntry(UUID playerId, String username, int elo, int gamesWon) {}

    List<LeaderboardEntry> getTopPlayers(int limit);
}
EOF

# ── Ports out ─────────────────────────────────────────────────────────────
cat > $BASE/domain/port/out/GameRepository.java << 'EOF'
package com.kcdformes.domain.port.out;

import com.kcdformes.domain.model.GameMap;

import java.util.Optional;
import java.util.UUID;

public interface GameRepository {
    Optional<GameMap> findMapByGameId(UUID gameId);
    void saveMap(UUID gameId, GameMap map);
}
EOF

cat > $BASE/domain/port/out/PlayerRepository.java << 'EOF'
package com.kcdformes.domain.port.out;

import java.util.Optional;
import java.util.UUID;

public interface PlayerRepository {

    record PlayerData(UUID id, String username, int gold, int elo) {}

    Optional<PlayerData> findById(UUID id);
    void updateGold(UUID playerId, int newGold);
    void updateElo(UUID playerId, int newElo);
}
EOF

cat > $BASE/domain/port/out/WaveRepository.java << 'EOF'
package com.kcdformes.domain.port.out;

import com.kcdformes.domain.model.Wave;

import java.util.Optional;
import java.util.UUID;

public interface WaveRepository {
    void save(UUID gameId, Wave wave);
    Optional<Wave> findById(UUID waveId);
}
EOF

echo ""
echo "✅ Classes domaine générées avec succès !"
echo ""
echo "Fichiers créés :"
find $BASE/domain -name "*.java" | sort
