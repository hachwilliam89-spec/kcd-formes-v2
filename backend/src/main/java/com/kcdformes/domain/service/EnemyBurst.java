package com.kcdformes.domain.service;

import com.kcdformes.domain.model.EnemyType;

import java.util.List;
import java.util.Random;

/** Feuille du Composite (voir {@link WaveSegment}) : un nombre fixe d'ennemis d'un même type, sans aléa. */
public final class EnemyBurst implements WaveSegment {

    private final EnemyType type;
    private final int count;

    public EnemyBurst(EnemyType type, int count) {
        this.type = type;
        this.count = count;
    }

    @Override
    public void resolve(Random rng, List<EnemyType> output) {
        for (int i = 0; i < count; i++) {
            output.add(type);
        }
    }
}
