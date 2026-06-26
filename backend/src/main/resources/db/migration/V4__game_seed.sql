-- Graine aléatoire par partie (voir GameEntity.seed) : permet à WaveFactory de
-- varier la composition/l'ordre des vagues d'une partie à l'autre, tout en
-- restant reproductible au sein d'une même partie. DEFAULT 0 pour les lignes
-- existantes (parties déjà terminées ou en cours avant cette migration) ;
-- les nouvelles parties reçoivent un seed tiré aléatoirement par GameService.

ALTER TABLE games ADD COLUMN seed BIGINT NOT NULL DEFAULT 0;
