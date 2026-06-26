package com.kcdformes.domain.service;

import com.kcdformes.domain.model.*;
import com.kcdformes.domain.port.in.command.UpgradeTowerUseCase.UpgradeTowerCommand;
import com.kcdformes.domain.port.out.GameRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

class UpgradeTowerServiceTest {

    /** Fake en mémoire — aucun adaptateur JPA de GameRepository n'existe en isolation testable ici. */
    private static class FakeGameRepository implements GameRepository {
        private final Map<UUID, GameMap> maps = new HashMap<>();

        @Override
        public Optional<GameMap> findMapByGameId(UUID gameId) {
            return Optional.ofNullable(maps.get(gameId));
        }

        @Override
        public void saveMap(UUID gameId, GameMap map) {
            maps.put(gameId, map);
        }
    }

    private FakeGameRepository gameRepository;
    private UpgradeTowerService service;
    private UUID gameId;
    private Tower tower;

    @BeforeEach
    void setUp() {
        gameRepository = new FakeGameRepository();
        service = new UpgradeTowerService(gameRepository);
        gameId = UUID.randomUUID();

        GameMap map = new GameMap(20, 15, new Position(0, 7), new Position(19, 7));
        tower = new Tower(TowerType.ARCHER, 2, 6);
        map.placeTower(tower);
        gameRepository.saveMap(gameId, map);
    }

    @Test
    @DisplayName("upgradeTower incrémente le niveau de la tour visée")
    void upgradeTower_incrementsLevel() {
        Tower upgraded = service.upgradeTower(new UpgradeTowerCommand(gameId, tower.getId()));

        assertThat(upgraded.getLevel()).isEqualTo(2);
    }

    @Test
    @DisplayName("upgradeTower persiste le niveau mis à jour dans la map sauvegardée")
    void upgradeTower_persistsUpdatedMap() {
        service.upgradeTower(new UpgradeTowerCommand(gameId, tower.getId()));

        GameMap reloaded = gameRepository.findMapByGameId(gameId).orElseThrow();
        Tower persisted = reloaded.getTowerById(tower.getId()).orElseThrow();
        assertThat(persisted.getLevel()).isEqualTo(2);
    }

    @Test
    @DisplayName("upgradeTower lève une exception si la tour n'existe pas")
    void upgradeTower_unknownTower_throws() {
        assertThatThrownBy(() -> service.upgradeTower(new UpgradeTowerCommand(gameId, UUID.randomUUID())))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("upgradeTower lève une exception si la partie n'existe pas")
    void upgradeTower_unknownGame_throws() {
        assertThatThrownBy(() -> service.upgradeTower(new UpgradeTowerCommand(UUID.randomUUID(), tower.getId())))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
