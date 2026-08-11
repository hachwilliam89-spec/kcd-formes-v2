package com.kcdformes.infrastructure.persistence.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.util.UUID;

/**
 * Meilleur score (vague atteinte) d'un joueur SUR UNE CARTE donnée — alimente le
 * classement par carte. Le best_wave GLOBAL reste sur PlayerEntity (onglet Global).
 * Unicité (player, map) : une seule ligne par joueur et par carte (upsert).
 */
@Entity
@Table(name = "player_map_score",
        uniqueConstraints = @UniqueConstraint(name = "uq_player_map", columnNames = {"player_id", "map_id"}))
public class PlayerMapScoreEntity {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "player_id", nullable = false)
    private PlayerEntity player;

    @Column(name = "map_id", nullable = false, length = 30)
    private String mapId;

    @Column(name = "best_wave", nullable = false)
    private int bestWave = 0;

    protected PlayerMapScoreEntity() {}

    public PlayerMapScoreEntity(UUID id, PlayerEntity player, String mapId, int bestWave) {
        this.id = id;
        this.player = player;
        this.mapId = mapId;
        this.bestWave = bestWave;
    }

    public UUID getId() { return id; }
    public PlayerEntity getPlayer() { return player; }
    public String getMapId() { return mapId; }
    public int getBestWave() { return bestWave; }
    public void setBestWave(int bestWave) { this.bestWave = bestWave; }
}
