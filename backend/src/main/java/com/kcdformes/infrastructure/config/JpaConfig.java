package com.kcdformes.infrastructure.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@Configuration
@EnableJpaRepositories(basePackages = "com.kcdformes.infrastructure.persistence.repository")
public class JpaConfig {
}
