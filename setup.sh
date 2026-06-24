#!/bin/bash
# KCD Formes v2 — Setup Phase 1
# Lance depuis ~/kcd-formes-v2

set -e
ROOT=$(pwd)

echo "📁 Création de la structure hexagonale..."

# ── Structure backend ──────────────────────────────────────────────────────
BASE="backend/src/main/java/com/kcdformes"

mkdir -p $BASE/domain/model
mkdir -p $BASE/domain/port/in/command
mkdir -p $BASE/domain/port/in/query
mkdir -p $BASE/domain/port/out
mkdir -p $BASE/domain/service
mkdir -p $BASE/application/usecase
mkdir -p $BASE/infrastructure/persistence/entity
mkdir -p $BASE/infrastructure/persistence/repository
mkdir -p $BASE/infrastructure/persistence/mapper
mkdir -p $BASE/infrastructure/web/controller
mkdir -p $BASE/infrastructure/web/dto
mkdir -p $BASE/infrastructure/web/mapper
mkdir -p $BASE/infrastructure/config

# ── Flyway migrations ──────────────────────────────────────────────────────
mkdir -p backend/src/main/resources/db/migration

# ── Docker ────────────────────────────────────────────────────────────────
mkdir -p docker/backend
mkdir -p docker/nginx

# ── GitHub Actions ────────────────────────────────────────────────────────
mkdir -p .github/workflows

echo "✅ Structure créée"

# ── .gitignore racine ─────────────────────────────────────────────────────
cat > .gitignore << 'EOF'
# Env
.env

# macOS
.DS_Store
**/.DS_Store

# IntelliJ / VSCode
.idea/
*.iml
.vscode/

# Maven
backend/target/
backend/.mvn/wrapper/maven-wrapper.jar

# Logs
*.log
logs/

# Docker volumes locaux
postgres_data/
EOF

# ── .env.example ──────────────────────────────────────────────────────────
cat > .env.example << 'EOF'
# ── PostgreSQL ────────────────────────────────────────────────────────────
POSTGRES_DB=kcdformes
POSTGRES_USER=kcd_user
POSTGRES_PASSWORD=changeme
POSTGRES_PORT=5432

# ── Spring Boot ───────────────────────────────────────────────────────────
SPRING_PROFILES_ACTIVE=dev
SERVER_PORT=8080
JWT_SECRET=changeme_must_be_at_least_32_characters_long
JWT_EXPIRATION_MS=86400000

# ── Datasource (utilisé par Spring) ──────────────────────────────────────
DB_HOST=postgres
DB_PORT=5432
DB_NAME=kcdformes
DB_USERNAME=kcd_user
DB_PASSWORD=changeme
EOF

# ── .env (dev local, ignoré par git) ──────────────────────────────────────
cp .env.example .env
# Remplace les valeurs changeme par des valeurs dev
sed -i '' 's/POSTGRES_PASSWORD=changeme/POSTGRES_PASSWORD=kcd_dev_password/' .env
sed -i '' 's/DB_PASSWORD=changeme/DB_PASSWORD=kcd_dev_password/' .env
sed -i '' 's/JWT_SECRET=changeme_must_be_at_least_32_characters_long/JWT_SECRET=kcd_dev_secret_key_32_chars_min/' .env

# ── docker-compose.yml ────────────────────────────────────────────────────
cat > docker-compose.yml << 'EOF'
version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    env_file: .env
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "${POSTGRES_PORT}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: ../docker/backend/Dockerfile.dev
    env_file: .env
    environment:
      SPRING_PROFILES_ACTIVE: ${SPRING_PROFILES_ACTIVE}
      SPRING_DATASOURCE_URL: jdbc:postgresql://${DB_HOST}:${DB_PORT}/${DB_NAME}
      SPRING_DATASOURCE_USERNAME: ${DB_USERNAME}
      SPRING_DATASOURCE_PASSWORD: ${DB_PASSWORD}
      SERVER_PORT: ${SERVER_PORT}
    ports:
      - "${SERVER_PORT}:8080"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./backend:/app
      - maven_cache:/root/.m2

volumes:
  postgres_data:
  maven_cache:
EOF

# ── docker-compose.prod.yml ───────────────────────────────────────────────
cat > docker-compose.prod.yml << 'EOF'
version: "3.9"

services:
  backend:
    build:
      context: ./backend
      dockerfile: ../docker/backend/Dockerfile
    restart: unless-stopped
    volumes: []

  postgres:
    restart: unless-stopped
    ports: []

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - backend

volumes:
  postgres_data:
  maven_cache:
EOF

# ── Dockerfile dev (hot reload avec mvnw) ─────────────────────────────────
cat > docker/backend/Dockerfile.dev << 'EOF'
FROM eclipse-temurin:21-jdk-alpine
WORKDIR /app
RUN apk add --no-cache bash
COPY mvnw .
COPY .mvn .mvn
RUN chmod +x mvnw
EXPOSE 8080
CMD ["./mvnw", "spring-boot:run"]
EOF

