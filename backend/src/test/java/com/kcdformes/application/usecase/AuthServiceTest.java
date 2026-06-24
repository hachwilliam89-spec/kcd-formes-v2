package com.kcdformes.application.usecase;

import com.kcdformes.infrastructure.config.JwtTokenFactory;
import com.kcdformes.infrastructure.persistence.entity.PlayerEntity;
import com.kcdformes.infrastructure.persistence.repository.PlayerJpaRepository;
import com.kcdformes.infrastructure.web.dto.LoginRequest;
import com.kcdformes.infrastructure.web.dto.RegisterRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock PlayerJpaRepository playerRepository;
    @Mock PasswordEncoder passwordEncoder;
    @Mock JwtTokenFactory jwtTokenFactory;

    @InjectMocks AuthService authService;

    private PlayerEntity mockPlayer;

    @BeforeEach
    void setUp() {
        mockPlayer = new PlayerEntity();
        mockPlayer.setId(UUID.randomUUID());
        mockPlayer.setUsername("kimtest");
        mockPlayer.setEmail("kim@test.com");
        mockPlayer.setPasswordHash("hashed");
    }

    @Test
    @DisplayName("Register — new user — returns token")
    void register_newUser_returnsToken() {
        when(playerRepository.existsByUsername("kimtest")).thenReturn(false);
        when(playerRepository.existsByEmail("kim@test.com")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("hashed");
        when(playerRepository.save(any())).thenReturn(mockPlayer);
        when(jwtTokenFactory.generateToken(any(), any())).thenReturn("jwt-token");

        var request = new RegisterRequest("kimtest", "kim@test.com", "password123");
        var response = authService.register(request);

        assertThat(response.token()).isEqualTo("jwt-token");
        assertThat(response.username()).isEqualTo("kimtest");
    }

    @Test
    @DisplayName("Register — duplicate username — throws")
    void register_duplicateUsername_throws() {
        when(playerRepository.existsByUsername("kimtest")).thenReturn(true);

        var request = new RegisterRequest("kimtest", "kim@test.com", "password123");

        assertThatThrownBy(() -> authService.register(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Username already taken");
    }

    @Test
    @DisplayName("Login — valid credentials — returns token")
    void login_validCredentials_returnsToken() {
        when(playerRepository.findByUsername("kimtest")).thenReturn(Optional.of(mockPlayer));
        when(passwordEncoder.matches("password123", "hashed")).thenReturn(true);
        when(jwtTokenFactory.generateToken(any(), any())).thenReturn("jwt-token");

        var request = new LoginRequest("kimtest", "password123");
        var response = authService.login(request);

        assertThat(response.token()).isEqualTo("jwt-token");
    }

    @Test
    @DisplayName("Login — wrong password — throws")
    void login_wrongPassword_throws() {
        when(playerRepository.findByUsername("kimtest")).thenReturn(Optional.of(mockPlayer));
        when(passwordEncoder.matches("wrongpass", "hashed")).thenReturn(false);

        var request = new LoginRequest("kimtest", "wrongpass");

        assertThatThrownBy(() -> authService.login(request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Invalid credentials");
    }
}
