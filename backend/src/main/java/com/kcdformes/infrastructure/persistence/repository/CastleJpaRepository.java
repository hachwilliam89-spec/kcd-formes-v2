package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.infrastructure.persistence.entity.CastleEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface CastleJpaRepository extends JpaRepository<CastleEntity, UUID> {
    Optional<CastleEntity> findByPlayerIdAndId(UUID playerId, UUID castleId);
    List<CastleEntity> findAllByPlayerId(UUID playerId);
}
