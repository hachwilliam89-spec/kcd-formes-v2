package com.kcdformes.domain.model.match;

import java.util.UUID;

/**
 * Un joueur dans un match. Objet du domaine mutable (l'état « prêt » et
 * « connecté » évoluent pendant la vie du lobby).
 */
public class MatchPlayer {

    private final UUID playerId;
    private final String username;
    private boolean ready;
    private boolean connected;

    public MatchPlayer(UUID playerId, String username) {
        this.playerId = playerId;
        this.username = username;
        this.ready = false;
        this.connected = true;
    }

    public UUID getPlayerId() { return playerId; }
    public String getUsername() { return username; }
    public boolean isReady() { return ready; }
    public void setReady(boolean ready) { this.ready = ready; }
    public boolean isConnected() { return connected; }
    public void setConnected(boolean connected) { this.connected = connected; }
}
