package com.kcdformes.application.usecase;

import com.kcdformes.infrastructure.config.JwtTokenFactory;
import com.kcdformes.infrastructure.persistence.entity.PlayerEntity;
import com.kcdformes.infrastructure.persistence.repository.PlayerJpaRepository;
import com.kcdformes.infrastructure.web.dto.AuthResponse;
import com.kcdformes.infrastructure.web.dto.LoginRequest;
import com.kcdformes.infrastructure.web.dto.RegisterRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    /** Or accordé à un nouveau joueur pour pouvoir poser ses premières tours. */
    private static final int STARTING_GOLD = 200;

    private final PlayerJpaRepository playerRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenFactory jwtTokenFactory;

    public AuthService(PlayerJpaRepository playerRepository,
                       PasswordEncoder passwordEncoder,
                       JwtTokenFactory jwtTokenFactory) {
        this.playerRepository = playerRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtTokenFactory = jwtTokenFactory;
    }

    @Transactional
    public AuthResponse register(RegisterRequest request) {
        if (playerRepository.existsByUsername(request.username())) {
            throw new IllegalArgumentException("Username already taken: " + request.username());
        }
        if (playerRepository.existsByEmail(request.email())) {
            throw new IllegalArgumentException("Email already in use: " + request.email());
        }

        PlayerEntity player = new PlayerEntity();
        player.setUsername(request.username());
        player.setEmail(request.email());
        player.setPasswordHash(passwordEncoder.encode(request.password()));
        player.setGold(STARTING_GOLD);

        player = playerRepository.save(player);

        String token = jwtTokenFactory.generateToken(player.getId(), player.getUsername());
        return new AuthResponse(token, player.getId(), player.getUsername());
    }

    public AuthResponse login(LoginRequest request) {
        PlayerEntity player = playerRepository.findByUsername(request.username())
                .orElseThrow(() -> new IllegalArgumentException("Invalid credentials"));

        if (!passwordEncoder.matches(request.password(), player.getPasswordHash())) {
            throw new IllegalArgumentException("Invalid credentials");
        }

        String token = jwtTokenFactory.generateToken(player.getId(), player.getUsername());
        return new AuthResponse(token, player.getId(), player.getUsername());
    }
}
