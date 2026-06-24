#!/bin/bash
# KCD Formes v2 — Couche persistence JPA + Tests unitaires domaine
# Lance depuis ~/kcd-formes-v2

BASE="backend/src/main/java/com/kcdformes"
TEST_BASE="backend/src/test/java/com/kcdformes"

echo "🗄️  Génération couche persistence + tests..."

# ── Entités JPA ───────────────────────────────────────────────────────────

cat > $BASE/infrastructure/persistence/entity/PlayerEntity.java << 'EOF'
package com.kcdformes.infrastructure.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "players")
public class PlayerEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(unique = true, nullable = false, length = 50)
    private String username;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private int gold = 0;

    @Column(nullable = false)
    private int gems = 0;

    @Column(nullable = false)
    private int elo = 1000;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    // Getters & Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public int getGold() { return gold; }
    public void setGold(int gold) { this.gold = gold; }

    public int getGems() { return gems; }
    public void setGems(int gems) { this.gems = gems; }

    public int getElo() { return elo; }
    public void setElo(int elo) { this.elo = elo; }

    public OffsetDateTime getCreatedAt() { return createdAt; }
}
EOF

cat > $BASE/infrastructure/persistence/entity/CastleEntity.java << 'EOF'
package com.kcdformes.infrastructure.persistence.entity;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(name = "castles")
public class CastleEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "player_id", nullable = false)
    private PlayerEntity player;

    @Column(length = 100)
    private String name;

    @Column(nullable = false)
    private int hp = 100;

    @Column(nullable = false)
    private int level = 1;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "map_state", columnDefinition = "jsonb")
    private Map<String, Object> mapState;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt = OffsetDateTime.now();

    @PreUpdate
    public void preUpdate() {
        this.updatedAt = OffsetDateTime.now();
    }

    // Getters & Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PlayerEntity getPlayer() { return player; }
    public void setPlayer(PlayerEntity player) { this.player = player; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public int getHp() { return hp; }
    public void setHp(int hp) { this.hp = hp; }

    public int getLevel() { return level; }
    public void setLevel(int level) { this.level = level; }

    public Map<String, Object> getMapState() { return mapState; }
    public void setMapState(Map<String, Object> mapState) { this.mapState = mapState; }

    public OffsetDateTime getUpdatedAt() { return updatedAt; }
}
EOF

cat > $BASE/infrastructure/persistence/entity/GameEntity.java << 'EOF'
package com.kcdformes.infrastructure.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "games")
public class GameEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "player_id", nullable = false)
    private PlayerEntity player;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "castle_id", nullable = false)
    private CastleEntity castle;

    @Column(nullable = false, length = 20)
    private String status = "IN_PROGRESS";

    @Column(name = "wave_number", nullable = false)
    private int waveNumber = 0;

    @Column(name = "gold_earned", nullable = false)
    private int goldEarned = 0;

    @Column(name = "started_at", nullable = false, updatable = false)
    private OffsetDateTime startedAt = OffsetDateTime.now();

    @Column(name = "ended_at")
    private OffsetDateTime endedAt;

    // Getters & Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PlayerEntity getPlayer() { return player; }
    public void setPlayer(PlayerEntity player) { this.player = player; }

    public CastleEntity getCastle() { return castle; }
    public void setCastle(CastleEntity castle) { this.castle = castle; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public int getWaveNumber() { return waveNumber; }
    public void setWaveNumber(int waveNumber) { this.waveNumber = waveNumber; }

    public int getGoldEarned() { return goldEarned; }
    public void setGoldEarned(int goldEarned) { this.goldEarned = goldEarned; }

    public OffsetDateTime getStartedAt() { return startedAt; }
    public OffsetDateTime getEndedAt() { return endedAt; }
    public void setEndedAt(OffsetDateTime endedAt) { this.endedAt = endedAt; }
}
EOF

# ── Spring Data JPA Repositories ──────────────────────────────────────────

cat > $BASE/infrastructure/persistence/repository/PlayerJpaRepository.java << 'EOF'
package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.infrastructure.persistence.entity.PlayerEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PlayerJpaRepository extends JpaRepository<PlayerEntity, UUID> {
    Optional<PlayerEntity> findByUsername(String username);
    Optional<PlayerEntity> findByEmail(String email);
    boolean existsByUsername(String username);
    boolean existsByEmail(String email);
}
EOF

cat > $BASE/infrastructure/persistence/repository/CastleJpaRepository.java << 'EOF'
package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.infrastructure.persistence.entity.CastleEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CastleJpaRepository extends JpaRepository<CastleEntity, UUID> {
    Optional<CastleEntity> findByPlayerIdAndId(UUID playerId, UUID castleId);
    List<CastleEntity> findAllByPlayerId(UUID playerId);
}
EOF

cat > $BASE/infrastructure/persistence/repository/GameJpaRepository.java << 'EOF'
package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.infrastructure.persistence.entity.GameEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GameJpaRepository extends JpaRepository<GameEntity, UUID> {
    List<GameEntity> findAllByPlayerIdOrderByStartedAtDesc(UUID playerId);
}
EOF

