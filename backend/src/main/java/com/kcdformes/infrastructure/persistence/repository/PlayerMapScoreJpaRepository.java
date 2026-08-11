package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.infrastructure.persistence.entity.PlayerMapScoreEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlayerMapScoreJpaRepository extends JpaRepository<PlayerMapScoreEntity, UUID> {

    /** Score d'un joueur sur une carte (pour l'upsert et le rang « me »). */
    Optional<PlayerMapScoreEntity> findByPlayer_IdAndMapId(UUID playerId, String mapId);

    /** Top d'une carte : meilleure vague décroissante (username en départage stable). */
    @Query("SELECT s FROM PlayerMapScoreEntity s JOIN FETCH s.player p "
            + "WHERE s.mapId = :mapId ORDER BY s.bestWave DESC, p.username ASC")
    List<PlayerMapScoreEntity> findTopByMap(@Param("mapId") String mapId, Pageable pageable);

    /** Nombre de joueurs strictement meilleurs sur la carte — pour le rang « me ». */
    long countByMapIdAndBestWaveGreaterThan(String mapId, int bestWave);
}
