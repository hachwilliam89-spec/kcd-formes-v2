package com.kcdformes.domain.port.in.query;

import com.kcdformes.domain.model.WavePreview;

import java.util.UUID;

public interface GetWavePreviewUseCase {

    // Aperçu de la PROCHAINE vague de la partie (types, nouveautés, Boss), calculé
    // avec le seed de la partie : c'est exactement la vague que startWave jouera.
    // playerId : visible seulement par le propriétaire (voir GameService.loadOwnedGame).
    WavePreview getNextWavePreview(UUID gameId, UUID playerId);
}
