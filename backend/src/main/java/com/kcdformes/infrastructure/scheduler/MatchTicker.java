package com.kcdformes.infrastructure.scheduler;

import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchGameState;
import com.kcdformes.domain.model.match.MatchMode;
import com.kcdformes.domain.model.match.MatchPlayer;
import com.kcdformes.domain.model.match.MatchStatus;
import com.kcdformes.domain.port.out.MatchBroadcaster;
import com.kcdformes.domain.port.out.MatchRepository;
import com.kcdformes.domain.service.MatchEngine;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Boucle de jeu autoritaire (Jalon 3a) : à ~15 Hz, avance chaque match RUNNING
 * d'un tick puis diffuse un snapshot à ses joueurs. Un seul thread parcourt tous
 * les matchs → pas de course concurrente sur un même match (voir docs/MULTIPLAYER.md).
 */
@Component
public class MatchTicker {

    // Un tick live = un tick solo (SOLO_TICK_MS côté MatchEngine) : le combat se
    // transpose alors 1:1 depuis le solo (WaveSimulationService), sans mise à
    // l'échelle fractionnaire des dégâts. Le client interpole entre snapshots.
    private static final long TICK_MS = 120;

    private final MatchRepository matchRepository;
    private final MatchEngine matchEngine;
    private final MatchBroadcaster broadcaster;

    public MatchTicker(MatchRepository matchRepository, MatchEngine matchEngine, MatchBroadcaster broadcaster) {
        this.matchRepository = matchRepository;
        this.matchEngine = matchEngine;
        this.broadcaster = broadcaster;
    }

    @Scheduled(fixedRate = TICK_MS)
    public void tick() {
        for (Match match : matchRepository.findRunning()) {
            if (match.getMode() == MatchMode.VERSUS) tickVersus(match);
            else tickCoop(match);
        }
    }

    /** Coop : un board partagé ; fin quand le château commun tombe. */
    private void tickCoop(Match match) {
        MatchGameState state = match.getGameState();
        if (state == null) return;

        matchEngine.step(state, TICK_MS);
        broadcaster.broadcastGame(match);

        if (state.castleHp <= 0) {
            match.setStatus(MatchStatus.FINISHED);
            matchRepository.save(match);
            broadcaster.broadcastState(match); // fin de partie signalée sur le canal lobby
        }
    }

    /** Versus : un board par joueur avancé indépendamment ; le dernier château
     *  debout gagne (départage au score si les deux tombent le même tick). */
    private void tickVersus(Match match) {
        List<MatchPlayer> players = match.getPlayers();
        for (MatchPlayer p : players) {
            MatchGameState s = match.getPlayerState(p.getPlayerId());
            if (s == null || s.defeated) continue;
            matchEngine.step(s, TICK_MS);
            if (s.castleHp <= 0) s.defeated = true; // board figé, l'autre continue
        }
        broadcaster.broadcastVersus(match);

        // Fin de partie : au plus un survivant. Le gagnant est le survivant, ou —
        // si tous tombent le même tick — celui au meilleur score (ennemis tués).
        long alive = players.stream()
                .map(p -> match.getPlayerState(p.getPlayerId()))
                .filter(s -> s != null && !s.defeated)
                .count();
        if (alive <= 1) {
            match.setWinnerId(designateWinner(match, players));
            match.setStatus(MatchStatus.FINISHED);
            matchRepository.save(match);
            broadcaster.broadcastVersus(match);   // snapshot final (avec winnerId)
            broadcaster.broadcastState(match);     // fin signalée sur le canal lobby
        }
    }

    private UUID designateWinner(Match match, List<MatchPlayer> players) {
        MatchPlayer best = null;
        MatchGameState bestState = null;
        for (MatchPlayer p : players) {
            MatchGameState s = match.getPlayerState(p.getPlayerId());
            if (s == null) continue;
            // Survivant > vaincu ; à statut égal, meilleur score l'emporte.
            boolean better = bestState == null
                    || (!s.defeated && bestState.defeated)
                    || (s.defeated == bestState.defeated && s.enemiesKilled > bestState.enemiesKilled);
            if (better) { best = p; bestState = s; }
        }
        return best != null ? best.getPlayerId() : null;
    }
}
