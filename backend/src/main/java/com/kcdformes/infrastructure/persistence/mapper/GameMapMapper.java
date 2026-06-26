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
                        "hp", t.getHp()
                ))
                .toList();
        json.put("towers", towers);

        return json;
    }

    @SuppressWarnings("unchecked")
    public GameMap fromJson(Map<String, Object> json) {
        int width = (int) json.get("width");
        int height = (int) json.get("height");

        Map<String, Integer> startMap = (Map<String, Integer>) json.get("pathStart");
        Map<String, Integer> endMap = (Map<String, Integer>) json.get("pathEnd");

        Position pathStart = new Position(startMap.get("x"), startMap.get("y"));
        Position pathEnd = new Position(endMap.get("x"), endMap.get("y"));

        GameMap map = new GameMap(width, height, pathStart, pathEnd);

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
            map.placeTower(tower);
        }

        return map;
    }
}
