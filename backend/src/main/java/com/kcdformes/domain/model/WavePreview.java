package com.kcdformes.domain.model;

import java.util.List;

/**
 * Aperçu d'une vague à venir, sans la jouer (voir WaveFactory.previewWave) :
 * ce qu'on révèle au joueur pour qu'il prépare sa défense — les TYPES présents
 * (pas leur nombre : on garde une part de surprise), ceux qu'il n'a encore
 * jamais croisés dans cette partie, et l'arrivée d'un Boss.
 *
 * @param waveNumber    numéro de la vague décrite
 * @param enemyTypes    types présents, dans l'ordre de déclaration d'EnemyType
 * @param newEnemyTypes types absents de toutes les vagues précédentes de la partie
 * @param bossWave      la vague contient au moins un Boss
 */
public record WavePreview(int waveNumber, List<EnemyType> enemyTypes, List<EnemyType> newEnemyTypes,
                          boolean bossWave, SeasonalTerrain.Forecast terrain) {

    public WavePreview(int waveNumber, List<EnemyType> enemyTypes, List<EnemyType> newEnemyTypes, boolean bossWave) {
        this(waveNumber, enemyTypes, newEnemyTypes, bossWave, SeasonalTerrain.forecast(TerrainType.NONE, waveNumber));
    }

    public WavePreview {
        enemyTypes = List.copyOf(enemyTypes);
        newEnemyTypes = List.copyOf(newEnemyTypes);
    }
}
