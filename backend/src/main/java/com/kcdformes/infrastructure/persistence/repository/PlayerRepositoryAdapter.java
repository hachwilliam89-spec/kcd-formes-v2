package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.domain.port.out.PlayerRepository;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/**
 * Adapter pattern — adapte le port out PlayerRepository vers JPA.
 */
@Component
public class PlayerRepositoryAdapter implements PlayerRepository {

    private final PlayerJpaRepository playerJpaRepository;

    public PlayerRepositoryAdapter(PlayerJpaRepository playerJpaRepository) {
        this.playerJpaRepository = playerJpaRepository;
    }

    @Override
    public Optional<PlayerData> findById(UUID id) {
        return playerJpaRepository.findById(id)
                .map(p -> new PlayerData(p.getId(), p.getUsername(), p.getElo()));
    }

    @Override
    public void updateElo(UUID playerId, int newElo) {
        playerJpaRepository.findById(playerId).ifPresent(p -> {
            p.setElo(newElo);
            playerJpaRepository.save(p);
        });
    }
}