# ── Mappers domaine ↔ persistence ─────────────────────────────────────────

cat > $BASE/infrastructure/persistence/mapper/GameMapMapper.java << 'EOF'
package com.kcdformes.infrastructure.persistence.mapper;

import com.kcdformes.domain.model.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Convertit GameMap (domaine) ↔ Map<String, Object> (JSONB PostgreSQL).
 */
@Component
public class GameMapMapper {

    private final ObjectMapper objectMapper;

    public GameMapMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> toJson(GameMap map) {
        Map<String, Object> json = new HashMap<>();
        json.put("width", map.getWidth());
        json.put("height", map.getHeight());
        json.put("pathStart", Map.of("x", map.getPathStart().x(), "y", map.getPathStart().y()));
        json.put("pathEnd", Map.of("x", map.getPathEnd().x(), "y", map.getPathEnd().y()));

        List<Map<String, Object>> towers = map.getTowers().stream()
                .map(t -> Map.of(
                        "x", (Object) t.getX(),
                        "y", t.getY(),
                        "type", t.getType().name(),
                        "level", t.getLevel()
                ))
                .toList();
        json.put("towers", towers);

        return json;
    }

    @SuppressWarnings("unchecked")
    public GameMap fromJson(Map<String, Object> json) {
        int width = (int) json.get("width");
        int height = (int) json.get("height");

        Map<String, Integer> startMap = (Map<String, Integer>) json.get("pathStart");
        Map<String, Integer> endMap = (Map<String, Integer>) json.get("pathEnd");

        Position pathStart = new Position(startMap.get("x"), startMap.get("y"));
        Position pathEnd = new Position(endMap.get("x"), endMap.get("y"));

        GameMap map = new GameMap(width, height, pathStart, pathEnd);

        List<Map<String, Object>> towers = (List<Map<String, Object>>) json.getOrDefault("towers", List.of());
        for (Map<String, Object> t : towers) {
            TowerType type = TowerType.valueOf((String) t.get("type"));
            int x = (int) t.get("x");
            int y = (int) t.get("y");
            int level = (int) t.get("level");
            map.placeTower(new Tower(UUID.randomUUID(), type, x, y, level));
        }

        return map;
    }
}
EOF

# ── Tests unitaires domaine ───────────────────────────────────────────────

mkdir -p $TEST_BASE/domain/service
mkdir -p $TEST_BASE/domain/model

cat > $TEST_BASE/domain/model/GameMapTest.java << 'EOF'
package com.kcdformes.domain.model;

import com.kcdformes.domain.exception.CellOccupiedException;
import com.kcdformes.domain.exception.InvalidPositionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class GameMapTest {

    private GameMap map;

    @BeforeEach
    void setUp() {
        map = new GameMap(20, 15,
                new Position(0, 7),
                new Position(19, 7));
    }

    @Test
    @DisplayName("Place tower on empty cell — should succeed")
    void placeTower_onEmptyCell_succeeds() {
        Tower tower = new Tower(TowerType.ARCHER, 3, 5);
        map.placeTower(tower);

        assertThat(map.getTowerAt(3, 5)).isPresent();
        assertThat(map.getTowers()).hasSize(1);
    }

    @Test
    @DisplayName("Place tower on occupied cell — should throw CellOccupiedException")
    void placeTower_onOccupiedCell_throwsCellOccupiedException() {
        map.placeTower(new Tower(TowerType.ARCHER, 3, 5));

        assertThatThrownBy(() -> map.placeTower(new Tower(TowerType.MAGE, 3, 5)))
                .isInstanceOf(CellOccupiedException.class)
                .hasMessageContaining("3")
                .hasMessageContaining("5");
    }

    @Test
    @DisplayName("Place tower outside bounds — should throw InvalidPositionException")
    void placeTower_outsideBounds_throwsInvalidPositionException() {
        assertThatThrownBy(() -> map.placeTower(new Tower(TowerType.ARCHER, 25, 5)))
                .isInstanceOf(InvalidPositionException.class);
    }

    @Test
    @DisplayName("Remove tower — should return removed tower and free cell")
    void removeTower_shouldFreeCell() {
        map.placeTower(new Tower(TowerType.ARCHER, 3, 5));

        var removed = map.removeTower(3, 5);

        assertThat(removed).isPresent();
        assertThat(map.getTowerAt(3, 5)).isEmpty();
        assertThat(map.isCellBlocked(3, 5)).isFalse();
    }

    @Test
    @DisplayName("Remove tower from empty cell — should return empty")
    void removeTower_fromEmptyCell_returnsEmpty() {
        var result = map.removeTower(5, 5);
        assertThat(result).isEmpty();
    }
}
EOF

