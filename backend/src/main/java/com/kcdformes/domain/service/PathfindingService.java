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
     * Utilisé pour valider qu'un placement de tour ne bloque pas complètement le passage.
     */
    public boolean hasPath(GameMap map) {
        return findPath(map) != null;
    }

    /**
     * Calcule le chemin optimal (A*) de pathStart à pathEnd.
     * Retourne null si aucun chemin n'existe.
     */
    public List<Position> findPath(GameMap map) {
        Position start = map.getPathStart();
        Position end = map.getPathEnd();

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

            for (Position neighbor : getNeighbors(current.position, map)) {
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

    private List<Position> getNeighbors(Position pos, GameMap map) {
        int[][] directions = {{0, 1}, {0, -1}, {1, 0}, {-1, 0}};
        List<Position> neighbors = new ArrayList<>();

        for (int[] dir : directions) {
            int nx = pos.x() + dir[0];
            int ny = pos.y() + dir[1];

            if (map.isValidPosition(nx, ny) && !map.isCellBlocked(nx, ny)) {
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
