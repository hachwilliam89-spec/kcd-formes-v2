package com.kcdformes.infrastructure.ws.dto;

import com.kcdformes.domain.model.MapCatalog;
import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchGameState;
import com.kcdformes.domain.model.match.MatchMode;
import com.kcdformes.domain.model.match.MatchStatus;
import com.kcdformes.domain.service.MatchEngine;
import com.kcdformes.domain.service.PathfindingService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class MatchStateResponseTest {

    private final MatchEngine engine = new MatchEngine(new PathfindingService());

    private MatchGameState stateAtWave(int wave) {
        MatchGameState state = engine.start(MapCatalog.buildMap("desert"));
        state.wave = wave;
        return state;
    }

    @Test
    @DisplayName("Lobby : aucune vague")
    void lobby_waveIsZero() {
        Match match = new Match(UUID.randomUUID(), "ABCD", MatchMode.COOP);

        assertThat(MatchStateResponse.from(match).wave()).isZero();
    }

    @Test
    @DisplayName("Coop terminée : vague atteinte par le board partagé")
    void finishedCoop_exposesWaveReached() {
        Match match = new Match(UUID.randomUUID(), "ABCD", MatchMode.COOP);
        match.setGameState(stateAtWave(6));
        match.setStatus(MatchStatus.FINISHED);

        MatchStateResponse response = MatchStateResponse.from(match);

        assertThat(response.status()).isEqualTo("FINISHED");
        assertThat(response.wave()).isEqualTo(6);
    }

    @Test
    @DisplayName("Versus : la plus haute vague des deux boards")
    void versus_exposesHighestWave() {
        Match match = new Match(UUID.randomUUID(), "ABCD", MatchMode.VERSUS);
        match.setPlayerState(UUID.randomUUID(), stateAtWave(3));
        match.setPlayerState(UUID.randomUUID(), stateAtWave(5));

        assertThat(MatchStateResponse.from(match).wave()).isEqualTo(5);
    }
}
