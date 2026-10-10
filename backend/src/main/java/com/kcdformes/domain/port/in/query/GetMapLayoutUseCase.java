package com.kcdformes.domain.port.in.query;

import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.SeasonalTerrain;
import com.kcdformes.domain.model.TerrainType;

import java.util.List;

/**
 * Disposition statique d'une carte du catalogue, calculée par le domaine.
 *
 * Source de vérité unique pour les clients : ils n'ont plus à recopier les
 * waypoints (frontend-web/components/game/maps.ts) ni les règles de bande
 * constructible (constants.ts BUILD_BAND / SPAWN_NOBUILD / CASTLE_NOBUILD).
 * Voir docs/adr/0001-client-de-jeu-godot.md.
 *
 * L'état propre à une partie (tours posées, crue, boue, brume) n'en fait pas
 * partie : il arrive par GameResponse et les ticks de vague.
 */
public interface GetMapLayoutUseCase {

    record MapLayout(
            String id,
            int width,
            int height,
            TerrainType terrain,
            /** Case du château du joueur (fin commune de toutes les voies). */
            Position castle,
            /** Entrées ennemies distinctes (début des voies), dans l'ordre des voies. */
            List<Position> spawns,
            /** Points de passage de chaque voie (tracé du catalogue), de l'entrée au château. */
            List<List<Position>> lanes,
            /** Chemin case par case de chaque voie, de l'entrée au château. */
            List<List<Position>> lanePaths,
            /** Demi-largeur du couloir autour des voies (Chebyshev) : 0 = voies fines. */
            int corridorHalfWidth,
            /** Aires d'élargissement local de la route (cases de couloir en plus des voies). */
            List<Position> wideSpots,
            /** Cases de route (inconstructibles). Triées par y puis x. */
            List<Position> corridorCells,
            /** Cases où une tour peut être posée sur une carte vide. Triées par y puis x. */
            List<Position> buildableCells,
            /** Eau permanente (lac du printemps), jamais constructible. */
            List<Position> waterCells,
            /** Berges que la crue peut noyer (printemps), vide ailleurs. Constructibles. */
            List<Position> bankCells,
            /** Effets chiffrés des saisons (identiques pour toutes les cartes). */
            SeasonalRules seasonalRules
    ) {}

    /**
     * Constantes des mécaniques saisonnières (SeasonalTerrain), pour l'affichage :
     * annonces de crue, cercle de portée réduit dans la brume, textes d'aide.
     */
    record SeasonalRules(
            /** Une crue toutes les N vagues (printemps). */
            int floodInterval,
            /** Vitesse dans la boue (automne), sauf géants. */
            double mudSpeedFactor,
            /** Cases de portée perdues par une tour dans la brume (automne). */
            double fogRangePenalty,
            /** Multiplicateur des dégâts subis par les ennemis sous la grêle (printemps). */
            double hailDamageFactor,
            /** Multiplicateur de l'or par ennemi tué (printemps). */
            double fertileGoldFactor,
            /** Multiplicateur des dégâts de siège subis par une tour dans la brume (automne). */
            double fogDamageTakenFactor
    ) {}

    /** Ids des cartes jouables, dans l'ordre de présentation. */
    List<String> listMapIds();

    /** @throws com.kcdformes.domain.exception.UnknownMapException si l'id n'est pas au catalogue. */
    MapLayout getLayout(String mapId);

    /**
     * Prévision saisonnière d'une vague sur une carte vide (crue, boue, brume, grêle),
     * pour les aperçus hors partie (choix de la carte, outils). En partie, l'aperçu de
     * la prochaine vague (GetWavePreviewUseCase) porte la même prévision.
     *
     * @throws com.kcdformes.domain.exception.UnknownMapException si l'id n'est pas au catalogue.
     */
    SeasonalTerrain.Forecast forecast(String mapId, int wave);
}
