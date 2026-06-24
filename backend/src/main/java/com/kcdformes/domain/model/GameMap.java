package com.kcdformes.domain.model;

import com.kcdformes.domain.exception.CellOccupiedException;
import com.kcdformes.domain.exception.InvalidPositionException;

import java.util.*;

public class GameMap {

    private final int width;
    private final int height;
    private final Position pathStart;
    private final Position pathEnd;
    private final Map<String, Tower> towers = new HashMap<>();

    public GameMap(int width, int height, Position pathStart, Position pathEnd) {
        this.width = width;
        this.height = height;
        this.pathStart = pathStart;
        this.pathEnd = pathEnd;
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
}
