package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.EnemyType;
import com.kcdformes.domain.model.WavePreview;

import java.util.List;

/** Aperçu de la prochaine vague (voir WavePreview) — types en noms d'enum, comme le reste de l'API. */
public record WavePreviewResponse(int waveNumber, List<String> enemyTypes, List<String> newEnemyTypes,
                                  boolean bossWave) {

    public static WavePreviewResponse from(WavePreview preview) {
        return new WavePreviewResponse(
                preview.waveNumber(),
                preview.enemyTypes().stream().map(EnemyType::name).toList(),
                preview.newEnemyTypes().stream().map(EnemyType::name).toList(),
                preview.bossWave());
    }
}
