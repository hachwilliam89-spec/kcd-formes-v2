package com.kcdformes.application.usecase;

import com.kcdformes.domain.port.in.query.GetLeaderboardUseCase.LeaderboardResult;
import com.kcdformes.infrastructure.persistence.entity.PlayerEntity;
import com.kcdformes.infrastructure.persistence.repository.PlayerJpaRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class LeaderboardServiceTest {

    @Mock PlayerJpaRepository playerJpaRepository;

    @InjectMocks LeaderboardService leaderboardService;

    private PlayerEntity alice;
    private PlayerEntity bob;
    private PlayerEntity carol;

    private static PlayerEntity player(String username, int bestWave) {
        PlayerEntity p = new PlayerEntity();
        p.setId(UUID.randomUUID());
        p.setUsername(username);
        p.setBestWave(bestWave);
        return p;
    }

    @BeforeEach
    void setUp() {
        alice = player("alice", 17);
        bob = player("bob", 12);
        carol = player("carol", 4);
    }

    @Test
    @DisplayName("Le top est ordonné par meilleure vague, rangs 1..n")
    void getLeaderboard_ranksTopPlayers() {
        when(playerJpaRepository.findAllByOrderByBestWaveDescUsernameAsc(any(PageRequest.class)))
                .thenReturn(List.of(alice, bob, carol));
        when(playerJpaRepository.findById(alice.getId())).thenReturn(Optional.of(alice));
        when(playerJpaRepository.countByBestWaveGreaterThan(17)).thenReturn(0L);

        LeaderboardResult result = leaderboardService.getLeaderboard(alice.getId(), 10);

        assertThat(result.top()).extracting("rank", "username", "bestWave")
                .containsExactly(
                        org.assertj.core.groups.Tuple.tuple(1, "alice", 17),
                        org.assertj.core.groups.Tuple.tuple(2, "bob", 12),
                        org.assertj.core.groups.Tuple.tuple(3, "carol", 4));
        assertThat(result.me().rank()).isEqualTo(1);
    }

    @Test
    @DisplayName("Un joueur hors du top reçoit quand même son rang global (rang de compétition)")
    void getLeaderboard_playerOutsideTop_stillGetsOwnRank() {
        when(playerJpaRepository.findAllByOrderByBestWaveDescUsernameAsc(any(PageRequest.class)))
                .thenReturn(List.of(alice, bob));
        when(playerJpaRepository.findById(carol.getId())).thenReturn(Optional.of(carol));
        // 41 joueurs strictement meilleurs que carol => rang 42.
        when(playerJpaRepository.countByBestWaveGreaterThan(4)).thenReturn(41L);

        LeaderboardResult result = leaderboardService.getLeaderboard(carol.getId(), 2);

        assertThat(result.top()).hasSize(2);
        assertThat(result.me().rank()).isEqualTo(42);
        assertThat(result.me().username()).isEqualTo("carol");
        assertThat(result.me().bestWave()).isEqualTo(4);
    }

    @Test
    @DisplayName("La limite demandée est bornée (pas d'export de la table players)")
    void getLeaderboard_capsRequestedLimit() {
        when(playerJpaRepository.findAllByOrderByBestWaveDescUsernameAsc(any(PageRequest.class)))
                .thenAnswer(inv -> {
                    PageRequest page = inv.getArgument(0);
                    assertThat(page.getPageSize()).isLessThanOrEqualTo(50);
                    return List.of();
                });
        when(playerJpaRepository.findById(any(UUID.class))).thenReturn(Optional.empty());

        LeaderboardResult result = leaderboardService.getLeaderboard(UUID.randomUUID(), 9999);

        assertThat(result.top()).isEmpty();
        assertThat(result.me()).isNull();
    }
}
