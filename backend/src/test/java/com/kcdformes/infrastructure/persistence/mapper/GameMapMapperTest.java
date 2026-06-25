package com.kcdformes.infrastructure.persistence.mapper;

import com.kcdformes.domain.model.*;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.ObjectMapper;

import java.util.Map;

import static org.assertj.core.api.Assertions.*;

class GameMapMapperTest {

    private final GameMapMapper mapper = new GameMapMapper(new ObjectMapper());

    @Test
    @DisplayName("Round-trip JSON préserve les tours posées (type, x, y, level)")
    void toJsonThenFromJson_preservesTowers() {
        GameMap map = new GameMap(20, 15, new Position(0, 7), new Position(19, 7));
        map.placeTower(new Tower(TowerType.ARCHER, 2, 6));
        map.placeTower(new Tower(TowerType.MAGE, 5, 8));
        map.placeTower(new Tower(TowerType.CATAPULT, 9, 6));

        Map<String, Object> json = mapper.toJson(map);
        GameMap reloaded = mapper.fromJson(json);

        assertThat(reloaded.getTowers()).hasSize(3);
        assertThat(reloaded.getTowers())
                .extracting(Tower::getType)
                .containsExactlyInAnyOrder(TowerType.ARCHER, TowerType.MAGE, TowerType.CATAPULT);

        Tower archer = reloaded.getTowerAt(2, 6).orElseThrow();
        assertThat(archer.getType()).isEqualTo(TowerType.ARCHER);

        Tower mage = reloaded.getTowerAt(5, 8).orElseThrow();
        assertThat(mage.getType()).isEqualTo(TowerType.MAGE);

        Tower catapult = reloaded.getTowerAt(9, 6).orElseThrow();
        assertThat(catapult.getType()).isEqualTo(TowerType.CATAPULT);
    }

    @Test
    @DisplayName("Une map sans tour round-trip vers une liste vide")
    void toJsonThenFromJson_noTowers_returnsEmptyList() {
        GameMap map = new GameMap(20, 15, new Position(0, 7), new Position(19, 7));

        GameMap reloaded = mapper.fromJson(mapper.toJson(map));

        assertThat(reloaded.getTowers()).isEmpty();
    }
}
