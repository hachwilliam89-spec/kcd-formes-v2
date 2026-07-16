-- Verrou optimiste sur games (voir GameEntity.version) : empêche deux requêtes
-- concurrentes (ex. double-clic sur "lancer la vague") de simuler deux fois la
-- même vague ou de débiter l'or deux fois. DEFAULT 0 pour initialiser les
-- parties existantes.
ALTER TABLE games
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
