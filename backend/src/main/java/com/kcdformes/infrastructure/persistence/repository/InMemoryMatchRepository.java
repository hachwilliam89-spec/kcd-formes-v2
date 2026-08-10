package com.kcdformes.infrastructure.persistence.repository;

import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchStatus;
import com.kcdformes.domain.port.out.MatchRepository;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Stockage EN MÉMOIRE des matchs live (adaptateur du port MatchRepository).
 * Un match multijoueur n'est pas persisté en base : il vit le temps de la
 * partie. Index secondaire par code pour le « rejoindre par code ».
 * (Mono-instance : suffisant pour le VPS ; voir docs/MULTIPLAYER.md pour la
 * scalabilité future.)
 */
@Component
public class InMemoryMatchRepository implements MatchRepository {

    private final ConcurrentHashMap<UUID, Match> byId = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, UUID> byCode = new ConcurrentHashMap<>();

    @Override
    public Match save(Match match) {
        byId.put(match.getId(), match);
        byCode.put(match.getCode(), match.getId());
        return match;
    }

    @Override
    public Optional<Match> findById(UUID id) {
        return Optional.ofNullable(byId.get(id));
    }

    @Override
    public Optional<Match> findByCode(String code) {
        UUID id = byCode.get(code);
        return id == null ? Optional.empty() : findById(id);
    }

    @Override
    public Collection<Match> findRunning() {
        return byId.values().stream()
                .filter(m -> m.getStatus() == MatchStatus.RUNNING)
                .toList();
    }

    @Override
    public void delete(UUID id) {
        Match removed = byId.remove(id);
        if (removed != null) {
            byCode.remove(removed.getCode());
        }
    }
}
