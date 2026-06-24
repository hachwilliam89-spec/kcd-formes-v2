package com.kcdformes.infrastructure.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.UUID;

/**
 * Factory pattern — centralise la création et validation des JWT.
 * Aucune logique métier ici, uniquement la mécanique des tokens.
 */
@Component
public class JwtTokenFactory {

    private final SecretKey secretKey;
    private final long expirationMs;

    public JwtTokenFactory(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.expiration-ms}") long expirationMs) {
        this.secretKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = expirationMs;
    }

    public String generateToken(UUID playerId, String username) {
        return Jwts.builder()
                .subject(playerId.toString())
                .claim("username", username)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(secretKey)
                .compact();
    }

    public Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(secretKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public boolean isTokenValid(String token) {
        try {
            parseToken(token);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    public UUID extractPlayerId(String token) {
        return UUID.fromString(parseToken(token).getSubject());
    }

    public String extractUsername(String token) {
        return parseToken(token).get("username", String.class);
    }
}
