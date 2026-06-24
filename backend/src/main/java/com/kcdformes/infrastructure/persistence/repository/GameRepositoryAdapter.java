package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.port.out.GameRepository;
import com.kcdformes.infrastructure.persistence.entity.CastleEntity;
import com.kcdformes.infrastructure.persistence.mapper.GameMapMapper;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/**
 * Adapter pattern — adapte le port out GameRepository vers la persistence JPA.
 * Le domaine ne connaît pas JPA, il ne voit que l'interface GameRepository.
 */
@Component
public class GameRepositoryAdapter implements GameRepository {

    private final CastleJpaRepository castleJpaRepository;
    private final GameMapMapper gameMapMapper;

    public GameRepositoryAdapter(CastleJpaRepository castleJpaRepository,
                                  GameMapMapper gameMapMapper) {
        this.castleJpaRepository = castleJpaRepository;
        this.gameMapMapper = gameMapMapper;
    }

    @Override
    public Optional<GameMap> findMapByGameId(UUID gameId) {
        return castleJpaRepository.findById(gameId)
                .map(castle -> gameMapMapper.fromJson(castle.getMapState()));
    }

    @Override
    public void saveMap(UUID gameId, GameMap map) {
        castleJpaRepository.findById(gameId).ifPresent(castle -> {
            castle.setMapState(gameMapMapper.toJson(map));
            castleJpaRepository.save(castle);
        });
    }
}
