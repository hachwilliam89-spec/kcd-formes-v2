package com.kcdformes.infrastructure.web.controller;

import com.kcdformes.domain.port.in.query.GetMapLayoutUseCase;
import com.kcdformes.infrastructure.web.dto.MapLayoutResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Catalogue des cartes et leur disposition statique. Les clients (Godot, web)
 * s'en servent pour dessiner la carte et l'aperçu de pose sans recopier les
 * règles du domaine.
 */
@RestController
@RequestMapping("/api/v1/maps")
public class MapController {

    private final GetMapLayoutUseCase getMapLayoutUseCase;

    public MapController(GetMapLayoutUseCase getMapLayoutUseCase) {
        this.getMapLayoutUseCase = getMapLayoutUseCase;
    }

    @GetMapping
    public ResponseEntity<List<String>> listMaps() {
        return ResponseEntity.ok(getMapLayoutUseCase.listMapIds());
    }

    @GetMapping("/{mapId}")
    public ResponseEntity<MapLayoutResponse> getLayout(@PathVariable String mapId) {
        return ResponseEntity.ok(MapLayoutResponse.from(getMapLayoutUseCase.getLayout(mapId)));
    }
}
