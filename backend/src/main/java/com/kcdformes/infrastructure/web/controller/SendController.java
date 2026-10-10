package com.kcdformes.infrastructure.web.controller;

import com.kcdformes.domain.port.in.query.GetSendCatalogUseCase;
import com.kcdformes.infrastructure.web.dto.SendSpecResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Catalogue des envois du versus (coût, revenu passif). Les clients (Godot,
 * web) s'en servent pour la barre d'envoi sans recopier les valeurs du domaine.
 * L'envoi lui-même reste une intention STOMP (/app/match/{id}/send).
 */
@RestController
@RequestMapping("/api/v1/versus/sends")
public class SendController {

    private final GetSendCatalogUseCase getSendCatalogUseCase;

    public SendController(GetSendCatalogUseCase getSendCatalogUseCase) {
        this.getSendCatalogUseCase = getSendCatalogUseCase;
    }

    @GetMapping
    public ResponseEntity<List<SendSpecResponse>> listSends() {
        return ResponseEntity.ok(getSendCatalogUseCase.listSends().stream()
                .map(SendSpecResponse::from)
                .toList());
    }
}
