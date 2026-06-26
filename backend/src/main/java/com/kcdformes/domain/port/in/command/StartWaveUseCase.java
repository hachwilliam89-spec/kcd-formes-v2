package com.kcdformes.domain.port.in.command;

import com.kcdformes.domain.model.BonusType;
import com.kcdformes.domain.model.Wave;
import com.kcdformes.domain.service.WaveSimulationService.TickSnapshot;

import java.util.List;
import java.util.UUID;

public interface StartWaveUseCase {

    record StartWaveCommand(UUID gameId) {}

    /**
     * Résultat complet d'une vague : la vague elle-même (statut, or gagné),
     * le journal tick par tick de la simulation (pour l'animation côté client),
     * et l'état du château après la vague.
     *
     * awaitingBonusChoice / availableBonuses : non vides uniquement si cette vague
     * est un palier (toutes les 5 vagues, voir GameService.startWave) — le joueur
     * doit alors choisir un bonus (voir ChooseBonusUseCase) avant de pouvoir
     * relancer une vague.
     */
    record StartWaveResult(
            Wave wave,
            List<TickSnapshot> ticks,
            int goldEarned,
            int castleHp,
            int castleMaxHp,
            int castleDamageTaken,
            boolean castleDestroyed,
            String gameStatus,
            boolean awaitingBonusChoice,
            List<BonusType> availableBonuses
    ) {}

    StartWaveResult startWave(StartWaveCommand command);
}
