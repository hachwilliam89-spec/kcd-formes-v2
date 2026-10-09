package com.kcdformes.infrastructure.web.controller;

import com.kcdformes.domain.port.in.query.GetTowerCatalogUseCase;
import com.kcdformes.infrastructure.web.dto.TowerSpecResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Catalogue des tours (coût, déblocage, règle de pose, stats par niveau).
 * Les clients (Godot, web) s'en servent pour la barre de construction et les
 * fiches de tour sans recopier les valeurs du domaine.
 */
@RestController
@RequestMapping("/api/v1/towers")
public class TowerController {

    private final GetTowerCatalogUseCase getTowerCatalogUseCase;

    public TowerController(GetTowerCatalogUseCase getTowerCatalogUseCase) {
        this.getTowerCatalogUseCase = getTowerCatalogUseCase;
    }

    @GetMapping
    public ResponseEntity<List<TowerSpecResponse>> listTowers() {
        return ResponseEntity.ok(getTowerCatalogUseCase.listTowers().stream()
                .map(TowerSpecResponse::from)
                .toList());
    }
}
