-- Économie par run (solo) : l'or n'est plus un solde de compte qui se report
-- d'une partie à l'autre. Chaque partie a son propre solde, remis à zéro au
-- départ de chaque run. Le compte ne conserve que la progression méta : la
-- vague la plus loin jamais atteinte (sert de score et de base aux futurs
-- déblocages).

ALTER TABLE games ADD COLUMN gold INTEGER NOT NULL DEFAULT 0;

ALTER TABLE players ADD COLUMN best_wave INTEGER NOT NULL DEFAULT 0;

ALTER TABLE players DROP COLUMN gold;
