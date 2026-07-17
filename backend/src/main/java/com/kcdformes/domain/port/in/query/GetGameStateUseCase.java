package com.kcdformes.domain.port.in.query;

import com.kcdformes.domain.model.BonusType;
import com.kcdformes.domain.model.GameMap;

import java.util.List;
import java.util.UUID;

public interface GetGameStateUseCase {

    // awaitingBonusChoice : permet au frontend de re-proposer le choix de bonus
    // après un rechargement de page survenu pendant qu'un palier était en attente
    // (voir GameEntity.awaitingBonusChoice / ChooseBonusUseCase).
    // availableBonuses : les options à proposer dans ce cas — sans elles, un
    // rechargement pendant un palier rouvrait une modale de choix VIDE (la liste
    // n'arrivait auparavant que dans la réponse de vague), bloquant la partie.
    record GameStateResult(UUID gameId, UUID castleId, GameMap map, int waveNumber, int gold, String status,
                            int castleHp, int castleMaxHp, boolean awaitingBonusChoice,
                            List<BonusType> availableBonuses) {}

    // playerId : identité du joueur authentifié — l'état d'une partie n'est visible
    // que par son propriétaire (voir GameService.loadOwnedGame).
    GameStateResult getGameState(UUID gameId, UUID playerId);
}
