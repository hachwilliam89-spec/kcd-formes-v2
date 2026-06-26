package com.kcdformes.domain.service;

import com.kcdformes.domain.model.EnemyType;

import java.util.List;
import java.util.Random;

/**
 * Component du pattern Composite utilisé pour décrire la composition d'une
 * vague : un segment ajoute un ou plusieurs ennemis (dans leur ordre
 * d'apparition) à la liste de sortie. Les feuilles ({@link EnemyBurst})
 * décrivent un groupe fixe d'un seul type ; les composites
 * ({@link SequentialSegments}, {@link ThreatBudgetMix}, {@link WeightedChoice})
 * combinent ou randomisent des sous-segments.
 *
 * L'intérêt de cette architecture : faire évoluer la composition des vagues
 * (mix aléatoire borné par un budget, choix pondéré entre variantes) sans
 * toucher à WaveFactory, et pouvoir y greffer plus tard un nouveau type de
 * segment (ex: un "BossSpawn" déclenché via WeightedChoice à partir d'une
 * certaine vague) sans modifier le reste de l'arbre de composition.
 */
public interface WaveSegment {

    /** Résout ce segment et ajoute les ennemis qu'il produit, dans l'ordre, à {@code output}. */
    void resolve(Random rng, List<EnemyType> output);
}
