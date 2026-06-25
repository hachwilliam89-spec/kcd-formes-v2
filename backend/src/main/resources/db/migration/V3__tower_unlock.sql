-- Garde la table de référence tower_types alignée avec l'enum TowerType (domaine),
-- qui reste la source de vérité utilisée par le jeu. unlock_wave reflète la
-- progression de compte (bestWave) requise pour débloquer la tour.

ALTER TABLE tower_types ADD COLUMN unlock_wave INTEGER NOT NULL DEFAULT 0;

INSERT INTO tower_types (code, name, base_damage, base_range, base_cost, attack_speed, unlock_wave) VALUES
    ('BALLISTA', 'Baliste', 80, 5.0, 200, 0.3, 10);
