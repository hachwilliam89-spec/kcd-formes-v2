package com.kcdformes.domain.model;

import com.kcdformes.domain.exception.CellOccupiedException;
import com.kcdformes.domain.exception.InvalidPositionException;

import java.util.*;

public class GameMap {

    private final int width;
    private final int height;
    // Voies du chemin. Chaque voie est une liste de waypoints (spawn -> château) :
    // deux waypoints consécutifs sont alignés (même ligne/colonne), le chemin réel
    // est la concaténation des segments droits (voir PathfindingService). Une carte
    // classique n'a qu'UNE voie ; une carte multi-voies en a plusieurs, toutes
    // terminant sur la même case château. lanes.get(0) = voie de référence (compat
    // pathStart/pathEnd/getWaypoints).
    private final List<List<Position>> lanes;
    private final List<Position> waypoints;   // = lanes.get(0), pour compat
    private final Position pathStart;
    private final Position pathEnd;
    // Demi-largeur du couloir inconstructible autour des voies (Chebyshev). 1 =
    // couloir de 3 cases de large (historique) ; 0 = voie fine d'1 case (pertinent
    // pour les cartes multi-voies, plus de terrain et de meilleurs angles).
    private final int corridorHalfWidth;
    // Cases d'élargissement local du couloir (« aires de croisement ») : ajoutées au
    // couloir en plus des voies, elles épaississent la route à certains endroits pour
    // que les ennemis s'y désalignent (voir WaveSimulationService) au lieu d'une file
    // indienne permanente. Vide = aucune (comportement historique).
    private final List<Position> wideSpots;
    private final Map<String, Tower> towers = new HashMap<>();

    public GameMap(int width, int height, List<Position> waypoints) {
        this(width, height, List.of(copyLane(waypoints)), 1, List.of());
    }

    /** Compat : couloir droit défini par ses seules extrémités (= 2 waypoints). */
    public GameMap(int width, int height, Position pathStart, Position pathEnd) {
        this(width, height, List.of(pathStart, pathEnd));
    }

    /**
     * Carte à plusieurs voies. Toutes les voies doivent partager la même case
     * d'arrivée (le château). corridorHalfWidth règle la largeur du couloir.
     * Fabrique nommée (et non un constructeur) car List<Position> et
     * List<List<Position>> ont le même effacement de type.
     */
    public static GameMap ofLanes(int width, int height, List<List<Position>> lanes, int corridorHalfWidth) {
        return new GameMap(width, height, lanes, corridorHalfWidth, List.of());
    }

    /** Comme ofLanes, avec des aires d'élargissement local du couloir (voir wideSpots). */
    public static GameMap ofLanes(int width, int height, List<List<Position>> lanes,
                                  int corridorHalfWidth, List<Position> wideSpots) {
        return new GameMap(width, height, lanes, corridorHalfWidth, wideSpots);
    }

    private GameMap(int width, int height, List<List<Position>> lanes, int corridorHalfWidth,
                    List<Position> wideSpots) {
        if (lanes == null || lanes.isEmpty()) {
            throw new IllegalArgumentException("Au moins une voie est requise");
        }
        List<List<Position>> copy = new ArrayList<>();
        for (List<Position> lane : lanes) {
            copy.add(copyLane(lane));
        }
        this.width = width;
        this.height = height;
        this.lanes = List.copyOf(copy);
        this.waypoints = this.lanes.get(0);
        this.pathStart = this.waypoints.get(0);
        this.pathEnd = this.waypoints.get(this.waypoints.size() - 1);
        this.corridorHalfWidth = corridorHalfWidth;
        this.wideSpots = wideSpots == null ? List.of() : List.copyOf(wideSpots);
    }

    private static List<Position> copyLane(List<Position> lane) {
        if (lane == null || lane.size() < 2) {
            throw new IllegalArgumentException("Une voie doit avoir au moins 2 waypoints (spawn + château)");
        }
        return List.copyOf(lane);
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

    /** Recherche par id (ex. amélioration d'une tour existante) — distinct de getTowerAt,
     * qui indexe par position. */
    public Optional<Tower> getTowerById(UUID id) {
        return towers.values().stream().filter(t -> t.getId().equals(id)).findFirst();
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
    public List<Position> getWaypoints() { return waypoints; }
    /** Toutes les voies (>= 1). Une carte mono-voie renvoie une liste d'un élément. */
    public List<List<Position>> getLanes() { return lanes; }
    public int getLaneCount() { return lanes.size(); }
    public int getCorridorHalfWidth() { return corridorHalfWidth; }
    public List<Position> getWideSpots() { return wideSpots; }
}
