package com.kcdformes.domain.service;

import com.kcdformes.domain.model.EnemyType;

import java.util.List;
import java.util.Random;

/**
 * Composite (voir {@link WaveSegment}) : enchaîne plusieurs segments dans un
 * ordre fixe. La séquence elle-même (l'ordre des sous-segments) est figée,
 * mais le contenu de chaque sous-segment peut rester aléatoire (ex: un
 * {@link ThreatBudgetMix} en deuxième position).
 */
public final class SequentialSegments implements WaveSegment {

    private final List<WaveSegment> children;

    public SequentialSegments(List<WaveSegment> children) {
        this.children = children;
    }

    @Override
    public void resolve(Random rng, List<EnemyType> output) {
        for (WaveSegment child : children) {
            child.resolve(rng, output);
        }
    }
}
