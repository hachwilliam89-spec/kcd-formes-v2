package com.kcdformes.domain.port.out;

import com.kcdformes.domain.model.match.Match;

import java.util.Optional;
import java.util.UUID;

/**
 * Port de stockage des matchs multijoueur. Implémenté EN MÉMOIRE
 * (InMemoryMatchRepository) : un match live n'est pas persisté en base, seul son
 * résultat le sera (voir docs/MULTIPLAYER.md).
 */
public interface MatchRepository {
    Match save(Match match);
    Optional<Match> findById(UUID id);
    Optional<Match> findByCode(String code);
    void delete(UUID id);
}
