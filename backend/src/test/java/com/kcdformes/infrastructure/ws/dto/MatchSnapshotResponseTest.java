package com.kcdformes.infrastructure.ws.dto;

import com.kcdformes.domain.model.BonusType;
import com.kcdformes.domain.model.MapCatalog;
import com.kcdformes.domain.model.match.MatchGameState;
import com.kcdformes.domain.service.MatchEngine;
import com.kcdformes.domain.service.PathfindingService;
import com.kcdformes.infrastructure.web.dto.BonusOptionResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class MatchSnapshotResponseTest {

    private MatchGameState state;

    @BeforeEach
    void setUp() {
        state = new MatchEngine(new PathfindingService()).start(MapCatalog.buildMap("desert"));
    }

    @Test
    @DisplayName("Aucun bonus en attente : aucune option envoyée")
    void noPendingBonus_noOptions() {
        state.pendingBonuses = 0;

        MatchSnapshotResponse snap = MatchSnapshotResponse.fromState(state, "RUNNING");

        assertThat(snap.pendingBonuses()).isZero();
        assertThat(snap.bonusOptions()).isEmpty();
    }

    @Test
    @DisplayName("Bonus en attente : options du domaine, avec libellé et description du serveur")
    void pendingBonus_sendsDomainOptions() {
        state.pendingBonuses = 2;

        MatchSnapshotResponse snap = MatchSnapshotResponse.fromState(state, "RUNNING");

        assertThat(snap.pendingBonuses()).isEqualTo(2);
        assertThat(snap.bonusOptions()).extracting(BonusOptionResponse::type)
                .containsExactly(java.util.Arrays.stream(BonusType.values()).map(Enum::name).toArray(String[]::new));
        assertThat(snap.bonusOptions()).allSatisfy(option -> {
            assertThat(option.label()).isNotBlank();
            assertThat(option.description()).isNotBlank();
        });
    }
}
