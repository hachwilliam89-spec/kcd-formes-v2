#!/bin/bash
# KCD Formes v2 — Config Spring Security + Premier service domaine
# Lance depuis ~/kcd-formes-v2

BASE="backend/src/main/java/com/kcdformes"

echo "⚙️  Génération config Spring Security + services domaine..."

# ── SecurityConfig.java ───────────────────────────────────────────────────
cat > $BASE/infrastructure/config/SecurityConfig.java << 'EOF'
package com.kcdformes.infrastructure.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .anyRequest().authenticated()
            );

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
EOF

# ── JpaConfig.java ────────────────────────────────────────────────────────
cat > $BASE/infrastructure/config/JpaConfig.java << 'EOF'
package com.kcdformes.infrastructure.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@EnableJpaRepositories(basePackages = "com.kcdformes.infrastructure.persistence.repository")
public class JpaConfig {
}
EOF

# ── application.yaml mis à jour ───────────────────────────────────────────
cat > backend/src/main/resources/application.yaml << 'EOF'
spring:
  application:
    name: kcd-formes-backend

  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/kcdformes}
    username: ${SPRING_DATASOURCE_USERNAME:kcd_user}
    password: ${SPRING_DATASOURCE_PASSWORD:kcd_dev_password}
    driver-class-name: org.postgresql.Driver

  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    open-in-view: false
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        format_sql: true

  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true

server:
  port: ${SERVER_PORT:8080}

jwt:
  secret: ${JWT_SECRET:kcd_dev_secret_key_32_chars_min}
  expiration-ms: ${JWT_EXPIRATION_MS:86400000}

logging:
  level:
    com.kcdformes: DEBUG
    org.springframework.security: INFO
    org.hibernate.SQL: DEBUG
EOF

# ── PlaceTowerService.java ────────────────────────────────────────────────
cat > $BASE/domain/service/PlaceTowerService.java << 'EOF'
package com.kcdformes.domain.service;

import com.kcdformes.domain.exception.InsufficientGoldException;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;
import com.kcdformes.domain.port.in.command.PlaceTowerUseCase;
import com.kcdformes.domain.port.out.GameRepository;
import com.kcdformes.domain.port.out.PlayerRepository;

import java.util.UUID;

public class PlaceTowerService implements PlaceTowerUseCase {

    private final GameRepository gameRepository;
    private final PlayerRepository playerRepository;
    private final PathfindingService pathfindingService;

    public PlaceTowerService(
            GameRepository gameRepository,
            PlayerRepository playerRepository,
            PathfindingService pathfindingService) {
        this.gameRepository = gameRepository;
        this.playerRepository = playerRepository;
        this.pathfindingService = pathfindingService;
    }

    @Override
    public Tower placeTower(PlaceTowerCommand command) {
        UUID gameId = command.gameId();
        TowerType type = command.towerType();
        int x = command.x();
        int y = command.y();

        // Récupère la map
        GameMap map = gameRepository.findMapByGameId(gameId)
                .orElseThrow(() -> new IllegalArgumentException("Game not found: " + gameId));

        // Récupère le joueur et vérifie l'or
        // Note: le gameId permettra de retrouver le playerId via la couche infrastructure
        // Pour l'instant on passe par une convention simplifiée
        // TODO: enrichir avec PlayerRepository quand la couche persistence sera en place

        // Vérifie que le placement ne bloque pas le chemin
        Tower tower = new Tower(type, x, y);
        map.placeTower(tower); // lève CellOccupiedException ou InvalidPositionException si invalide

        boolean pathExists = pathfindingService.hasPath(map);
        if (!pathExists) {
            map.removeTower(x, y); // rollback
            throw new IllegalStateException(
                "Cannot place tower at (%d, %d): it would completely block the path".formatted(x, y));
        }

        // Persiste l'état mis à jour
        gameRepository.saveMap(gameId, map);

        return tower;
    }
}
EOF

# ── PathfindingService.java (A*) ──────────────────────────────────────────
cat > $BASE/domain/service/PathfindingService.java << 'EOF'
package com.kcdformes.domain.service;

import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;

import java.util.*;

/**
 * Implémentation A* pour le pathfinding des ennemis.
 * Aucune dépendance Spring — logique pure, testable unitairement.
 */
public class PathfindingService {

    /**
     * Vérifie qu'un chemin existe entre pathStart et pathEnd sur la map.
     * Utilisé pour valider qu'un placement de tour ne bloque pas complètement le passage.
     */
    public boolean hasPath(GameMap map) {
        return findPath(map) != null;
    }

