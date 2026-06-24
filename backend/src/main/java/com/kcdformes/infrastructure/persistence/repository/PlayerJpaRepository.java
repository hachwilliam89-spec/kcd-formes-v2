package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.infrastructure.persistence.entity.PlayerEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PlayerJpaRepository extends JpaRepository<PlayerEntity, UUID> {
    Optional<PlayerEntity> findByUsername(String username);
    Optional<PlayerEntity> findByEmail(String email);
    boolean existsByUsername(String username);
    boolean existsByEmail(String email);
}
