package com.kcdformes.domain.port.in.query;

import com.kcdformes.domain.model.DamageType;
import com.kcdformes.domain.model.TowerType;

import java.util.List;

/**
 * Catalogue des tours tel que le domaine le définit (TowerType, Tower,
 * PlaceTowerService) : coût, déblocage, règle de pose et caractéristiques par
 * niveau.
 *
 * Source de vérité unique pour les clients : ils n'ont plus à recopier les
 * coûts ni les stats (frontend-web/app/game/page.tsx TOWER_INFO / TOWER_STATS).
 * Les libellés et les visuels restent côté client (présentation).
 *
 * Statique : le déblocage se lit en comparant unlockWave au bestWave du compte
 * (GET /api/v1/players/me), l'or en le comparant au solde de la partie.
 */
public interface GetTowerCatalogUseCase {

    /** Où la tour se pose : hors du couloir (tours) ou dessus (Mur). */
    enum Placement { OFF_CORRIDOR, ON_CORRIDOR }

    /** Caractéristiques à un niveau donné. upgradeCost = prix du niveau suivant, 0 au niveau max. */
    record LevelStats(int level, int damage, double range, int maxHp, int upgradeCost) {}

    record TowerSpec(
            TowerType type,
            int cost,
            DamageType damageType,
            /** Tirs par tick ; ignoré pour DamageType.CONTINUOUS. */
            double attackSpeed,
            /** Rayon de zone autour de la cible, 0 hors AOE. */
            double splashRadius,
            /** Multiplicateur contre les cibles massives, 1.0 = aucun bonus. */
            double heavyTargetMultiplier,
            /** Meilleure vague du compte requise, 0 = disponible d'office. */
            int unlockWave,
            Placement placement,
            /** Nombre maximum posé en même temps sur la carte, 0 = illimité. */
            int maxCount,
            /** Du niveau 1 au niveau max. */
            List<LevelStats> levels
    ) {}

    /** Toutes les tours, dans l'ordre de TowerType. */
    List<TowerSpec> listTowers();
}
