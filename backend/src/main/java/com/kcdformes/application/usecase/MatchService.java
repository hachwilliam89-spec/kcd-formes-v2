package com.kcdformes.application.usecase;

import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;
import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchGameState;
import com.kcdformes.domain.model.match.MatchMode;
import com.kcdformes.domain.model.match.MatchPlayer;
import com.kcdformes.domain.model.match.MatchStatus;
import com.kcdformes.domain.port.out.MatchBroadcaster;
import com.kcdformes.domain.port.out.MatchRepository;
import com.kcdformes.domain.service.MatchEngine;
import com.kcdformes.domain.service.PathfindingService;
import com.kcdformes.domain.service.PlaceTowerService;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.List;
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
    private final MatchEngine matchEngine;
    private final PathfindingService pathfindingService;

    public MatchService(MatchRepository matchRepository, MatchBroadcaster broadcaster,
                        MatchEngine matchEngine, PathfindingService pathfindingService) {
        this.matchRepository = matchRepository;
        this.broadcaster = broadcaster;
        this.matchEngine = matchEngine;
        this.pathfindingService = pathfindingService;
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

    /** Démarre la partie : exige que tout le monde soit prêt, initialise l'état
     *  de jeu live puis passe le match en RUNNING (la boucle de tick prend le relais). */
    public Match startGame(UUID matchId, UUID playerId) {
        Match match = requireMatch(matchId);
        if (match.findPlayer(playerId).isEmpty()) {
            throw new IllegalArgumentException("Joueur non membre de ce match");
        }
        if (!match.canStart()) {
            throw new IllegalStateException("Tous les joueurs doivent être prêts (et le lobby plein)");
        }
        match.setGameState(matchEngine.start(defaultCoopMap()));
        match.setStatus(MatchStatus.RUNNING);
        matchRepository.save(match);
        broadcaster.broadcastState(match); // signale aux clients que la partie démarre
        return match;
    }

    /** Pose une tour (coop) : validée serveur (case constructible, or partagé
     *  suffisant), puis l'or commun est débité et la tour ajoutée à la carte. */
    public void placeTower(UUID matchId, UUID playerId, String towerType, int x, int y) {
        Match match = requireMatch(matchId);
        if (match.getStatus() != MatchStatus.RUNNING || match.getGameState() == null) {
            throw new IllegalStateException("La partie n'est pas en cours");
        }
        if (match.findPlayer(playerId).isEmpty()) {
            throw new IllegalArgumentException("Joueur non membre de ce match");
        }
        MatchGameState s = match.getGameState();
        GameMap map = s.map;

        TowerType type;
        try {
            type = TowerType.valueOf(towerType);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Type de tour inconnu : " + towerType);
        }
        if (!map.isValidPosition(x, y)) {
            throw new IllegalArgumentException("Position hors de la carte");
        }
        boolean onCorridor = pathfindingService.corridorCells(map).contains(new Position(x, y));
        if (type == TowerType.WALL) {
            if (!onCorridor) throw new IllegalStateException("Le mur se pose sur le couloir des ennemis");
            long walls = map.getTowers().stream().filter(t -> t.getType() == TowerType.WALL).count();
            if (walls >= PlaceTowerService.MAX_WALLS) {
                throw new IllegalStateException("Limite de murs atteinte (" + PlaceTowerService.MAX_WALLS + ")");
            }
        } else if (onCorridor) {
            throw new IllegalStateException("Impossible de construire sur le couloir des ennemis");
        }
        if (map.getTowerAt(x, y).isPresent()) {
            throw new IllegalStateException("Case déjà occupée");
        }
        if (type.baseCost > s.gold) {
            throw new IllegalStateException("Or insuffisant");
        }
        s.gold -= type.baseCost;
        map.placeTower(new Tower(type, x, y));
        broadcaster.broadcastGame(match); // retour immédiat (le tick l'aurait fait au prochain cycle)
    }

    /** Carte coop par défaut — mêmes waypoints que le solo (voir GameService),
     *  pour que le décor du frontend colle au déplacement des ennemis. */
    private GameMap defaultCoopMap() {
        return new GameMap(20, 15, List.of(
                new Position(0, 3),
                new Position(17, 3),
                new Position(17, 8),
                new Position(2, 8),
                new Position(2, 13),
                new Position(19, 13)));
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