    /**
     * Calcule le chemin optimal (A*) de pathStart à pathEnd.
     * Retourne null si aucun chemin n'existe.
     */
    public List<Position> findPath(GameMap map) {
        Position start = map.getPathStart();
        Position end = map.getPathEnd();

        PriorityQueue<Node> open = new PriorityQueue<>(Comparator.comparingDouble(n -> n.f));
        Map<Position, Position> cameFrom = new HashMap<>();
        Map<Position, Double> gScore = new HashMap<>();

        gScore.put(start, 0.0);
        open.add(new Node(start, heuristic(start, end)));

        while (!open.isEmpty()) {
            Node current = open.poll();

            if (current.position.equals(end)) {
                return reconstructPath(cameFrom, current.position);
            }

            for (Position neighbor : getNeighbors(current.position, map)) {
                double tentativeG = gScore.getOrDefault(current.position, Double.MAX_VALUE) + 1;

                if (tentativeG < gScore.getOrDefault(neighbor, Double.MAX_VALUE)) {
                    cameFrom.put(neighbor, current.position);
                    gScore.put(neighbor, tentativeG);
                    double f = tentativeG + heuristic(neighbor, end);
                    open.add(new Node(neighbor, f));
                }
            }
        }

        return null; // Aucun chemin trouvé
    }

    private List<Position> getNeighbors(Position pos, GameMap map) {
        int[][] directions = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};
        List<Position> neighbors = new ArrayList<>();

        for (int[] dir : directions) {
            int nx = pos.x() + dir[0];
            int ny = pos.y() + dir[1];

            if (map.isValidPosition(nx, ny) && !map.isCellBlocked(nx, ny)) {
                neighbors.add(new Position(nx, ny));
            }
        }

        return neighbors;
    }

    private double heuristic(Position a, Position b) {
        // Distance de Manhattan
        return Math.abs(a.x() - b.x()) + Math.abs(a.y() - b.y());
    }

    private List<Position> reconstructPath(Map<Position, Position> cameFrom, Position current) {
        List<Position> path = new ArrayList<>();
        path.add(current);

        while (cameFrom.containsKey(current)) {
            current = cameFrom.get(current);
            path.add(0, current);
        }

        return path;
    }

    private record Node(Position position, double f) {}
}
EOF

# ── WaveFactory.java (génération des vagues) ──────────────────────────────
cat > $BASE/domain/service/WaveFactory.java << 'EOF'
package com.kcdformes.domain.service;

import com.kcdformes.domain.model.*;

import java.util.ArrayList;
import java.util.List;

/**
 * Génère les vagues d'ennemis selon le numéro de vague.
 * La difficulté augmente progressivement.
 */
public class WaveFactory {

    public Wave createWave(int waveNumber, Position spawnPosition) {
        List<Enemy> enemies = generateEnemies(waveNumber, spawnPosition);
        return new Wave(waveNumber, enemies);
    }

    private List<Enemy> generateEnemies(int waveNumber, Position spawn) {
        List<Enemy> enemies = new ArrayList<>();

        int goblinCount = 3 + waveNumber * 2;
        for (int i = 0; i < goblinCount; i++) {
            enemies.add(new Enemy(EnemyType.GOBLIN, spawn.x(), spawn.y()));
        }

        if (waveNumber >= 3) {
            int orcCount = waveNumber - 2;
            for (int i = 0; i < orcCount; i++) {
                enemies.add(new Enemy(EnemyType.ORC, spawn.x(), spawn.y()));
            }
        }

        if (waveNumber >= 6) {
            enemies.add(new Enemy(EnemyType.TROLL, spawn.x(), spawn.y()));
        }

        if (waveNumber >= 10 && waveNumber % 5 == 0) {
            enemies.add(new Enemy(EnemyType.DARK_KNIGHT, spawn.x(), spawn.y()));
        }

        return enemies;
    }
}
EOF

echo ""
echo "✅ Config Spring Security + services domaine générés !"
echo ""
echo "Fichiers créés :"
echo "  infrastructure/config/SecurityConfig.java"
echo "  infrastructure/config/JpaConfig.java"
echo "  domain/service/PlaceTowerService.java"
echo "  domain/service/PathfindingService.java"
echo "  domain/service/WaveFactory.java"
echo "  resources/application.yaml (open-in-view désactivé)"
