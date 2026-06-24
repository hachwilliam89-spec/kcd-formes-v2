package com.kcdformes.infrastructure.persistence.entity;

import jakarta.persistence.*;
import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "players")
public class PlayerEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(unique = true, nullable = false, length = 50)
    private String username;

    @Column(unique = true, nullable = false)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(nullable = false)
    private int gold = 0;

    @Column(nullable = false)
    private int gems = 0;

    @Column(nullable = false)
    private int elo = 1000;

    @Column(name = "created_at", nullable = false, updatable = false)
    private OffsetDateTime createdAt = OffsetDateTime.now();

    // Getters & Setters
    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }

    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }

    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }

    public int getGold() { return gold; }
    public void setGold(int gold) { this.gold = gold; }

    public int getGems() { return gems; }
    public void setGems(int gems) { this.gems = gems; }

    public int getElo() { return elo; }
    public void setElo(int elo) { this.elo = elo; }

    public OffsetDateTime getCreatedAt() { return createdAt; }
}
