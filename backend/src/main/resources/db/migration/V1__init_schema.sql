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
