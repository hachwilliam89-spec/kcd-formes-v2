package com.kcdformes.infrastructure.web.controller;

import com.kcdformes.application.usecase.AuthService;
import com.kcdformes.infrastructure.web.dto.PlayerProfileResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/players")
public class PlayerController {

    private final AuthService authService;

    public PlayerController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/me")
    public ResponseEntity<PlayerProfileResponse> me(Authentication auth) {
        UUID playerId = UUID.fromString(auth.getName());
        return ResponseEntity.ok(authService.getProfile(playerId));
    }
}
