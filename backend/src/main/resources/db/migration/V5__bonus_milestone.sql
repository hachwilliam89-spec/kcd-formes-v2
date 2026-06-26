-- Palier de bonus toutes les 5 vagues (voir BonusType / GameService.startWave) :
-- ce flag bloque le lancement d'une nouvelle vague jusqu'à ce que le joueur ait
-- choisi un bonus (voir ChooseBonusUseCase / BonusChoicePendingException).
ALTER TABLE games ADD COLUMN awaiting_bonus_choice BOOLEAN NOT NULL DEFAULT FALSE;
