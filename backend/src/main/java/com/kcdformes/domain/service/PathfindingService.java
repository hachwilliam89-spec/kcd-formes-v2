package com.kcdformes.domain.service;

import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;

import java.util.*;

/**
 * Implémentation A* pour le pathfinding des ennemis.
 * Aucune dépendance Spring — logique pure, testable unitairement.
 */
public class PathfindingService {

    /**
     * Vérifie qu'un chemin existe entre pathStart et pathEnd sur la map.
     *
     * Héritage du modèle "labyrinthe" abandonné (les tours déviaient le chemin,
     * seul le blocage complet était interdit) : plus utilisé en production depuis
     * le passage au couloir strict (voir findCorridorPath / corridorCells), mais
     * conservé car c'est le point de réentrée naturel si un futur mode de map
     * "labyrinthe" est un jour introduit.
     */
    public boolean hasPath(GameMap map) {
        return findPath(map) != null;
    }

    /**
     * COULOIR STRICT — décision de design (voir GAME_DESIGN 2.6) : le chemin des
     * ennemis est calculé en ignorant les tours. Il est donc identique pour toute
     * la partie, quelles que soient les tours posées : les tours ne dévient jamais
     * les ennemis, elles ne peuvent tout simplement pas être posées sur le couloir
     * (voir corridorCells / PlaceTowerService).
     */
    public List<Position> findCorridorPath(GameMap map) {
        // Le chemin passe par tous les waypoints dans l'ordre : on calcule le
        // segment (A* en ignorant les tours) entre chaque paire consécutive et on
        // les concatène. Deux waypoints alignés donnent un segment droit ; la
        // concaténation d'un serpentin de waypoints donne le tracé sinueux.
        List<Position> waypoints = map.getWaypoints();
        List<Position> path = new ArrayList<>();
        for (int i = 0; i < waypoints.size() - 1; i++) {
            List<Position> segment = findPath(map, waypoints.get(i), waypoints.get(i + 1), true);
            if (segment == null) {
                return null; // segment infranchissable (ne devrait pas arriver sur une map valide)
            }
            for (Position p : segment) {
                // Évite de dupliquer le waypoint partagé entre deux segments.
                if (path.isEmpty() || !path.get(path.size() - 1).equals(p)) {
                    path.add(p);
                }
            }
        }
        return path;
    }

    /**
     * Cases inconstructibles du couloir : le chemin élargi d'une case de part et
     * d'autre (distance de Chebyshev <= 1, diagonales comprises pour une bande
     * propre dans les virages d'éventuelles futures maps). L'élargissement
     * correspond à la bande de déplacement réelle des ennemis : ils avancent sur
     * plusieurs files (Enemy.laneOffset, +/-0.8 case perpendiculairement au
     * chemin), pas en file indienne sur la case centrale.
     */
    public Set<Position> corridorCells(GameMap map) {
        List<Position> path = findCorridorPath(map);
        Set<Position> cells = new HashSet<>();
        if (path == null) {
            return cells;
        }
        for (Position p : path) {
            for (int dx = -1; dx <= 1; dx++) {
                for (int dy = -1; dy <= 1; dy++) {
                    int nx = p.x() + dx;
                    int ny = p.y() + dy;
                    if (map.isValidPosition(nx, ny)) {
                        cells.add(new Position(nx, ny));
                    }
                }
            }
        }
        return cells;
    }

    /**
     * Calcule le chemin optimal (A*) de pathStart à pathEnd, en considérant les
     * tours comme des murs. Retourne null si aucun chemin n'existe.
     * Conservé pour un éventuel futur mode labyrinthe (voir hasPath) — la
     * production passe par findCorridorPath.
     */
    public List<Position> findPath(GameMap map) {
        return findPath(map, false);
    }

    private List<Position> findPath(GameMap map, boolean ignoreTowers) {
        return findPath(map, map.getPathStart(), map.getPathEnd(), ignoreTowers);
    }

    private List<Position> findPath(GameMap map, Position start, Position end, boolean ignoreTowers) {
        PriorityQueue<Node> open = new PriorityQueue<>(Comparator.comparingDouble(n -> n.f));
        Map<Position, Position> cameFrom = new HashMap<>();
        Map<Position, Double> gScore = new HashMap<>();

        gScore.put(start, 0.0);
        open.add(new Node(start, heuristic(start, end)));

        while (!open.isEmpty()) {
            Node current = open.poll();

            if (current.position.equals(end)) {
                return reconstructPath(cameFrom, current.position);
            }

            for (Position neighbor : getNeighbors(current.position, map, ignoreTowers)) {
                double tentativeG = gScore.getOrDefault(current.position, Double.MAX_VALUE) + 1;

                if (tentativeG < gScore.getOrDefault(neighbor, Double.MAX_VALUE)) {
                    cameFrom.put(neighbor, current.position);
                    gScore.put(neighbor, tentativeG);
                    double f = tentativeG + heuristic(neighbor, end);
                    open.add(new Node(neighbor, f));
                }
            }
        }

        return null; // Aucun chemin trouvé
    }

    private List<Position> getNeighbors(Position pos, GameMap map, boolean ignoreTowers) {
        int[][] directions = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};
        List<Position> neighbors = new ArrayList<>();

        for (int[] dir : directions) {
            int nx = pos.x() + dir[0];
            int ny = pos.y() + dir[1];

            if (map.isValidPosition(nx, ny) && (ignoreTowers || !map.isCellBlocked(nx, ny))) {
                neighbors.add(new Position(nx, ny));
            }
        }

        return neighbors;
    }

    private double heuristic(Position a, Position b) {
        // Distance de Manhattan
        return Math.abs(a.x() - b.x()) + Math.abs(a.y() - b.y());
    }

    private List<Position> reconstructPath(Map<Position, Position> cameFrom, Position current) {
        List<Position> path = new ArrayList<>();
        path.add(current);

        while (cameFrom.containsKey(current)) {
            current = cameFrom.get(current);
            path.add(0, current);
        }

        return path;
    }

    private record Node(Position position, double f) {}
}
