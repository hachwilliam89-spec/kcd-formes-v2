package com.kcdformes.infrastructure.config;

import com.kcdformes.domain.service.PathfindingService;
import com.kcdformes.domain.service.WaveFactory;
import com.kcdformes.domain.service.WaveSimulationService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Déclare les services domaine purs comme beans Spring.
 * Ils n'ont pas @Component car le domaine ne dépend pas de Spring.
 */
@Configuration
public class DomainConfig {

    @Bean
    public PathfindingService pathfindingService() {
        return new PathfindingService();
    }

    @Bean
    public WaveFactory waveFactory() {
        return new WaveFactory();
    }

    @Bean
    public WaveSimulationService waveSimulationService(PathfindingService pathfindingService) {
        return new WaveSimulationService(pathfindingService);
    }
}
