package com.kcdformes.application.usecase;

import com.kcdformes.domain.model.BonusType;
import com.kcdformes.domain.model.EnemyType;
import com.kcdformes.domain.model.GameMap;
import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;
import com.kcdformes.domain.model.match.Match;
import com.kcdformes.domain.model.match.MatchGameState;
import com.kcdformes.domain.model.match.MatchMode;
import com.kcdformes.domain.model.match.MatchPlayer;
import com.kcdformes.domain.model.match.MatchStatus;
import com.kcdformes.domain.model.match.SendCatalog;
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
    public Match createMatch(UUID hostId, String username, MatchMode mode) {
        Match match = new Match(UUID.randomUUID(), generateUniqueCode(), mode);
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
        if (match.getMode() == MatchMode.VERSUS) {
            // Versus : un board indépendant par joueur (même carte, économies séparées).
            for (MatchPlayer p : match.getPlayers()) {
                match.setPlayerState(p.getPlayerId(), matchEngine.start(defaultMap()));
            }
        } else {
            match.setGameState(matchEngine.start(defaultMap()));
        }
        match.setStatus(MatchStatus.RUNNING);
        matchRepository.save(match);
        broadcaster.broadcastState(match); // signale aux clients que la partie démarre
        return match;
    }

    /** Pose une tour : validée serveur (case constructible, or suffisant), puis
     *  l'or est débité et la tour ajoutée. En coop l'or est partagé (board commun) ;
     *  en versus chaque joueur agit sur SON board. */
    public void placeTower(UUID matchId, UUID playerId, String towerType, int x, int y) {
        Match match = requireMatch(matchId);
        if (match.getStatus() != MatchStatus.RUNNING) {
            throw new IllegalStateException("La partie n'est pas en cours");
        }
        if (match.findPlayer(playerId).isEmpty()) {
            throw new IllegalArgumentException("Joueur non membre de ce match");
        }
        // Board cible : le sien en versus, le board partagé en coop.
        MatchGameState s = match.getMode() == MatchMode.VERSUS
                ? match.getPlayerState(playerId)
                : match.getGameState();
        if (s == null) throw new IllegalStateException("La partie n'est pas en cours");
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
        broadcastLive(match); // retour immédiat (le tick l'aurait fait au prochain cycle)
    }

    /** Envoi versus (rush) : dépense de l'or pour lâcher un ennemi sur le board de
     *  l'adversaire. L'or investi augmente le revenu passif de l'envoyeur (payé en
     *  fin de vague), pour récompenser l'agression. */
    public void sendCreep(UUID matchId, UUID playerId, String enemyType) {
        Match match = requireMatch(matchId);
        if (match.getStatus() != MatchStatus.RUNNING || match.getMode() != MatchMode.VERSUS) {
            throw new IllegalStateException("Envoi possible uniquement en versus, partie en cours");
        }
        MatchGameState mine = match.getPlayerState(playerId);
        MatchPlayer opponent = match.opponentOf(playerId)
                .orElseThrow(() -> new IllegalStateException("Pas d'adversaire"));
        MatchGameState theirs = match.getPlayerState(opponent.getPlayerId());
        if (mine == null || theirs == null) throw new IllegalStateException("Partie non initialisée");

        EnemyType type;
        try {
            type = EnemyType.valueOf(enemyType);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Type d'ennemi inconnu : " + enemyType);
        }
        int cost = SendCatalog.cost(type);
        if (cost <= 0) throw new IllegalArgumentException("Cet ennemi ne peut pas être envoyé");
        if (cost > mine.gold) throw new IllegalStateException("Or insuffisant");

        mine.gold -= cost;
        mine.income += SendCatalog.income(type); // revenu passif accru
        theirs.incomingSends.add(type);          // débarque chez l'adversaire
        broadcastLive(match);
    }

    // Or de base du bonus GOLD_INJECTION, multiplié par la vague (comme le solo).
    private static final int GOLD_INJECTION_PER_WAVE = 40;

    /** Applique un bonus gagné au nombre de kills (mêmes effets que le solo) sur le
     *  board du joueur appelant (versus = son board, coop = board partagé). */
    public void chooseBonus(UUID matchId, UUID playerId, String bonusType) {
        Match match = requireMatch(matchId);
        if (match.getStatus() != MatchStatus.RUNNING) {
            throw new IllegalStateException("La partie n'est pas en cours");
        }
        if (match.findPlayer(playerId).isEmpty()) {
            throw new IllegalArgumentException("Joueur non membre de ce match");
        }
        MatchGameState s = match.getMode() == MatchMode.VERSUS
                ? match.getPlayerState(playerId)
                : match.getGameState();
        if (s == null) throw new IllegalStateException("La partie n'est pas en cours");
        if (s.pendingBonuses <= 0) throw new IllegalStateException("Aucun bonus disponible");

        BonusType type;
        try {
            type = BonusType.valueOf(bonusType);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Bonus inconnu : " + bonusType);
        }
        switch (type) {
            case GOLD_INJECTION -> s.gold += s.wave * GOLD_INJECTION_PER_WAVE;
            case CASTLE_REPAIR -> s.castleHp = s.castleMaxHp;
            case TOWER_REPAIR -> s.map.getTowers().forEach(t -> t.repair());
        }
        s.pendingBonuses--;
        broadcastLive(match);
    }

    /** Chat de match : rediffuse le message aux joueurs (membres uniquement, texte borné). */
    public void sendChat(UUID matchId, UUID playerId, String username, String text) {
        Match match = requireMatch(matchId);
        if (match.findPlayer(playerId).isEmpty()) {
            throw new IllegalArgumentException("Joueur non membre de ce match");
        }
        if (text == null) return;
        String clean = text.strip();
        if (clean.isEmpty()) return;
        if (clean.length() > 300) clean = clean.substring(0, 300);
        broadcaster.broadcastChat(match, playerId.toString(), username, clean);
    }

    /** Diffuse l'état live selon le mode (versus = deux boards, coop = board partagé). */
    private void broadcastLive(Match match) {
        if (match.getMode() == MatchMode.VERSUS) broadcaster.broadcastVersus(match);
        else broadcaster.broadcastGame(match);
    }

    /** Carte par défaut du multi — mêmes waypoints que le solo (voir GameService),
     *  pour que le décor du frontend colle au déplacement des ennemis. */
    private GameMap defaultMap() {
        return new GameMap(20, 15, List.of(
                new Position(0, 1),
                new Position(17, 1),
                new Position(17, 6),
                new Position(2, 6),
                new Position(2, 11),
                new Position(19, 11)));
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
