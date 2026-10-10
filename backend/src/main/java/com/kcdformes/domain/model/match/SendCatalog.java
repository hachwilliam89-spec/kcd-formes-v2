package com.kcdformes.domain.model.match;

import com.kcdformes.domain.model.EnemyType;

import java.util.Comparator;
import java.util.List;
import java.util.Map;

/**
 * Catalogue des ennemis ENVOYABLES en versus (rush) et leur économie : coût en or
 * pour l'envoyeur + bonus de revenu passif que l'envoi lui procure (voir
 * MatchService.sendCreep). Cœur de la boucle rush : investir dans des envois
 * pressurise l'adversaire ET fait grossir son propre revenu (snowball).
 *
 * Source de vérité unique : exposé aux clients par GetSendCatalogUseCase
 * (GET /api/v1/versus/sends), ils ne recopient ni coûts ni revenus.
 */
public final class SendCatalog {

    private record Entry(int cost, int income) {}

    private static final Map<EnemyType, Entry> CATALOG = Map.of(
            EnemyType.GOBLIN, new Entry(70, 2),
            EnemyType.ORC, new Entry(150, 4),
            EnemyType.TROLL, new Entry(280, 7),
            // Sapeur : va détruire les tours de l'adversaire (arme de sabotage).
            EnemyType.SAPEUR, new Entry(320, 8),
            EnemyType.DARK_KNIGHT, new Entry(360, 9),
            // Démon de givre (Chariot) : engin de siège blindé qui use les tours à distance.
            EnemyType.CHARIOT, new Entry(460, 11),
            // Boss : aura de soin + étourdissement des tours — finisher très coûteux.
            EnemyType.BOSS_WARLORD, new Entry(850, 20));

    private SendCatalog() {}

    /** Ennemis envoyables, du moins cher au plus cher (ordre d'affichage). */
    public static List<EnemyType> sendableTypes() {
        return CATALOG.keySet().stream()
                .sorted(Comparator.comparingInt(SendCatalog::cost).thenComparingInt(EnemyType::ordinal))
                .toList();
    }

    public static boolean isSendable(EnemyType type) {
        return CATALOG.containsKey(type);
    }

    /** Coût en or de l'envoi, ou 0 si l'ennemi n'est pas envoyable. */
    public static int cost(EnemyType type) {
        Entry e = CATALOG.get(type);
        return e != null ? e.cost() : 0;
    }

    /** Bonus de revenu passif procuré à l'envoyeur, ou 0. */
    public static int income(EnemyType type) {
        Entry e = CATALOG.get(type);
        return e != null ? e.income() : 0;
    }
}
