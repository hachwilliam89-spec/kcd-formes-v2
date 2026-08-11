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
        // Compat / carte mono-voie : le chemin de la voie de référence (voie 0).
        return corridorPathFor(map, map.getWaypoints());
    }

    /**
     * Un chemin rasterisé par voie (carte multi-voies). Une carte classique
     * renvoie une liste d'un seul chemin. Null si une voie est infranchissable.
     */
    public List<List<Position>> findLanePaths(GameMap map) {
        List<List<Position>> paths = new ArrayList<>();
        for (List<Position> lane : map.getLanes()) {
            List<Position> path = corridorPathFor(map, lane);
            if (path == null) {
                return null;
            }
            paths.add(path);
        }
        return paths;
    }

    /**
     * Rasterise une voie : le chemin passe par tous ses waypoints dans l'ordre —
     * segment A* (en ignorant les tours) entre chaque paire consécutive, concaténés.
     * Deux waypoints alignés donnent un segment droit ; un serpentin donne le tracé
     * sinueux.
     */
    private List<Position> corridorPathFor(GameMap map, List<Position> waypoints) {
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
        Set<Position> cells = new HashSet<>();
        List<List<Position>> lanePaths = findLanePaths(map);
        if (lanePaths == null) {
            return cells;
        }
        // Union des voies, chacune élargie de corridorHalfWidth (Chebyshev). Sur
        // une carte multi-voies fines (halfWidth 0), le couloir se réduit aux
        // seules cases de chemin, libérant du terrain constructible entre les voies.
        int w = map.getCorridorHalfWidth();
        for (List<Position> path : lanePaths) {
            for (Position p : path) {
                for (int dx = -w; dx <= w; dx++) {
                    for (int dy = -w; dy <= w; dy++) {
                        int nx = p.x() + dx;
                        int ny = p.y() + dy;
                        if (map.isValidPosition(nx, ny)) {
                            cells.add(new Position(nx, ny));
                        }
                    }
                }
            }
        }
        return cells;
    }

    /**
     * Largeur (en cases) de la BANDE CONSTRUCTIBLE au bord des routes : on ne peut
     * poser une tour QUE sur une case à cette distance (Chebyshev) du couloir. Au-delà,
     * la case est une « zone morte » réservée au décor — décision de design : le
     * placement doit rester pertinent (à portée d'une route), pas éparpillé sur tout
     * le champ. DOIT rester synchronisé avec le front (constants.ts BUILD_BAND).
     */
    public static final int BUILD_BAND = 1;

    /**
     * Marge (Chebyshev) autour de CHAQUE entrée ennemie où l'on ne peut pas bâtir :
     * on ne construit pas à la porte de l'ennemi, et ça dégage le bord de spawn.
     * DOIT rester synchronisé avec le front (constants.ts SPAWN_NOBUILD).
     */
    public static final int SPAWN_NOBUILD = 2;

    /**
     * Cases CONSTRUCTIBLES : la bande de BUILD_BAND cases qui longe le couloir (hors
     * couloir lui-même), SAUF autour des entrées ennemies (voir SPAWN_NOBUILD). Tout
     * le reste est zone morte (décor), inconstructible.
     */
    public Set<Position> buildableCells(GameMap map) {
        Set<Position> corridor = corridorCells(map);
        // Entrées ennemies = départ de chaque voie (première case).
        List<Position> starts = new ArrayList<>();
        for (List<Position> lane : map.getLanes()) {
            starts.add(lane.get(0));
        }
        Set<Position> buildable = new HashSet<>();
        for (Position c : corridor) {
            for (int dx = -BUILD_BAND; dx <= BUILD_BAND; dx++) {
                for (int dy = -BUILD_BAND; dy <= BUILD_BAND; dy++) {
                    int nx = c.x() + dx;
                    int ny = c.y() + dy;
                    Position p = new Position(nx, ny);
                    if (map.isValidPosition(nx, ny) && !corridor.contains(p) && !nearAnyStart(p, starts)) {
                        buildable.add(p);
                    }
                }
            }
        }
        return buildable;
    }

    private boolean nearAnyStart(Position p, List<Position> starts) {
        for (Position s : starts) {
            if (Math.max(Math.abs(p.x() - s.x()), Math.abs(p.y() - s.y())) <= SPAWN_NOBUILD) {
                return true;
            }
        }
        return false;
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
