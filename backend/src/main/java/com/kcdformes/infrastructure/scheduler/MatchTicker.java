package com.kcdformes.infrastructure.scheduler;

import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchGameState;
import com.kcdformes.domain.model.match.MatchStatus;
import com.kcdformes.domain.port.out.MatchBroadcaster;
import com.kcdformes.domain.port.out.MatchRepository;
import com.kcdformes.domain.service.MatchEngine;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Boucle de jeu autoritaire (Jalon 3a) : à ~15 Hz, avance chaque match RUNNING
 * d'un tick puis diffuse un snapshot à ses joueurs. Un seul thread parcourt tous
 * les matchs → pas de course concurrente sur un même match (voir docs/MULTIPLAYER.md).
 */
@Component
public class MatchTicker {

    private static final long TICK_MS = 66; // ~15 Hz

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
            MatchGameState state = match.getGameState();
            if (state == null) continue;

            matchEngine.step(state, TICK_MS);
            broadcaster.broadcastGame(match);

            if (state.castleHp <= 0) {
                match.setStatus(MatchStatus.FINISHED);
                matchRepository.save(match);
                broadcaster.broadcastState(match); // fin de partie signalée sur le canal lobby
            }
        }
    }
}
