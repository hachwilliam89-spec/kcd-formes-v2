package com.kcdformes.infrastructure.web.controller;

import com.kcdformes.domain.port.in.query.GetLeaderboardUseCase;
import com.kcdformes.infrastructure.web.dto.LeaderboardResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/leaderboard")
public class LeaderboardController {

    private final GetLeaderboardUseCase getLeaderboardUseCase;

    public LeaderboardController(GetLeaderboardUseCase getLeaderboardUseCase) {
        this.getLeaderboardUseCase = getLeaderboardUseCase;
    }

    /**
     * Top des joueurs par meilleure vague + rang du joueur authentifié (champ
     * `me`, présent même hors du top). La limite est bornée côté service.
     */
    @GetMapping
    public ResponseEntity<LeaderboardResponse> getLeaderboard(
            @RequestParam(defaultValue = "10") int limit,
            @RequestParam(required = false) String mapId,
            Authentication auth) {
        UUID playerId = UUID.fromString(auth.getName());
        return ResponseEntity.ok(
                LeaderboardResponse.from(getLeaderboardUseCase.getLeaderboard(playerId, mapId, limit)));
    }
}