# ── Dockerfile prod (multi-stage) ─────────────────────────────────────────
cat > docker/backend/Dockerfile << 'EOF'
# ── Stage 1 : Build ───────────────────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn package -DskipTests -B

# ── Stage 2 : Runtime ─────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine AS runtime
WORKDIR /app
RUN addgroup -S kcd && adduser -S kcd -G kcd
USER kcd
COPY --from=builder /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
EOF

# ── application.yaml ──────────────────────────────────────────────────────
cat > backend/src/main/resources/application.yaml << 'EOF'
spring:
  application:
    name: kcd-formes-backend

  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/kcdformes}
    username: ${SPRING_DATASOURCE_USERNAME:kcd_user}
    password: ${SPRING_DATASOURCE_PASSWORD:kcd_dev_password}
    driver-class-name: org.postgresql.Driver

  jpa:
    hibernate:
      ddl-auto: validate
    show-sql: false
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        format_sql: true

  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true

  security:
    # désactivé ici, configuré dans SecurityConfig
    user:
      name: disabled

server:
  port: ${SERVER_PORT:8080}

jwt:
  secret: ${JWT_SECRET:kcd_dev_secret_key_32_chars_min}
  expiration-ms: ${JWT_EXPIRATION_MS:86400000}

logging:
  level:
    com.kcdformes: DEBUG
    org.springframework.security: INFO
EOF

# ── Première migration Flyway ──────────────────────────────────────────────
cat > backend/src/main/resources/db/migration/V1__init_schema.sql << 'EOF'
-- KCD Formes v2 — Schéma initial

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE players (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username      VARCHAR(50)  UNIQUE NOT NULL,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    gold          INTEGER      DEFAULT 0,
    gems          INTEGER      DEFAULT 0,
    elo           INTEGER      DEFAULT 1000,
    created_at    TIMESTAMPTZ  DEFAULT NOW()
);

CREATE TABLE castles (
    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id  UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    name       VARCHAR(100),
    hp         INTEGER     DEFAULT 100,
    level      INTEGER     DEFAULT 1,
    map_state  JSONB       DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tower_types (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code         VARCHAR(50) UNIQUE NOT NULL,
    name         VARCHAR(100),
    base_damage  INTEGER,
    base_range   FLOAT,
    base_cost    INTEGER,
    attack_speed FLOAT
);

CREATE TABLE games (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id   UUID        NOT NULL REFERENCES players(id),
    castle_id   UUID        NOT NULL REFERENCES castles(id),
    status      VARCHAR(20) DEFAULT 'IN_PROGRESS',
    wave_number INTEGER     DEFAULT 0,
    gold_earned INTEGER     DEFAULT 0,
    started_at  TIMESTAMPTZ DEFAULT NOW(),
    ended_at    TIMESTAMPTZ
);

CREATE TABLE attacks (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attacker_id      UUID        NOT NULL REFERENCES players(id),
    defender_id      UUID        NOT NULL REFERENCES players(id),
    castle_snapshot  JSONB       DEFAULT '{}',
    result           VARCHAR(20),
    gold_stolen      INTEGER     DEFAULT 0,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Données initiales : types de tours
INSERT INTO tower_types (code, name, base_damage, base_range, base_cost, attack_speed) VALUES
    ('ARCHER',   'Tour Archer',   15, 3.0, 50,  1.2),
    ('MAGE',     'Tour Mage',     30, 2.5, 100, 0.8),
    ('CATAPULT', 'Catapulte',     50, 4.0, 150, 0.4);
EOF

# ── GitHub Actions CI backend ──────────────────────────────────────────────
cat > .github/workflows/backend-ci.yml << 'EOF'
name: Backend CI

on:
  push:
    branches: [main, develop]
    paths: [backend/**]
  pull_request:
    branches: [main]
    paths: [backend/**]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: kcdformes_test
          POSTGRES_USER: kcd_user
          POSTGRES_PASSWORD: testpassword
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          java-version: "21"
          distribution: temurin

      - name: Cache Maven
        uses: actions/cache@v4
        with:
          path: ~/.m2
          key: ${{ runner.os }}-maven-${{ hashFiles('**/pom.xml') }}
          restore-keys: ${{ runner.os }}-maven-

      - name: Tests unitaires
        working-directory: backend
        run: ./mvnw test -Dspring.profiles.active=test

      - name: Tests intégration
        working-directory: backend
        run: ./mvnw verify -Pintegration
        env:
          SPRING_DATASOURCE_URL: jdbc:postgresql://localhost:5432/kcdformes_test
          SPRING_DATASOURCE_USERNAME: kcd_user
          SPRING_DATASOURCE_PASSWORD: testpassword
          JWT_SECRET: test_secret_key_at_least_32_chars_long
          SERVER_PORT: 8080
EOF

echo ""
echo "✅ Phase 1 complète. Structure générée :"
echo ""
find . -not -path './.git/*' -not -path './backend/target/*' -not -path './backend/src/main/java/com/kcdformes/BackendApplication.java' | sort | head -60
