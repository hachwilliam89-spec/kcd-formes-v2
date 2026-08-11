package com.kcdformes.infrastructure.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "games")
public class GameEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "player_id", nullable = false)
    private PlayerEntity player;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "castle_id", nullable = false)
    private CastleEntity castle;

    @Column(nullable = false, length = 20)
    private String status = "IN_PROGRESS";

    // Carte de la partie (id du catalogue) : sert au classement par carte.
    @Column(name = "map_id", nullable = false, length = 30)
    private String mapId = "desert";

    @Column(name = "wave_number", nullable = false)
    private int waveNumber = 0;

    @Column(name = "gold_earned", nullable = false)
    private int goldEarned = 0;

    /** Solde d'or de cette partie (or par run, sans report entre parties). */
    @Column(nullable = false)
    private int gold = 0;

    /**
     * Graine aléatoire de cette partie, générée une seule fois à sa création
     * (voir GameService.createGame). Permet à WaveFactory de varier la
     * composition/l'ordre des vagues d'une partie à l'autre tout en restant
     * reproductible au sein d'une même partie (même seed + même numéro de
     * vague => même résultat si la vague est recalculée).
     */
    @Column(nullable = false)
    private long seed;

    /**
     * Vrai entre la fin d'une vague multiple de 5 et le choix effectif d'un bonus
     * par le joueur (voir BonusType / ChooseBonusUseCase) : bloque le lancement
     * d'une nouvelle vague (voir GameService.startWave) tant qu'il reste vrai.
     */
    @Column(name = "awaiting_bonus_choice", nullable = false)
    private boolean awaitingBonusChoice = false;

    /**
     * Verrou optimiste JPA : deux requêtes concurrentes qui chargent la même
     * version et tentent de sauvegarder chacune leur copie ne peuvent pas
     * toutes les deux réussir — la seconde échoue en
     * ObjectOptimisticLockingFailureException (mappée en 409, voir
     * GlobalExceptionHandler). Sans ça, un double-clic sur "lancer la vague"
     * simulait deux fois la même vague (même seed + même waveNumber) : or
     * doublé et château débité deux fois.
     */
    @Version
    @Column(nullable = false)
    private long version;

    @Column(name = "started_at", nullable = false, updatable = false)
    private OffsetDateTime startedAt = OffsetDateTime.now();

    @Column(name = "ended_at")
    private OffsetDateTime endedAt;

    // Getters & Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public PlayerEntity getPlayer() { return player; }
    public void setPlayer(PlayerEntity player) { this.player = player; }

    public CastleEntity getCastle() { return castle; }
    public void setCastle(CastleEntity castle) { this.castle = castle; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getMapId() { return mapId; }
    public void setMapId(String mapId) { this.mapId = mapId; }

    public int getWaveNumber() { return waveNumber; }
    public void setWaveNumber(int waveNumber) { this.waveNumber = waveNumber; }

    public int getGoldEarned() { return goldEarned; }
    public void setGoldEarned(int goldEarned) { this.goldEarned = goldEarned; }

    public int getGold() { return gold; }
    public void setGold(int gold) { this.gold = gold; }

    public long getSeed() { return seed; }
    public void setSeed(long seed) { this.seed = seed; }

    public boolean isAwaitingBonusChoice() { return awaitingBonusChoice; }
    public void setAwaitingBonusChoice(boolean awaitingBonusChoice) { this.awaitingBonusChoice = awaitingBonusChoice; }

    public OffsetDateTime getStartedAt() { return startedAt; }
    public OffsetDateTime getEndedAt() { return endedAt; }
    public void setEndedAt(OffsetDateTime endedAt) { this.endedAt = endedAt; }
}
