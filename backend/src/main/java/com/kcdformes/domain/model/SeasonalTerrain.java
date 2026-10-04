package com.kcdformes.domain.model;

import java.util.*;

/** Règles communes au solo et au live : aucun état de rendu ni dépendance Spring. */
public final class SeasonalTerrain {
    public static final int FLOOD_INTERVAL = 3;
    public static final int BURN_TICKS = 18;
    public static final int SPREAD_TICKS = 3;
    public static final int FIRE_DAMAGE = 3;
    private static final List<Position> FLOOD_CELLS = buildFloodCells();
    private static final List<Position> LEAF_CELLS = buildLeafCells();
    private static final Set<Position> FLOOD_SET = Set.copyOf(FLOOD_CELLS);
    private static final Set<Position> LEAF_SET = Set.copyOf(LEAF_CELLS);
    public static List<Position> floodCells() { return FLOOD_CELLS; }
    public static List<Position> leafCells() { return LEAF_CELLS; }
    private final TerrainType type;
    private int wave;
    private int tick;
    private final Map<Position, Integer> fires = new LinkedHashMap<>();
    private final Set<Position> consumed = new LinkedHashSet<>();

    public record Snapshot(boolean flooded, List<Position> burning, List<Position> burned,
                           List<UUID> disabledTowers) {}
    public record Forecast(String type, boolean flooded, List<Position> affectedCells) {}

    public SeasonalTerrain(TerrainType type, int wave) { this.type = type; this.wave = wave; }

    /** Les berges sont les trois bandes sèches entre et autour des deux passages. */
    private static List<Position> buildFloodCells() {
        List<Position> cells = new ArrayList<>();
        for (int y : new int[]{6, 8, 10}) for (int x = 8; x <= 14; x++) cells.add(new Position(x, y));
        return List.copyOf(cells);
    }

    /** Petites nappes séparées : une étincelle ne consume pas toute la carte. */
    private static List<Position> buildLeafCells() {
        List<Position> cells = new ArrayList<>();
        for (int x = 6; x <= 9; x++) cells.add(new Position(x, 3));
        for (int x = 10; x <= 13; x++) cells.add(new Position(x, 7));
        for (int x = 6; x <= 9; x++) cells.add(new Position(x, 12));
        return List.copyOf(cells);
    }

    public static Forecast forecast(TerrainType type, int wave) {
        return new Forecast(type.name(), type == TerrainType.SPRING && wave > 0 && wave % FLOOD_INTERVAL == 0,
                type == TerrainType.SPRING ? floodCells() : type == TerrainType.AUTUMN ? leafCells() : List.of());
    }
    public boolean flooded() { return type == TerrainType.SPRING && wave > 0 && wave % FLOOD_INTERVAL == 0; }
    public boolean disables(Tower tower) {
        return flooded() && tower.getType() != TowerType.WALL && FLOOD_SET.contains(new Position(tower.getX(), tower.getY()));
    }
    public void beginWave(int nextWave) {
        if (wave == nextWave) return;
        wave = nextWave; tick = 0; fires.clear(); consumed.clear();
    }
    public void ignite(double x, double y) {
        if (type != TerrainType.AUTUMN) return;
        ignite(new Position((int) Math.round(x), (int) Math.round(y)));
    }
    private void ignite(Position cell) {
        if (LEAF_SET.contains(cell) && consumed.add(cell)) fires.put(cell, tick + BURN_TICKS);
    }
    public void advance() {
        tick++;
        if (fires.isEmpty()) return;
        fires.entrySet().removeIf(e -> e.getValue() <= tick);
        if (tick % SPREAD_TICKS == 0) {
            // Copie avant propagation : une seule case de progression par palier.
            for (Position p : List.copyOf(fires.keySet())) {
                ignite(new Position(p.x() - 1, p.y())); ignite(new Position(p.x() + 1, p.y()));
                ignite(new Position(p.x(), p.y() - 1)); ignite(new Position(p.x(), p.y() + 1));
            }
        }
    }
    public int damageAt(double x, double y) {
        if (fires.isEmpty()) return 0;
        return fires.containsKey(new Position((int) Math.round(x), (int) Math.round(y))) ? FIRE_DAMAGE : 0;
    }
    public Snapshot snapshot(List<Tower> towers) {
        return new Snapshot(flooded(), List.copyOf(fires.keySet()),
                consumed.stream().filter(p -> !fires.containsKey(p)).toList(),
                towers.stream().filter(t -> !t.isDestroyed() && disables(t)).map(Tower::getId).toList());
    }
}
