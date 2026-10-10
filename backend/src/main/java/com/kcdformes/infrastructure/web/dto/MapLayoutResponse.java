package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.port.in.query.GetMapLayoutUseCase.MapLayout;
import com.kcdformes.domain.port.in.query.GetMapLayoutUseCase.SeasonalRules;

import java.util.List;

/** Disposition statique d'une carte (voir GetMapLayoutUseCase). Positions en {x, y}. */
public record MapLayoutResponse(
        String id,
        int width,
        int height,
        String terrain,
        Position castle,
        List<Position> spawns,
        List<List<Position>> lanes,
        List<List<Position>> lanePaths,
        int corridorHalfWidth,
        List<Position> wideSpots,
        List<Position> corridorCells,
        List<Position> buildableCells,
        List<Position> waterCells,
        List<Position> bankCells,
        SeasonalRules seasonalRules
) {
    public static MapLayoutResponse from(MapLayout layout) {
        return new MapLayoutResponse(
                layout.id(),
                layout.width(),
                layout.height(),
                layout.terrain().name(),
                layout.castle(),
                layout.spawns(),
                layout.lanes(),
                layout.lanePaths(),
                layout.corridorHalfWidth(),
                layout.wideSpots(),
                layout.corridorCells(),
                layout.buildableCells(),
                layout.waterCells(),
                layout.bankCells(),
                layout.seasonalRules());
    }
}
