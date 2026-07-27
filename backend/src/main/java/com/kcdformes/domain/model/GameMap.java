package com.kcdformes.domain.model;

import com.kcdformes.domain.exception.CellOccupiedException;
import com.kcdformes.domain.exception.InvalidPositionException;

import java.util.*;

public class GameMap {

    private final int width;
    private final int height;
    // Points de virage du chemin, dans l'ordre spawn -> château. Deux waypoints
    // consécutifs sont alignés (même ligne ou même colonne) : le chemin réel est
    // la concaténation des segments droits qui les relient (voir
    // PathfindingService.findCorridorPath). Un simple couple [start, end] donne
    // l'ancien couloir droit ; une liste plus longue donne un tracé sinueux.
    private final List<Position> waypoints;
    private final Position pathStart;
    private final Position pathEnd;
    private final Map<String, Tower> towers = new HashMap<>();

    public GameMap(int width, int height, List<Position> waypoints) {
        if (waypoints == null || waypoints.size() < 2) {
            throw new IllegalArgumentException("Le chemin doit avoir au moins 2 waypoints (spawn + château)");
        }
        this.width = width;
        this.height = height;
        this.waypoints = List.copyOf(waypoints);
        this.pathStart = this.waypoints.get(0);
        this.pathEnd = this.waypoints.get(this.waypoints.size() - 1);
    }

    /** Compat : couloir droit défini par ses seules extrémités (= 2 waypoints). */
    public GameMap(int width, int height, Position pathStart, Position pathEnd) {
        this(width, height, List.of(pathStart, pathEnd));
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
}
