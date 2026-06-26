package com.kcdformes.domain.service;

import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.port.in.command.UpgradeTowerUseCase;
import com.kcdformes.domain.port.out.GameRepository;

import java.util.UUID;

public class UpgradeTowerService implements UpgradeTowerUseCase {

    private final GameRepository gameRepository;

    public UpgradeTowerService(GameRepository gameRepository) {
        this.gameRepository = gameRepository;
    }

    @Override
    public Tower upgradeTower(UpgradeTowerCommand command) {
        UUID gameId = command.gameId();

        GameMap map = gameRepository.findMapByGameId(gameId)
                .orElseThrow(() -> new IllegalArgumentException("Game not found: " + gameId));

        Tower tower = map.getTowerById(command.towerId())
                .orElseThrow(() -> new IllegalArgumentException("Tower not found: " + command.towerId()));

        // Note: la vérification/débit de l'or est gérée en amont par GameService.upgradeTower
        // (couche application), comme pour PlaceTowerService — ce service ne s'occupe que de
        // la mutation du domaine (incrémenter le niveau) et de la persistance de la map.
        tower.upgrade();
        gameRepository.saveMap(gameId, map);

        return tower;
    }
}
