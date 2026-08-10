package com.kcdformes.domain.model.match;

/** Cycle de vie d'un match multijoueur (voir docs/MULTIPLAYER.md). */
public enum MatchStatus {
    LOBBY,      // en attente de joueurs / de « prêt »
    RUNNING,    // partie en cours (boucle autoritaire)
    PAUSED,
    FINISHED
}
