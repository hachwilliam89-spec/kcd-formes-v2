package com.kcdformes.domain.service;

import com.kcdformes.domain.exception.CellOnPathException;
import com.kcdformes.domain.exception.InsufficientGoldException;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;
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
        // du placement (cellule libre, dans les limites, hors du couloir).

        // COULOIR STRICT (voir GAME_DESIGN 2.6) : aucune tour sur le couloir des
        // ennemis (chemin + une case de part et d'autre, là où circulent les files
        // décalées par Enemy.laneOffset). Remplace l'ancien check "ne bloque pas
        // complètement le chemin" du modèle labyrinthe abandonné : le couloir
        // étant inconstructible, il ne peut plus être bloqué du tout, et le chemin
        // reste identique pour toute la partie.
        //
        // Exception unique : le MUR-BARRAGE (TowerType.WALL, voir GAME_DESIGN 2.7)
        // suit la règle exactement INVERSE — uniquement sur le couloir (il ne sert
        // qu'à barrer le passage), jamais en dehors. Il ne remet pas en cause le
        // couloir strict : il ne dévie pas le chemin, les ennemis s'arrêtent
        // devant et le cassent (voir WaveSimulationService.handleWallBlocking).
        boolean onCorridor = pathfindingService.corridorCells(map).contains(new Position(x, y));
        if (type == TowerType.WALL) {
            if (!onCorridor) {
                throw new IllegalStateException(
                        "Wall must be placed on the enemy corridor (cell (%d, %d) is outside it)".formatted(x, y));
            }
        } else if (onCorridor) {
            throw new CellOnPathException(x, y);
        }

        Tower tower = new Tower(type, x, y);
        map.placeTower(tower); // lève CellOccupiedException ou InvalidPositionException si invalide

        // Persiste l'état mis à jour
        gameRepository.saveMap(gameId, map);

        return tower;
    }
}
