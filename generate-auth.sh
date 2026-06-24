#!/bin/bash
# KCD Formes v2 — Auth JWT + Controllers REST
# Lance depuis ~/kcd-formes-v2

BASE="backend/src/main/java/com/kcdformes"

echo "🔐 Génération Auth JWT + Controllers REST..."

# ── Ajout dépendance JWT dans pom.xml ─────────────────────────────────────
# On insère la dépendance jjwt avant la balise </dependencies>
if ! grep -q "jjwt-api" backend/pom.xml; then
  sed -i '' 's|</dependencies>|        <!-- JWT -->\
        <dependency>\
            <groupId>io.jsonwebtoken</groupId>\
            <artifactId>jjwt-api</artifactId>\
            <version>0.12.6</version>\
        </dependency>\
        <dependency>\
            <groupId>io.jsonwebtoken</groupId>\
            <artifactId>jjwt-impl</artifactId>\
            <version>0.12.6</version>\
            <scope>runtime</scope>\
        </dependency>\
        <dependency>\
            <groupId>io.jsonwebtoken</groupId>\
            <artifactId>jjwt-jackson</artifactId>\
            <version>0.12.6</version>\
            <scope>runtime</scope>\
        </dependency>\
    </dependencies>|' backend/pom.xml
  echo "✅ Dépendances JWT ajoutées au pom.xml"
fi

# ── JwtTokenFactory.java (Factory pattern) ────────────────────────────────
cat > $BASE/infrastructure/config/JwtTokenFactory.java << 'EOF'
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
EOF

# ── JwtAuthFilter.java ────────────────────────────────────────────────────
cat > $BASE/infrastructure/config/JwtAuthFilter.java << 'EOF'
package com.kcdformes.infrastructure.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private final JwtTokenFactory jwtTokenFactory;

    public JwtAuthFilter(JwtTokenFactory jwtTokenFactory) {
        this.jwtTokenFactory = jwtTokenFactory;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");

        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7);
            if (jwtTokenFactory.isTokenValid(token)) {
                String username = jwtTokenFactory.extractUsername(token);
                var auth = new UsernamePasswordAuthenticationToken(
                        username, null, List.of());
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }

        filterChain.doFilter(request, response);
    }
}
EOF

# ── SecurityConfig.java mis à jour avec JwtAuthFilter ─────────────────────
cat > $BASE/infrastructure/config/SecurityConfig.java << 'EOF'
package com.kcdformes.infrastructure.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthFilter jwtAuthFilter;

    public SecurityConfig(JwtAuthFilter jwtAuthFilter) {
        this.jwtAuthFilter = jwtAuthFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(session ->
                session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/v1/auth/**").permitAll()
                .requestMatchers("/actuator/health").permitAll()
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
EOF

# ── DTOs Auth ─────────────────────────────────────────────────────────────
cat > $BASE/infrastructure/web/dto/RegisterRequest.java << 'EOF'
package com.kcdformes.infrastructure.web.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
        @NotBlank @Size(min = 3, max = 50) String username,
        @NotBlank @Email String email,
        @NotBlank @Size(min = 8) String password
) {}
EOF

cat > $BASE/infrastructure/web/dto/LoginRequest.java << 'EOF'
package com.kcdformes.infrastructure.web.dto;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        @NotBlank String username,
        @NotBlank String password
) {}
EOF

cat > $BASE/infrastructure/web/dto/AuthResponse.java << 'EOF'
package com.kcdformes.infrastructure.web.dto;

import java.util.UUID;

public record AuthResponse(
        String token,
        UUID playerId,
        String username
) {}
EOF

# ── DTOs Game ─────────────────────────────────────────────────────────────
cat > $BASE/infrastructure/web/dto/PlaceTowerRequest.java << 'EOF'
package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.TowerType;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record PlaceTowerRequest(
        @NotNull TowerType towerType,
        @Min(0) int x,
        @Min(0) int y
) {}
EOF

cat > $BASE/infrastructure/web/dto/TowerResponse.java << 'EOF'
package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.Tower;
import com.kcdformes.domain.model.TowerType;

import java.util.UUID;

public record TowerResponse(
        UUID id,
        TowerType type,
        int x,
        int y,
        int level,
        int damage,
        double range
) {
    public static TowerResponse from(Tower tower) {
        return new TowerResponse(
                tower.getId(),
                tower.getType(),
                tower.getX(),
                tower.getY(),
                tower.getLevel(),
                tower.getDamage(),
                tower.getRange()
        );
    }
}
EOF

# ── AuthService.java ──────────────────────────────────────────────────────
cat > $BASE/application/usecase/AuthService.java << 'EOF'
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
EOF

# ── AuthController.java ───────────────────────────────────────────────────
cat > $BASE/infrastructure/web/controller/AuthController.java << 'EOF'
package com.kcdformes.infrastructure.web.controller;

import com.kcdformes.application.usecase.AuthService;
import com.kcdformes.infrastructure.web.dto.AuthResponse;
import com.kcdformes.infrastructure.web.dto.LoginRequest;
import com.kcdformes.infrastructure.web.dto.RegisterRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request));
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }
}
EOF

# ── GlobalExceptionHandler.java ───────────────────────────────────────────
cat > $BASE/infrastructure/web/controller/GlobalExceptionHandler.java << 'EOF'
package com.kcdformes.infrastructure.web.controller;

import com.kcdformes.domain.exception.CellOccupiedException;
import com.kcdformes.domain.exception.InsufficientGoldException;
import com.kcdformes.domain.exception.InvalidPositionException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(CellOccupiedException.class)
    public ProblemDetail handleCellOccupied(CellOccupiedException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, ex.getMessage());
    }

    @ExceptionHandler(InvalidPositionException.class)
    public ProblemDetail handleInvalidPosition(InvalidPositionException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler(InsufficientGoldException.class)
    public ProblemDetail handleInsufficientGold(InsufficientGoldException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.PAYMENT_REQUIRED, ex.getMessage());
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ProblemDetail handleIllegalArgument(IllegalArgumentException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, ex.getMessage());
    }

    @ExceptionHandler(IllegalStateException.class)
    public ProblemDetail handleIllegalState(IllegalStateException ex) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNPROCESSABLE_ENTITY, ex.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
        String detail = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> e.getField() + ": " + e.getDefaultMessage())
                .reduce((a, b) -> a + ", " + b)
                .orElse("Validation failed");
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, detail);
    }
}
EOF

# ── Tests unitaires AuthService ───────────────────────────────────────────
mkdir -p backend/src/test/java/com/kcdformes/application/usecase

cat > backend/src/test/java/com/kcdformes/application/usecase/AuthServiceTest.java << 'EOF'
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
EOF

echo ""
echo "✅ Auth JWT + Controllers REST générés !"
echo ""
echo "Fichiers créés :"
echo "  infrastructure/config/JwtTokenFactory.java     ← Factory pattern"
echo "  infrastructure/config/JwtAuthFilter.java       ← Filtre JWT"
echo "  infrastructure/config/SecurityConfig.java      ← Mis à jour"
echo "  infrastructure/web/dto/RegisterRequest.java"
echo "  infrastructure/web/dto/LoginRequest.java"
echo "  infrastructure/web/dto/AuthResponse.java"
echo "  infrastructure/web/dto/PlaceTowerRequest.java"
echo "  infrastructure/web/dto/TowerResponse.java"
echo "  infrastructure/web/controller/AuthController.java"
echo "  infrastructure/web/controller/GlobalExceptionHandler.java"
echo "  application/usecase/AuthService.java"
echo "  test/AuthServiceTest.java                      ← 4 tests Mockito"
