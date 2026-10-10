package com.kcdformes.application.usecase;

import com.kcdformes.domain.model.match.SendCatalog;
import com.kcdformes.domain.port.in.query.GetSendCatalogUseCase;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Expose le catalogue des envois du versus tel que le domaine le définit.
 * Aucune règle ici : coûts, revenus et ordre viennent de SendCatalog, lu aussi
 * par MatchService.sendCreep.
 */
@Service
public class SendCatalogService implements GetSendCatalogUseCase {

    @Override
    public List<SendSpec> listSends() {
        return SendCatalog.sendableTypes().stream()
                .map(type -> new SendSpec(type, SendCatalog.cost(type), SendCatalog.income(type)))
                .toList();
    }
}
