package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.infrastructure.persistence.entity.PlayerEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface PlayerJpaRepository extends JpaRepository<PlayerEntity, UUID> {
    Optional<PlayerEntity> findByUsername(String username);
    Optional<PlayerEntity> findByEmail(String email);
    boolean existsByUsername(String username);
    boolean existsByEmail(String email);

    // Leaderboard (voir LeaderboardService) : tri secondaire par username pour
    // un ordre STABLE entre deux appels à bestWave égale — sans lui, deux
    // joueurs ex æquo pouvaient permuter d'un affichage à l'autre.
    List<PlayerEntity> findAllByOrderByBestWaveDescUsernameAsc(Pageable pageable);

    /** Nombre de joueurs strictement meilleurs : rang = count + 1 (rang de compétition, les ex æquo partagent le rang). */
    long countByBestWaveGreaterThan(int bestWave);
}
