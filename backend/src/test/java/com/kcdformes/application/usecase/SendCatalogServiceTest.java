package com.kcdformes.application.usecase;

import com.kcdformes.domain.model.EnemyType;
import com.kcdformes.domain.model.match.SendCatalog;
import com.kcdformes.domain.port.in.query.GetSendCatalogUseCase.SendSpec;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SendCatalogServiceTest {

    private SendCatalogService service;

    @BeforeEach
    void setUp() {
        service = new SendCatalogService();
    }

    @Test
    @DisplayName("Expose exactement les ennemis envoyables du domaine")
    void listSends_coversEverySendableType() {
        List<EnemyType> sendable = Arrays.stream(EnemyType.values())
                .filter(SendCatalog::isSendable)
                .toList();

        assertThat(service.listSends()).extracting(SendSpec::type)
                .containsExactlyInAnyOrderElementsOf(sendable);
    }

    @Test
    @DisplayName("Coût et revenu = valeurs du domaine (celles que lit MatchService.sendCreep)")
    void listSends_matchDomainEconomy() {
        assertThat(service.listSends()).allSatisfy(spec -> {
            assertThat(spec.cost()).isEqualTo(SendCatalog.cost(spec.type())).isPositive();
            assertThat(spec.income()).isEqualTo(SendCatalog.income(spec.type())).isPositive();
        });
    }

    @Test
    @DisplayName("Du moins cher au plus cher : Gobelin en premier, Seigneur de guerre en dernier")
    void listSends_sortedByCost() {
        List<SendSpec> sends = service.listSends();

        for (int i = 1; i < sends.size(); i++) {
            assertThat(sends.get(i).cost()).isGreaterThanOrEqualTo(sends.get(i - 1).cost());
        }
        assertThat(sends.get(0).type()).isEqualTo(EnemyType.GOBLIN);
        assertThat(sends.get(sends.size() - 1).type()).isEqualTo(EnemyType.BOSS_WARLORD);
    }

    @Test
    @DisplayName("Valeurs actuelles de l'économie du rush (garde-fou d'équilibrage)")
    void listSends_currentValues() {
        assertThat(service.listSends()).containsExactly(
                new SendSpec(EnemyType.GOBLIN, 70, 2),
                new SendSpec(EnemyType.ORC, 150, 4),
                new SendSpec(EnemyType.TROLL, 280, 7),
                new SendSpec(EnemyType.SAPEUR, 320, 8),
                new SendSpec(EnemyType.DARK_KNIGHT, 360, 9),
                new SendSpec(EnemyType.CHARIOT, 460, 11),
                new SendSpec(EnemyType.BOSS_WARLORD, 850, 20));
    }
}