cat > $TEST_BASE/domain/model/TowerTest.java << 'EOF'
package com.kcdformes.domain.model;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class TowerTest {

    @Test
    @DisplayName("Tower damage scales with level")
    void getDamage_scalesWithLevel() {
        Tower tower = new Tower(TowerType.ARCHER, 0, 0);
        int baseDamage = tower.getDamage();

        tower.upgrade();
        int levelTwoDamage = tower.getDamage();

        assertThat(levelTwoDamage).isGreaterThan(baseDamage);
    }

    @Test
    @DisplayName("Tower can target enemy in range")
    void canTarget_enemyInRange_returnsTrue() {
        Tower tower = new Tower(TowerType.ARCHER, 5, 5); // range = 3.0
        Enemy enemy = new Enemy(EnemyType.GOBLIN, 6, 5); // distance = 1.0

        assertThat(tower.canTarget(enemy)).isTrue();
    }

    @Test
    @DisplayName("Tower cannot target enemy out of range")
    void canTarget_enemyOutOfRange_returnsFalse() {
        Tower tower = new Tower(TowerType.ARCHER, 0, 0); // range = 3.0
        Enemy enemy = new Enemy(EnemyType.GOBLIN, 10, 10); // distance >> 3.0

        assertThat(tower.canTarget(enemy)).isFalse();
    }
}
EOF

cat > $TEST_BASE/domain/service/PathfindingServiceTest.java << 'EOF'
package com.kcdformes.domain.service;

import com.kcdformes.domain.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.*;

class PathfindingServiceTest {

    private PathfindingService pathfindingService;
    private GameMap map;

    @BeforeEach
    void setUp() {
        pathfindingService = new PathfindingService();
        map = new GameMap(5, 5,
                new Position(0, 2),
                new Position(4, 2));
    }

    @Test
    @DisplayName("Empty map — path should exist")
    void findPath_onEmptyMap_returnsPath() {
        List<Position> path = pathfindingService.findPath(map);
        assertThat(path).isNotNull().isNotEmpty();
        assertThat(path.get(0)).isEqualTo(new Position(0, 2));
        assertThat(path.get(path.size() - 1)).isEqualTo(new Position(4, 2));
    }

    @Test
    @DisplayName("Blocked column — path goes around")
    void findPath_withBlockedColumn_findsAlternatePath() {
        // Bloque la colonne x=2 sauf en y=0
        map.placeTower(new Tower(TowerType.ARCHER, 2, 1));
        map.placeTower(new Tower(TowerType.ARCHER, 2, 2));
        map.placeTower(new Tower(TowerType.ARCHER, 2, 3));
        map.placeTower(new Tower(TowerType.ARCHER, 2, 4));

        List<Position> path = pathfindingService.findPath(map);
        assertThat(path).isNotNull(); // passe par y=0
    }

    @Test
    @DisplayName("Fully blocked — no path exists")
    void findPath_fullyBlocked_returnsNull() {
        // Bloque toute la colonne x=2
        for (int y = 0; y < 5; y++) {
            map.placeTower(new Tower(TowerType.ARCHER, 2, y));
        }

        List<Position> path = pathfindingService.findPath(map);
        assertThat(path).isNull();
    }

    @Test
    @DisplayName("hasPath delegates to findPath correctly")
    void hasPath_whenPathExists_returnsTrue() {
        assertThat(pathfindingService.hasPath(map)).isTrue();
    }
}
EOF

cat > $TEST_BASE/domain/service/WaveFactoryTest.java << 'EOF'
package com.kcdformes.domain.service;

import com.kcdformes.domain.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class WaveFactoryTest {

    private WaveFactory waveFactory;
    private Position spawn;

    @BeforeEach
    void setUp() {
        waveFactory = new WaveFactory();
        spawn = new Position(0, 7);
    }

    @Test
    @DisplayName("Wave 1 — only goblins")
    void createWave_wave1_containsOnlyGoblins() {
        Wave wave = waveFactory.createWave(1, spawn);

        assertThat(wave.getEnemies()).isNotEmpty();
        assertThat(wave.getEnemies())
                .allMatch(e -> e.getType() == EnemyType.GOBLIN);
    }

    @Test
    @DisplayName("Wave 3 — contains orcs")
    void createWave_wave3_containsOrcs() {
        Wave wave = waveFactory.createWave(3, spawn);

        assertThat(wave.getEnemies())
                .anyMatch(e -> e.getType() == EnemyType.ORC);
    }

    @Test
    @DisplayName("Wave 6 — contains a troll")
    void createWave_wave6_containsTroll() {
        Wave wave = waveFactory.createWave(6, spawn);

        assertThat(wave.getEnemies())
                .anyMatch(e -> e.getType() == EnemyType.TROLL);
    }

    @Test
    @DisplayName("Wave number increases difficulty")
    void createWave_laterWaves_haveMoreEnemies() {
        Wave wave1 = waveFactory.createWave(1, spawn);
        Wave wave5 = waveFactory.createWave(5, spawn);

        assertThat(wave5.getEnemies().size())
                .isGreaterThan(wave1.getEnemies().size());
    }
}
EOF

echo ""
echo "✅ Couche persistence + tests unitaires générés !"
echo ""
echo "Entités JPA :"
find $BASE/infrastructure/persistence -name "*.java" | sort
echo ""
echo "Tests :"
find $TEST_BASE/domain -name "*.java" | sort
