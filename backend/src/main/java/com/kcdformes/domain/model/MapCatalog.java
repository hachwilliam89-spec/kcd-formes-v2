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

    /**
     * Définition d'une carte : une ou plusieurs voies (toutes terminant sur le
     * château) + demi-largeur du couloir (1 = large historique, 0 = voies fines).
     */
    private record Def(List<List<Position>> lanes, int corridorHalfWidth) {}

    private static Def single(List<Position> waypoints) {
        return new Def(List.of(waypoints), 1);
    }

    private static final Map<String, Def> MAPS = Map.of(
            "desert", single(List.of(
                    new Position(0, 3), new Position(17, 3), new Position(17, 8),
                    new Position(2, 8), new Position(2, 13), new Position(19, 13))),
            // La Fourche : UNE entrée (0,8), la route se divise en (3,8) en trois
            // branches qui rejoignent le château (17,8) par des angles différents —
            // par le nord (haut), l'ouest (tout droit) et le sud (bas). Voies fines.
            "fourche", new Def(List.of(
                    List.of(new Position(0, 8), new Position(3, 8), new Position(3, 2),
                            new Position(17, 2), new Position(17, 8)),                 // nord
                    List.of(new Position(0, 8), new Position(17, 8)),                  // ouest (direct)
                    List.of(new Position(0, 8), new Position(3, 8), new Position(3, 14),
                            new Position(17, 14), new Position(17, 8))),               // sud
                    0));

    private MapCatalog() {}

    /** Id de map valide ? (sinon on retombe sur le désert). */
    public static String normalize(String mapId) {
        return (mapId != null && MAPS.containsKey(mapId)) ? mapId : DEFAULT_MAP_ID;
    }

    /** Construit une GameMap neuve pour la map demandée (désert par défaut). */
    public static GameMap buildMap(String mapId) {
        Def def = MAPS.get(normalize(mapId));
        return GameMap.ofLanes(WIDTH, HEIGHT, def.lanes(), def.corridorHalfWidth());
    }
}
