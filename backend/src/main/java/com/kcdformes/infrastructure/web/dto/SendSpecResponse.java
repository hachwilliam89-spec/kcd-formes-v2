package com.kcdformes.infrastructure.web.dto;

import com.kcdformes.domain.port.in.query.GetSendCatalogUseCase.SendSpec;

/** Une entrée du catalogue des envois du versus (voir GetSendCatalogUseCase). */
public record SendSpecResponse(String type, int cost, int income) {

    public static SendSpecResponse from(SendSpec spec) {
        return new SendSpecResponse(spec.type().name(), spec.cost(), spec.income());
    }
}
