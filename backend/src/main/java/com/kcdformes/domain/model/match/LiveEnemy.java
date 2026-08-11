package com.kcdformes.domain.model.match;

import com.kcdformes.domain.model.EnemyType;

import java.util.UUID;

/**
 * Ennemi dans une partie multijoueur LIVE (boucle autoritaire, Jalon 3). État
 * mutable avancé tick par tick par le MatchEngine. Coordonnées en cases (comme
 * en solo) : le frontend multiplie par la taille de case pour l'affichage.
 * Champs publics assumés : objet de state interne au serveur, pas d'API exposée.
 */
public class LiveEnemy {

    public final UUID id = UUID.randomUUID();
    public final EnemyType type;
    public double x;
    public double y;
    public int hp;
    public final int maxHp;
    public int pathIndex = 0;      // segment courant du chemin (vers path[pathIndex+1])
    public int laneIndex = 0;      // voie suivie sur une carte multi-voies (0 = mono-voie)
    public boolean reachedEnd = false;

    public LiveEnemy(EnemyType type, double x, double y) {
        this(type, x, y, type.baseHp);
    }

    /** PV explicites : PV scalés par vague (voir MatchEngine.scaledHp), comme en solo. */
    public LiveEnemy(EnemyType type, double x, double y, int hp) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.maxHp = hp;
        this.hp = hp;
    }
}
