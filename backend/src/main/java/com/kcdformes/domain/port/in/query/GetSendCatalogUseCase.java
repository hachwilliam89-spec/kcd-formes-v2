package com.kcdformes.domain.port.in.query;

import com.kcdformes.domain.model.EnemyType;

import java.util.List;

/**
 * Catalogue des envois du versus tel que le domaine le définit (SendCatalog) :
 * ennemis envoyables chez l'adversaire, coût en or et revenu passif gagné.
 *
 * Source de vérité unique pour les clients : ils n'ont plus à recopier ces
 * valeurs (frontend-web/app/versus/page.tsx SENDS). Les libellés et les
 * visuels restent côté client (présentation).
 */
public interface GetSendCatalogUseCase {

    /** income = revenu passif ajouté à l'envoyeur, par vague. */
    record SendSpec(EnemyType type, int cost, int income) {}

    /** Envois disponibles, du moins cher au plus cher. */
    List<SendSpec> listSends();
}
