package com.kcdformes.application.usecase;

import com.kcdformes.domain.exception.UnknownMapException;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.MapCatalog;
import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.SeasonalTerrain;
import com.kcdformes.domain.model.TerrainType;
import com.kcdformes.domain.port.in.query.GetMapLayoutUseCase;
import com.kcdformes.domain.service.PathfindingService;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * Expose la disposition des cartes telle que le domaine la calcule
 * (MapCatalog + PathfindingService). Aucune règle ici : uniquement de
 * l'assemblage, pour que les clients n'aient rien à recalculer.
 */
@Service
public class MapLayoutService implements GetMapLayoutUseCase {

    /** Ordre de lecture d'une grille : ligne par ligne, puis colonne. */
    private static final Comparator<Position> GRID_ORDER =
            Comparator.comparingInt(Position::y).thenComparingInt(Position::x);

    private static final SeasonalRules SEASONAL_RULES = new SeasonalRules(
            SeasonalTerrain.FLOOD_INTERVAL,
            SeasonalTerrain.MUD_SPEED_FACTOR,
            SeasonalTerrain.FOG_RANGE_PENALTY,
            SeasonalTerrain.HAIL_DAMAGE_FACTOR,
            SeasonalTerrain.FERTILE_GOLD_FACTOR,
            SeasonalTerrain.FOG_DAMAGE_TAKEN_FACTOR);

    private final PathfindingService pathfindingService;

    public MapLayoutService(PathfindingService pathfindingService) {
        this.pathfindingService = pathfindingService;
    }

    @Override
    public List<String> listMapIds() {
        return MapCatalog.ids();
    }

    @Override
    public MapLayout getLayout(String mapId) {
        if (!MapCatalog.exists(mapId)) {
            throw new UnknownMapException(mapId);
        }
        GameMap map = MapCatalog.buildMap(mapId);

        LinkedHashSet<Position> spawns = new LinkedHashSet<>();
        for (List<Position> lane : map.getLanes()) {
            spawns.add(lane.get(0));
        }
        List<List<Position>> lanePaths = pathfindingService.findLanePaths(map);

        return new MapLayout(
                mapId,
                map.getWidth(),
                map.getHeight(),
                map.getTerrain(),
                map.getPathEnd(),
                List.copyOf(spawns),
                map.getLanes().stream().map(List::copyOf).toList(),
                lanePaths == null ? List.of() : List.copyOf(lanePaths),
                map.getCorridorHalfWidth(),
                List.copyOf(map.getWideSpots()),
                sorted(pathfindingService.corridorCells(map)),
                sorted(pathfindingService.buildableCells(map)),
                sorted(SeasonalTerrain.waterCells(map.getTerrain())),
                map.getTerrain() == TerrainType.SPRING ? sorted(SeasonalTerrain.bankCells()) : List.of(),
                SEASONAL_RULES);
    }

    @Override
    public SeasonalTerrain.Forecast forecast(String mapId, int wave) {
        if (!MapCatalog.exists(mapId)) {
            throw new UnknownMapException(mapId);
        }
        return SeasonalTerrain.forecast(MapCatalog.buildMap(mapId).getTerrain(), Math.max(wave, 1));
    }

    private static List<Position> sorted(Collection<Position> cells) {
        List<Position> list = new ArrayList<>(cells);
        list.sort(GRID_ORDER);
        return List.copyOf(list);
    }
}
