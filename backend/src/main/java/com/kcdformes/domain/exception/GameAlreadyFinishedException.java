package com.kcdformes.domain.exception;

import java.util.UUID;

/**
 * Levée quand une action de jeu (pose/amélioration de tour, lancement de vague,
 * choix de bonus) est tentée sur une partie déjà terminée (statut != IN_PROGRESS).
 * Sans ce garde-fou, un joueur pouvait continuer à lancer des vagues après une
 * défaite et gonfler artificiellement son bestWave (progression de compte —
 * voir GameService.startWave), faussant le futur leaderboard.
 */
public class GameAlreadyFinishedException extends RuntimeException {

    public GameAlreadyFinishedException(UUID gameId, String status) {
        super("Game %s is already finished (status: %s)".formatted(gameId, status));
    }
}
