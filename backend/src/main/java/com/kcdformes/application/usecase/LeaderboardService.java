package com.kcdformes.application.usecase;

import com.kcdformes.domain.model.MapCatalog;
import com.kcdformes.domain.port.in.query.GetLeaderboardUseCase;
import com.kcdformes.infrastructure.persistence.entity.PlayerEntity;
import com.kcdformes.infrastructure.persistence.entity.PlayerMapScoreEntity;
import com.kcdformes.infrastructure.persistence.repository.PlayerJpaRepository;
import com.kcdformes.infrastructure.persistence.repository.PlayerMapScoreJpaRepository;
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
    private final PlayerMapScoreJpaRepository playerMapScoreRepository;

    public LeaderboardService(PlayerJpaRepository playerJpaRepository,
                              PlayerMapScoreJpaRepository playerMapScoreRepository) {
        this.playerJpaRepository = playerJpaRepository;
        this.playerMapScoreRepository = playerMapScoreRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public LeaderboardResult getLeaderboard(UUID requestingPlayerId, String mapId, int limit) {
        int cappedLimit = Math.max(1, Math.min(limit, MAX_LIMIT));

        // Classement PAR CARTE : mapId renseigné (et pas "global").
        if (mapId != null && !mapId.isBlank() && !"global".equalsIgnoreCase(mapId)) {
            return mapLeaderboard(requestingPlayerId, MapCatalog.normalize(mapId), cappedLimit);
        }

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

    /** Classement d'une carte donnée (table player_map_score). */
    private LeaderboardResult mapLeaderboard(UUID requestingPlayerId, String mapId, int cappedLimit) {
        List<PlayerMapScoreEntity> rows = playerMapScoreRepository
                .findTopByMap(mapId, PageRequest.of(0, cappedLimit));
        List<LeaderboardEntry> top = new java.util.ArrayList<>(rows.size());
        for (int i = 0; i < rows.size(); i++) {
            PlayerMapScoreEntity s = rows.get(i);
            top.add(new LeaderboardEntry(i + 1, s.getPlayer().getId(), s.getPlayer().getUsername(), s.getBestWave()));
        }

        // me : rang du demandeur SUR CETTE CARTE (null s'il n'y a jamais joué).
        LeaderboardEntry me = playerMapScoreRepository
                .findByPlayer_IdAndMapId(requestingPlayerId, mapId)
                .map(s -> new LeaderboardEntry(
                        (int) playerMapScoreRepository.countByMapIdAndBestWaveGreaterThan(mapId, s.getBestWave()) + 1,
                        s.getPlayer().getId(), s.getPlayer().getUsername(), s.getBestWave()))
                .orElse(null);

        return new LeaderboardResult(top, me);
    }
}
