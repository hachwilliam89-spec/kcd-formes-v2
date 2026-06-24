package com.kcdformes.infrastructure.config;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

@Component
public class JwtAuthFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(JwtAuthFilter.class);

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
            try {
                // Le principal est le playerId (UUID) : auth.getName() doit renvoyer
                // l'identifiant joueur attendu par les controllers (ex: GameController),
                // pas le username. Le username reste accessible via getCredentials().
                UUID playerId = jwtTokenFactory.extractPlayerId(token);
                String username = jwtTokenFactory.extractUsername(token);
                var auth = new UsernamePasswordAuthenticationToken(
                        playerId, username, List.of());
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (JwtException | IllegalArgumentException e) {
                // Token absent/expiré/invalide : on logue la cause réelle au lieu de
                // l'avaler silencieusement (sinon un 403 muet est très dur à diagnostiquer).
                log.debug("JWT invalide sur {} {} : {}", request.getMethod(), request.getRequestURI(), e.getMessage());
                SecurityContextHolder.clearContext();
            }
        }

        filterChain.doFilter(request, response);
    }
}
