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

    /** Plafond de murs simultanés sur la map (voir le commentaire dans placeTower). Dupliqué côté front (TOWER_INFO). */
    public static final int MAX_WALLS = 6;

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
        Position pos = new Position(x, y);
        boolean onCorridor = pathfindingService.corridorCells(map).contains(pos);
        if (type == TowerType.WALL) {
            if (!onCorridor) {
                throw new IllegalStateException(
                        "Wall must be placed on the enemy corridor (cell (%d, %d) is outside it)".formatted(x, y));
            }
            // Plafond de murs simultanés : sans lui, paver le couloir en donjon
            // (30+ murs à 35 or) entassait toute la vague sous le feu de la
            // défense entière — victoire garantie, build dégénéré constaté en
            // partie réelle. 6 = deux barrages complets du couloir : la
            // stratégie de chokepoint reste entière, le donjon disparaît.
            long wallCount = map.getTowers().stream()
                    .filter(t -> t.getType() == TowerType.WALL)
                    .count();
            if (wallCount >= MAX_WALLS) {
                throw new IllegalStateException(
                        "Wall limit reached (%d): destroy or lose one before building another".formatted(MAX_WALLS));
            }
        } else if (onCorridor) {
            throw new CellOnPathException(x, y);
        } else if (!pathfindingService.buildableCells(map).contains(pos)) {
            // Hors de la bande constructible (au bord des routes) : zone morte
            // réservée au décor. Le placement doit rester pertinent (à portée d'une
            // route), pas éparpillé sur tout le champ (voir BUILD_BAND).
            throw new IllegalStateException(
                    "Cell (%d, %d) is a dead zone (build along the roads' edge)".formatted(x, y));
        }

        Tower tower = new Tower(type, x, y);
        map.placeTower(tower); // lève CellOccupiedException ou InvalidPositionException si invalide

        // Persiste l'état mis à jour
        gameRepository.saveMap(gameId, map);

        return tower;
    }
}
