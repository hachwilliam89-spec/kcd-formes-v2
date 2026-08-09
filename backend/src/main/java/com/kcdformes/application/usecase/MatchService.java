package com.kcdformes.application.usecase;

import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchMode;
import com.kcdformes.domain.model.match.MatchPlayer;
import com.kcdformes.domain.port.out.MatchBroadcaster;
import com.kcdformes.domain.port.out.MatchRepository;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.UUID;

/**
 * Orchestration du lobby multijoueur (Jalon 2, voir docs/MULTIPLAYER.md). Ne
 * contient pas les règles fines (elles sont dans l'agrégat Match) : coordonne
 * dépôt en mémoire + diffusion temps réel après chaque mutation.
 */
@Service
public class MatchService {

    // Alphabet sans caractères ambigus (pas de O/0, I/1) pour un code lisible.
    private static final String CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final int CODE_LENGTH = 4;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final MatchRepository matchRepository;
    private final MatchBroadcaster broadcaster;

    public MatchService(MatchRepository matchRepository, MatchBroadcaster broadcaster) {
        this.matchRepository = matchRepository;
        this.broadcaster = broadcaster;
    }

    /** Crée un match en LOBBY avec l'hôte comme premier joueur. */
    public Match createMatch(UUID hostId, String username) {
        Match match = new Match(UUID.randomUUID(), generateUniqueCode(), MatchMode.COOP);
        match.addPlayer(new MatchPlayer(hostId, username));
        matchRepository.save(match);
        broadcaster.broadcastState(match);
        return match;
    }

    /** Rejoint un match via son code court. */
    public Match join(String code, UUID playerId, String username) {
        Match match = matchRepository.findByCode(code.trim().toUpperCase())
                .orElseThrow(() -> new IllegalArgumentException("Aucun match pour le code : " + code));
        match.addPlayer(new MatchPlayer(playerId, username));
        matchRepository.save(match);
        broadcaster.broadcastState(match);
        return match;
    }

    public Match setReady(UUID matchId, UUID playerId, boolean ready) {
        Match match = requireMatch(matchId);
        match.setReady(playerId, ready);
        matchRepository.save(match);
        broadcaster.broadcastState(match);
        return match;
    }

    /** Un joueur quitte : match supprimé s'il devient vide, sinon diffusé. */
    public void leave(UUID matchId, UUID playerId) {
        matchRepository.findById(matchId).ifPresent(match -> {
            match.removePlayer(playerId);
            if (match.isEmpty()) {
                matchRepository.delete(matchId);
            } else {
                matchRepository.save(match);
                broadcaster.broadcastState(match);
            }
        });
    }

    private Match requireMatch(UUID matchId) {
        return matchRepository.findById(matchId)
                .orElseThrow(() -> new IllegalArgumentException("Match introuvable : " + matchId));
    }

    private String generateUniqueCode() {
        String code;
        do {
            StringBuilder sb = new StringBuilder(CODE_LENGTH);
            for (int i = 0; i < CODE_LENGTH; i++) {
                sb.append(CODE_ALPHABET.charAt(RANDOM.nextInt(CODE_ALPHABET.length())));
            }
            code = sb.toString();
        } while (matchRepository.findByCode(code).isPresent());
        return code;
    }
}
