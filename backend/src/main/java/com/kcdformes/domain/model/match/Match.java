package com.kcdformes.domain.model.match;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Agrégat « match multijoueur » (voir docs/MULTIPLAYER.md). Objet du domaine pur
 * (aucune dépendance Spring/JPA) : il vit EN MÉMOIRE côté serveur, seul son
 * résultat final sera persisté. Porte les règles du lobby ; la boucle de jeu
 * live (Jalon 3) viendra s'appuyer dessus.
 */
public class Match {

    private final UUID id;
    private final String code;              // code court pour rejoindre (ex. "K7QF")
    private final MatchMode mode;
    private final int maxPlayers;
    private MatchStatus status;
    private final List<MatchPlayer> players = new ArrayList<>();
    private MatchGameState gameState;   // COOP : board partagé (null en LOBBY)
    // VERSUS : un board indépendant par joueur (chacun son or, ses tours, son
    // château). LinkedHashMap pour garder l'ordre d'arrivée (hôte en premier).
    private final Map<UUID, MatchGameState> playerStates = new LinkedHashMap<>();
    private UUID winnerId;              // désigné à la fin d'un versus (dernier debout)

    public Match(UUID id, String code, MatchMode mode) {
        this.id = id;
        this.code = code;
        this.mode = mode;
        this.maxPlayers = mode == MatchMode.COOP ? 2 : 2;
        this.status = MatchStatus.LOBBY;
    }

    /** Ajoute un joueur (idempotent : un rejoin réactive juste sa connexion). */
    public void addPlayer(MatchPlayer player) {
        Optional<MatchPlayer> existing = findPlayer(player.getPlayerId());
        if (existing.isPresent()) {
            existing.get().setConnected(true);
            return;
        }
        if (players.size() >= maxPlayers) {
            throw new IllegalStateException("Partie pleine");
        }
        if (status != MatchStatus.LOBBY) {
            throw new IllegalStateException("La partie a déjà commencé");
        }
        players.add(player);
    }

    public void removePlayer(UUID playerId) {
        players.removeIf(p -> p.getPlayerId().equals(playerId));
    }

    public Optional<MatchPlayer> findPlayer(UUID playerId) {
        return players.stream().filter(p -> p.getPlayerId().equals(playerId)).findFirst();
    }

    public void setReady(UUID playerId, boolean ready) {
        findPlayer(playerId).ifPresent(p -> p.setReady(ready));
    }

    /** Le lobby peut démarrer quand il est plein et que tout le monde est prêt. */
    public boolean canStart() {
        return status == MatchStatus.LOBBY
                && players.size() == maxPlayers
                && players.stream().allMatch(MatchPlayer::isReady);
    }

    public boolean isEmpty() { return players.isEmpty(); }

    public UUID getId() { return id; }
    public String getCode() { return code; }
    public MatchMode getMode() { return mode; }
    public int getMaxPlayers() { return maxPlayers; }
    public MatchStatus getStatus() { return status; }
    public void setStatus(MatchStatus status) { this.status = status; }
    public List<MatchPlayer> getPlayers() { return List.copyOf(players); }
    public MatchGameState getGameState() { return gameState; }
    public void setGameState(MatchGameState gameState) { this.gameState = gameState; }

    // ── Versus : boards par joueur ────────────────────────────────────────
    public void setPlayerState(UUID playerId, MatchGameState state) { playerStates.put(playerId, state); }
    public MatchGameState getPlayerState(UUID playerId) { return playerStates.get(playerId); }
    public Map<UUID, MatchGameState> getPlayerStates() { return playerStates; }

    /** Adversaire d'un joueur en 1v1 (le seul autre joueur du match). */
    public Optional<MatchPlayer> opponentOf(UUID playerId) {
        return players.stream().filter(p -> !p.getPlayerId().equals(playerId)).findFirst();
    }

    public UUID getWinnerId() { return winnerId; }
    public void setWinnerId(UUID winnerId) { this.winnerId = winnerId; }
}
