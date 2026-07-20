package com.kcdformes.domain.service;

import com.kcdformes.domain.exception.CellOnPathException;
import com.kcdformes.domain.exception.CellOccupiedException;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;
import com.kcdformes.domain.port.in.command.PlaceTowerUseCase.PlaceTowerCommand;
import com.kcdformes.domain.port.out.GameRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Couvre la règle "couloir strict" (GAME_DESIGN 2.6) : le chemin des ennemis et
 * sa bande d'une case de part et d'autre sont inconstructibles — les tours ne
 * dévient jamais le chemin, elles n'ont simplement pas le droit d'y être.
 */
class PlaceTowerServiceTest {

    /** Fake in-memory (même approche que dans UpgradeTowerServiceTest). */
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
    private PlaceTowerService service;
    private UUID gameId;
    private final UUID playerId = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        gameRepository = new FakeGameRepository();
        // PlayerRepository : jamais sollicité par la validation géométrique du
        // placement (l'or est géré en amont par GameService) — null assumé ici.
        service = new PlaceTowerService(gameRepository, null, new PathfindingService());
        gameId = UUID.randomUUID();

        // Chemin horizontal (0,7) -> (19,7) : couloir inconstructible = y=6..8.
        GameMap map = new GameMap(20, 15, new Position(0, 7), new Position(19, 7));
        gameRepository.saveMap(gameId, map);
    }

    @Test
    @DisplayName("Impossible de poser une tour sur le chemin lui-même (y=7)")
    void placeTower_onPathCell_rejected() {
        assertThatThrownBy(() -> service.placeTower(
                new PlaceTowerCommand(gameId, playerId, TowerType.ARCHER, 10, 7)))
                .isInstanceOf(CellOnPathException.class);
    }

    @Test
    @DisplayName("Impossible de poser une tour sur la bande du couloir (y=6 et y=8)")
    void placeTower_onCorridorBand_rejected() {
        assertThatThrownBy(() -> service.placeTower(
                new PlaceTowerCommand(gameId, playerId, TowerType.ARCHER, 10, 6)))
                .isInstanceOf(CellOnPathException.class);
        assertThatThrownBy(() -> service.placeTower(
                new PlaceTowerCommand(gameId, playerId, TowerType.ARCHER, 10, 8)))
                .isInstanceOf(CellOnPathException.class);
    }

    @Test
    @DisplayName("Une tour se pose normalement juste au bord du couloir (y=5)")
    void placeTower_justOutsideCorridor_accepted() {
        Tower tower = service.placeTower(
                new PlaceTowerCommand(gameId, playerId, TowerType.ARCHER, 10, 5));

        assertThat(tower).isNotNull();
        assertThat(gameRepository.findMapByGameId(gameId).orElseThrow()
                .getTowerAt(10, 5)).isPresent();
    }

    @Test
    @DisplayName("Le mur-barrage se pose SUR le couloir (règle inverse des tours)")
    void placeWall_onCorridor_accepted() {
        Tower wall = service.placeTower(
                new PlaceTowerCommand(gameId, playerId, TowerType.WALL, 10, 7));

        assertThat(wall).isNotNull();
        assertThat(gameRepository.findMapByGameId(gameId).orElseThrow()
                .getTowerAt(10, 7)).isPresent();
    }

    @Test
    @DisplayName("Le mur-barrage est refusé hors du couloir (il ne sert qu'à barrer le passage)")
    void placeWall_outsideCorridor_rejected() {
        assertThatThrownBy(() -> service.placeTower(
                new PlaceTowerCommand(gameId, playerId, TowerType.WALL, 10, 5)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("corridor");
    }

    @Test
    @DisplayName("Le nombre de murs simultanés est plafonné (anti-donjon : le spam pavait le couloir)")
    void placeWall_beyondCap_rejected() {
        // Remplit le plafond : MAX_WALLS murs sur des cases de couloir distinctes.
        for (int i = 0; i < PlaceTowerService.MAX_WALLS; i++) {
            service.placeTower(new PlaceTowerCommand(gameId, playerId, TowerType.WALL, 3 + i, 7));
        }

        assertThatThrownBy(() -> service.placeTower(
                new PlaceTowerCommand(gameId, playerId, TowerType.WALL, 12, 7)))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("limit");
    }

    @Test
    @DisplayName("Une case déjà occupée hors couloir reste refusée (CellOccupied, pas CellOnPath)")
    void placeTower_occupiedCellOutsideCorridor_rejectedAsOccupied() {
        gameRepository.findMapByGameId(gameId).orElseThrow()
                .placeTower(new Tower(TowerType.MAGE, 10, 5));

        assertThatThrownBy(() -> service.placeTower(
                new PlaceTowerCommand(gameId, playerId, TowerType.ARCHER, 10, 5)))
                .isInstanceOf(CellOccupiedException.class);
    }
}
