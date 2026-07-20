package com.kcdformes.domain.service;

import com.kcdformes.domain.model.EnemyType;

import java.util.List;
import java.util.Random;

/**
 * Composite (voir {@link WaveSegment}) : répartit aléatoirement un budget de
 * menace entre plusieurs types d'ennemis, plutôt qu'un compte fixe par type
 * (voir l'ancien WaveFactory). Chaque entrée a un coût (consommé du budget),
 * un poids de tirage (fréquence relative) et un minimum garanti (piochée
 * avant tout aléa, pour qu'un type débloqué n'ait jamais 0 occurrence). Le
 * reste du budget est ensuite distribué un ennemi à la fois, en piochant
 * parmi les types encore finançables — ce qui mélange à la fois la
 * composition ET l'ordre d'apparition (les types s'entrelacent au lieu
 * d'arriver en blocs homogènes).
 */
public final class ThreatBudgetMix implements WaveSegment {

    /**
     * @param type type d'ennemi
     * @param cost coût en points de menace d'une occurrence (typiquement EnemyType.goldReward,
     *             déjà calibré au fil des passes d'équilibrage précédentes)
     * @param weight poids de tirage relatif parmi les types encore finançables
     * @param minGuaranteed nombre d'occurrences garanties avant toute randomisation
     * @param maxCount plafond d'occurrences par vague (0 = illimité). Le budget
     *                 non dépensé sur un type plafonné se reporte naturellement
     *                 sur les autres types finançables. Introduit pour le Sapeur :
     *                 mesuré au harnais, son compte illimité (+1/vague de
     *                 référence) rasait 9+ tours par vague dès la v15 — un churn
     *                 qu'aucune économie ne peut reconstruire.
     */
    public record Entry(EnemyType type, int cost, int weight, int minGuaranteed, int maxCount) {

        /** Variante sans plafond (la majorité des types). */
        public Entry(EnemyType type, int cost, int weight, int minGuaranteed) {
            this(type, cost, weight, minGuaranteed, 0);
        }
    }

    private final int budget;
    private final List<Entry> entries;

    public ThreatBudgetMix(int budget, List<Entry> entries) {
        this.budget = budget;
        this.entries = entries;
    }

    @Override
    public void resolve(Random rng, List<EnemyType> output) {
        int remaining = budget;
        java.util.Map<EnemyType, Integer> counts = new java.util.HashMap<>();

        for (Entry entry : entries) {
            for (int i = 0; i < entry.minGuaranteed(); i++) {
                output.add(entry.type());
                counts.merge(entry.type(), 1, Integer::sum);
                remaining -= entry.cost();
            }
        }

        int cheapestCost = entries.stream().mapToInt(Entry::cost).min().orElse(Integer.MAX_VALUE);
        while (remaining >= cheapestCost) {
            // Copie locale effectively-final : `remaining` est réassigné plus bas
            // dans la boucle, donc inutilisable directement dans le lambda du filter.
            int budgetLeft = remaining;
            List<Entry> affordable = entries.stream()
                    .filter(e -> e.cost() <= budgetLeft)
                    .filter(e -> e.maxCount() == 0 || counts.getOrDefault(e.type(), 0) < e.maxCount())
                    .toList();
            if (affordable.isEmpty()) {
                break;
            }

            int totalWeight = affordable.stream().mapToInt(Entry::weight).sum();
            int roll = rng.nextInt(totalWeight);
            int cumulative = 0;
            Entry picked = affordable.getLast();
            for (Entry candidate : affordable) {
                cumulative += candidate.weight();
                if (roll < cumulative) {
                    picked = candidate;
                    break;
                }
            }

            output.add(picked.type());
            counts.merge(picked.type(), 1, Integer::sum);
            remaining -= picked.cost();
        }
    }
}
