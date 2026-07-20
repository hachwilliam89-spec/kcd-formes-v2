package com.kcdformes.application.usecase;

import com.kcdformes.domain.port.in.query.GetLeaderboardUseCase;
import com.kcdformes.infrastructure.persistence.entity.PlayerEntity;
import com.kcdformes.infrastructure.persistence.repository.PlayerJpaRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class LeaderboardService implements GetLeaderboardUseCase {

    /** Borne haute du top demandable : un leaderboard n'est pas un export de la table players. */
    private static final int MAX_LIMIT = 50;

    private final PlayerJpaRepository playerJpaRepository;

    public LeaderboardService(PlayerJpaRepository playerJpaRepository) {
        this.playerJpaRepository = playerJpaRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public LeaderboardResult getLeaderboard(UUID requestingPlayerId, int limit) {
        int cappedLimit = Math.max(1, Math.min(limit, MAX_LIMIT));

        List<PlayerEntity> topPlayers = playerJpaRepository
                .findAllByOrderByBestWaveDescUsernameAsc(PageRequest.of(0, cappedLimit));

        // Rang = position dans la liste triée (1-based). Pour les ex æquo, le
        // rang affiché dans le top suit l'ordre stable du tri (username) ; le
        // rang de `me` est lui calculé en rang de compétition (1 + nombre de
        // joueurs strictement meilleurs) — les deux coïncident pour le premier
        // des ex æquo, et l'écart d'affichage éventuel entre ex æquo du top est
        // assumé plutôt que de payer un calcul de rang par ligne.
        List<LeaderboardEntry> top = new java.util.ArrayList<>(topPlayers.size());
        for (int i = 0; i < topPlayers.size(); i++) {
            PlayerEntity p = topPlayers.get(i);
            top.add(new LeaderboardEntry(i + 1, p.getId(), p.getUsername(), p.getBestWave()));
        }

        LeaderboardEntry me = playerJpaRepository.findById(requestingPlayerId)
                .map(p -> new LeaderboardEntry(
                        (int) playerJpaRepository.countByBestWaveGreaterThan(p.getBestWave()) + 1,
                        p.getId(), p.getUsername(), p.getBestWave()))
                .orElse(null);

        return new LeaderboardResult(top, me);
    }
}
