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

        // Note: la vérification/débit de l'or du joueur est gérée en amont par
        // GameService.placeTower (couche application), qui a accès au PlayerEntity
        // lié à la partie. Ce service ne s'occupe que de la validation géométrique
        // du placement (cellule libre, dans les limites, ne bloque pas le chemin).

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
