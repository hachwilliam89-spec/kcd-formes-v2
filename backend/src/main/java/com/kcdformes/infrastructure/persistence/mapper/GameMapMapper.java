package com.kcdformes.infrastructure.persistence.mapper;

import com.kcdformes.domain.model.*;
import tools.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * Convertit GameMap (domaine) ↔ Map<String, Object> (JSONB PostgreSQL).
 */
@Component
public class GameMapMapper {

    private final ObjectMapper objectMapper;

    public GameMapMapper(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public Map<String, Object> toJson(GameMap map) {
        Map<String, Object> json = new HashMap<>();
        json.put("width", map.getWidth());
        json.put("height", map.getHeight());
        json.put("pathStart", Map.of("x", map.getPathStart().x(), "y", map.getPathStart().y()));
        json.put("pathEnd", Map.of("x", map.getPathEnd().x(), "y", map.getPathEnd().y()));
        // Tracé complet (waypoints) : nécessaire pour reconstruire un chemin
        // sinueux. pathStart/pathEnd restent écrits pour compat/lecture rapide.
        // waypoints = voie de référence (voie 0), conservé pour la relecture par
        // les parties d'avant le multi-voies.
        json.put("waypoints", map.getWaypoints().stream()
                .map(p -> Map.of("x", p.x(), "y", p.y()))
                .toList());
        // Toutes les voies (carte multi-voies) + largeur de couloir : reconstruisent
        // fidèlement une carte à plusieurs tracés. Une carte mono-voie écrit une
        // liste d'un élément (identique à waypoints).
        json.put("lanes", map.getLanes().stream()
                .map(lane -> lane.stream()
                        .map(p -> Map.of("x", p.x(), "y", p.y()))
                        .toList())
                .toList());
        json.put("corridorHalfWidth", map.getCorridorHalfWidth());

        List<Map<String, Object>> towers = map.getTowers().stream()
                .map(t -> Map.of(
                        "id", (Object) t.getId().toString(),
                        "x", t.getX(),
                        "y", t.getY(),
                        "type", t.getType().name(),
                        "level", t.getLevel(),
                        // PV courants de la structure (voir Tower.hp) : une tour endommagée
                        // par un Sapeur sans être détruite doit le rester après un
                        // rechargement de la map, pas revenir à pleine vie.
                        "hp", t.getHp(),
                        // Choix du joueur (voir TargetingMode) : doit survivre aux
                        // vagues et aux rechargements, comme le niveau.
                        "targetingMode", t.getTargetingMode().name()
                ))
                .toList();
        json.put("towers", towers);

        return json;
    }

    @SuppressWarnings("unchecked")
    public GameMap fromJson(Map<String, Object> json) {
        int width = (int) json.get("width");
        int height = (int) json.get("height");

        // Priorité au format multi-voies (lanes) ; puis tracé sinueux mono-voie
        // (waypoints) ; puis fallback couloir droit (pathStart/pathEnd) pour les
        // parties persistées avant ces formats.
        List<List<Map<String, Number>>> rawLanes = (List<List<Map<String, Number>>>) json.get("lanes");
        List<Map<String, Number>> rawWaypoints = (List<Map<String, Number>>) json.get("waypoints");
        GameMap map;
        if (rawLanes != null && !rawLanes.isEmpty()) {
            List<List<Position>> lanes = rawLanes.stream()
                    .map(lane -> lane.stream()
                            .map(w -> new Position(w.get("x").intValue(), w.get("y").intValue()))
                            .toList())
                    .toList();
            Object rawHw = json.get("corridorHalfWidth");
            int halfWidth = rawHw != null ? ((Number) rawHw).intValue() : 1;
            map = GameMap.ofLanes(width, height, lanes, halfWidth);
        } else if (rawWaypoints != null && rawWaypoints.size() >= 2) {
            List<Position> waypoints = rawWaypoints.stream()
                    .map(w -> new Position(w.get("x").intValue(), w.get("y").intValue()))
                    .toList();
            map = new GameMap(width, height, waypoints);
        } else {
            Map<String, Integer> startMap = (Map<String, Integer>) json.get("pathStart");
            Map<String, Integer> endMap = (Map<String, Integer>) json.get("pathEnd");
            Position pathStart = new Position(startMap.get("x"), startMap.get("y"));
            Position pathEnd = new Position(endMap.get("x"), endMap.get("y"));
            map = new GameMap(width, height, pathStart, pathEnd);
        }

        List<Map<String, Object>> towers = (List<Map<String, Object>>) json.getOrDefault("towers", List.of());
        for (Map<String, Object> t : towers) {
            TowerType type = TowerType.valueOf((String) t.get("type"));
            int x = (int) t.get("x");
            int y = (int) t.get("y");
            int level = (int) t.get("level");
            // Réutilise l'id persisté pour que les damageEvents de la simulation
            // (towerId) restent réconciliables avec les tours déjà connues du
            // frontend (TowerResponse renvoyé à la pose) — sinon chaque rechargement
            // depuis la base invente un nouvel id et casse tout rendu d'effet côté
            // client (voir GameScene.drawEffects). Fallback sur un id aléatoire
            // uniquement pour les parties déjà persistées avant ce correctif.
            Object rawId = t.get("id");
            UUID id = rawId != null ? UUID.fromString((String) rawId) : UUID.randomUUID();

            // Fallback pleine vie pour les parties déjà persistées avant l'ajout du
            // champ hp (mécanique Sapeur) — sinon une NPE/cast invalide casserait le
            // chargement de toute partie existante créée avant ce correctif.
            Object rawHp = t.get("hp");
            Tower tower = rawHp != null
                    ? new Tower(id, type, x, y, level, ((Number) rawHp).intValue())
                    : new Tower(id, type, x, y, level);

            // Fallback CLOSEST (défaut du constructeur) pour les parties
            // persistées avant l'introduction des modes de ciblage.
            Object rawMode = t.get("targetingMode");
            if (rawMode != null) {
                tower.setTargetingMode(TargetingMode.valueOf((String) rawMode));
            }
            map.placeTower(tower);
        }

        return map;
    }
}
