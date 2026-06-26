package com.kcdformes.domain.service;

import com.kcdformes.domain.model.EnemyType;

import java.util.List;
import java.util.Random;

/**
 * Composite (voir {@link WaveSegment}) : choisit aléatoirement, pondéré, UN
 * SEUL segment enfant et lui délègue la résolution — les autres options ne
 * produisent rien ce tirage-ci.
 *
 * Pas encore utilisé dans WaveFactory aujourd'hui : c'est le point d'extension
 * prévu pour de futurs ajouts (ex: un segment "Boss" qui n'apparaît qu'avec
 * une certaine probabilité à partir d'une vague donnée, en concurrence avec un
 * segment "rien de spécial"). Ajouter ce genre de variante se fera en ajoutant
 * une nouvelle Option ici, sans modifier le reste de l'arbre de composition.
 */
public final class WeightedChoice implements WaveSegment {

    public record Option(WaveSegment segment, int weight) {}

    private final List<Option> options;

    public WeightedChoice(List<Option> options) {
        this.options = options;
    }

    @Override
    public void resolve(Random rng, List<EnemyType> output) {
        int totalWeight = options.stream().mapToInt(Option::weight).sum();
        int roll = rng.nextInt(totalWeight);
        int cumulative = 0;
        for (Option option : options) {
            cumulative += option.weight();
            if (roll < cumulative) {
                option.segment().resolve(rng, output);
                return;
            }
        }
    }
}
