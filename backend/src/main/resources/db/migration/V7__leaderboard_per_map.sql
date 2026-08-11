-- Classement par carte : chaque partie retient sa carte (games.map_id), et on
-- stocke le meilleur score (vague atteinte) par (joueur, carte). Le best_wave
-- global sur players reste inchangé — il alimente l'onglet « Global ».

ALTER TABLE games ADD COLUMN map_id VARCHAR(30) NOT NULL DEFAULT 'desert';

CREATE TABLE player_map_score (
    id         UUID PRIMARY KEY,
    player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    map_id     VARCHAR(30) NOT NULL,
    best_wave  INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_player_map UNIQUE (player_id, map_id)
);

-- Tri du classement d'une carte : meilleure vague décroissante.
CREATE INDEX idx_player_map_score_ranking ON player_map_score (map_id, best_wave DESC);
