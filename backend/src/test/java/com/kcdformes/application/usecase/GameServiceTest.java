package com.kcdformes.application.usecase;

import com.kcdformes.domain.exception.GameAlreadyFinishedException;
import com.kcdformes.domain.model.BonusType;
import com.kcdformes.domain.model.TowerType;
import com.kcdformes.domain.port.in.command.ChooseBonusUseCase.ChooseBonusCommand;
import com.kcdformes.domain.port.in.command.PlaceTowerUseCase.PlaceTowerCommand;
import com.kcdformes.domain.port.in.command.StartWaveUseCase.StartWaveCommand;
import com.kcdformes.domain.port.in.command.UpgradeTowerUseCase.UpgradeTowerCommand;
import com.kcdformes.domain.service.PathfindingService;
import com.kcdformes.domain.service.WaveFactory;
import com.kcdformes.domain.service.WaveSimulationService;
import com.kcdformes.infrastructure.persistence.entity.CastleEntity;
import com.kcdformes.infrastructure.persistence.entity.GameEntity;
import com.kcdformes.infrastructure.persistence.entity.PlayerEntity;
import com.kcdformes.infrastructure.persistence.mapper.GameMapMapper;
import com.kcdformes.infrastructure.persistence.repository.CastleJpaRepository;
import com.kcdformes.infrastructure.persistence.repository.GameJpaRepository;
import com.kcdformes.infrastructure.persistence.repository.GameRepositoryAdapter;
import com.kcdformes.infrastructure.persistence.repository.PlayerJpaRepository;
import com.kcdformes.infrastructure.persistence.repository.PlayerRepositoryAdapter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * Couvre les garde-fous transverses de GameService (et non la logique de jeu,
 * déjà testée au niveau domaine) :
 * - propriété de la partie (anti-IDOR, voir loadOwnedGame) : un joueur ne peut
 *   agir que sur ses propres parties, et une partie d'autrui est indistinguable
 *   d'une partie inexistante ;
 * - statut de la partie (voir requireInProgress) : aucune action de jeu n'est
 *   possible sur une partie terminée (sinon un joueur pouvait continuer à
 *   gonfler son bestWave après une défaite).
 */
@ExtendWith(MockitoExtension.class)
class GameServiceTest {

    @Mock GameJpaRepository gameJpaRepository;
    @Mock CastleJpaRepository castleJpaRepository;
    @Mock PlayerJpaRepository playerJpaRepository;
    @Mock GameMapMapper gameMapMapper;
    @Mock GameRepositoryAdapter gameRepositoryAdapter;
    @Mock PlayerRepositoryAdapter playerRepositoryAdapter;
    @Mock PathfindingService pathfindingService;
    @Mock WaveFactory waveFactory;
    @Mock WaveSimulationService waveSimulationService;

    @InjectMocks GameService gameService;

    private UUID gameId;
    private UUID ownerId;
    private UUID intruderId;
    private GameEntity game;

    @BeforeEach
    void setUp() {
        gameId = UUID.randomUUID();
        ownerId = UUID.randomUUID();
        intruderId = UUID.randomUUID();

        PlayerEntity owner = new PlayerEntity();
        owner.setId(ownerId);

        CastleEntity castle = new CastleEntity();

        game = new GameEntity();
        game.setId(gameId);
        game.setPlayer(owner);
        game.setCastle(castle);
        game.setStatus("IN_PROGRESS");
        game.setGold(500);
    }

    // --- Propriété de la partie (anti-IDOR) ---

    @Test
    @DisplayName("Un joueur ne peut pas poser de tour sur la partie d'un autre")
    void placeTower_notOwner_rejectedAsNotFound() {
        when(gameJpaRepository.findById(gameId)).thenReturn(Optional.of(game));

        assertThatThrownBy(() -> gameService.placeTower(
                new PlaceTowerCommand(gameId, intruderId, TowerType.ARCHER, 2, 6)))
                .isInstanceOf(IllegalArgumentException.class)
                // Même message que pour une partie inexistante : ne pas révéler
                // à l'intrus que cet UUID correspond à une vraie partie.
                .hasMessageContaining("Game not found");
    }

    @Test
    @DisplayName("Un joueur ne peut pas lancer de vague sur la partie d'un autre")
    void startWave_notOwner_rejectedAsNotFound() {
        when(gameJpaRepository.findById(gameId)).thenReturn(Optional.of(game));

        assertThatThrownBy(() -> gameService.startWave(new StartWaveCommand(gameId, intruderId)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Game not found");
    }

    @Test
    @DisplayName("Un joueur ne peut pas lire l'état de la partie d'un autre")
    void getGameState_notOwner_rejectedAsNotFound() {
        when(gameJpaRepository.findById(gameId)).thenReturn(Optional.of(game));

        assertThatThrownBy(() -> gameService.getGameState(gameId, intruderId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Game not found");
    }

    // --- Statut de la partie ---

    @Test
    @DisplayName("Impossible de lancer une vague sur une partie perdue")
    void startWave_finishedGame_rejected() {
        game.setStatus("DEFEAT");
        when(gameJpaRepository.findById(gameId)).thenReturn(Optional.of(game));

        assertThatThrownBy(() -> gameService.startWave(new StartWaveCommand(gameId, ownerId)))
                .isInstanceOf(GameAlreadyFinishedException.class);
    }

    @Test
    @DisplayName("Impossible de poser une tour sur une partie perdue")
    void placeTower_finishedGame_rejected() {
        game.setStatus("DEFEAT");
        when(gameJpaRepository.findById(gameId)).thenReturn(Optional.of(game));

        assertThatThrownBy(() -> gameService.placeTower(
                new PlaceTowerCommand(gameId, ownerId, TowerType.ARCHER, 2, 6)))
                .isInstanceOf(GameAlreadyFinishedException.class);
    }

    @Test
    @DisplayName("Impossible d'améliorer une tour sur une partie perdue")
    void upgradeTower_finishedGame_rejected() {
        game.setStatus("DEFEAT");
        when(gameJpaRepository.findById(gameId)).thenReturn(Optional.of(game));

        assertThatThrownBy(() -> gameService.upgradeTower(
                new UpgradeTowerCommand(gameId, ownerId, UUID.randomUUID())))
                .isInstanceOf(GameAlreadyFinishedException.class);
    }

    @Test
    @DisplayName("Impossible de choisir un bonus sur une partie perdue")
    void chooseBonus_finishedGame_rejected() {
        game.setStatus("DEFEAT");
        when(gameJpaRepository.findById(gameId)).thenReturn(Optional.of(game));

        assertThatThrownBy(() -> gameService.chooseBonus(
                new ChooseBonusCommand(gameId, ownerId, BonusType.GOLD_INJECTION)))
                .isInstanceOf(GameAlreadyFinishedException.class);
    }
}
