package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.infrastructure.persistence.entity.GameEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface GameJpaRepository extends JpaRepository<GameEntity, UUID> {
    List<GameEntity> findAllByPlayerIdOrderByStartedAtDesc(UUID playerId);
}
