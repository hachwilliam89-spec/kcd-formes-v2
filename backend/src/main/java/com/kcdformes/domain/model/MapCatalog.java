package com.kcdformes.domain.model;

import java.util.List;
import java.util.Map;

/**
 * Catalogue des maps jouables (solo + multi). Grille fixe 20×16 : seuls le TRACÉ
 * (waypoints) change d'une map à l'autre. DOIT rester synchronisé avec le catalogue
 * frontend (components/game/maps.ts) — mêmes id + waypoints, sinon le décor et le
 * rendu client ne colleraient pas au déplacement réel des ennemis (calculé ici).
 */
public final class MapCatalog {

    public static final int WIDTH = 20;
    public static final int HEIGHT = 16;
    public static final String DEFAULT_MAP_ID = "desert";

    private static final Map<String, List<Position>> WAYPOINTS = Map.of(
            "desert", List.of(
                    new Position(0, 3), new Position(17, 3), new Position(17, 8),
                    new Position(2, 8), new Position(2, 13), new Position(19, 13)),
            "prairie", List.of(
                    new Position(0, 2), new Position(3, 2), new Position(3, 13),
                    new Position(17, 13), new Position(17, 6), new Position(19, 6)),
            "snow", List.of(
                    new Position(0, 13), new Position(17, 13), new Position(17, 3),
                    new Position(2, 3), new Position(2, 9), new Position(19, 9)));

    private MapCatalog() {}

    /** Id de map valide ? (sinon on retombe sur le désert). */
    public static String normalize(String mapId) {
        return (mapId != null && WAYPOINTS.containsKey(mapId)) ? mapId : DEFAULT_MAP_ID;
    }

    /** Construit une GameMap neuve pour la map demandée (désert par défaut). */
    public static GameMap buildMap(String mapId) {
        return new GameMap(WIDTH, HEIGHT, WAYPOINTS.get(normalize(mapId)));
    }
}
