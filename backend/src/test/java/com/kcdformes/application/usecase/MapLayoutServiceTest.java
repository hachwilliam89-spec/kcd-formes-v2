package com.kcdformes.application.usecase;

import com.kcdformes.domain.exception.UnknownMapException;
import com.kcdformes.domain.model.MapCatalog;
import com.kcdformes.domain.model.Position;
import com.kcdformes.domain.model.TerrainType;
import com.kcdformes.domain.port.in.query.GetMapLayoutUseCase.MapLayout;
import com.kcdformes.domain.service.PathfindingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class MapLayoutServiceTest {

    private PathfindingService pathfindingService;
    private MapLayoutService service;

    @BeforeEach
    void setUp() {
        // Domaine pur : vrai PathfindingService, aucun mock nécessaire.
        pathfindingService = new PathfindingService();
        service = new MapLayoutService(pathfindingService);
    }

    @Test
    @DisplayName("Liste les cartes du catalogue dans l'ordre de présentation")
    void listMapIds_returnsCatalogInOrder() {
        assertThat(service.listMapIds()).containsExactly("desert", "fourche", "spring", "autumn");
        assertThat(service.listMapIds()).allMatch(MapCatalog::exists);
    }

    @Test
    @DisplayName("Désert : château, entrée et terrain conformes au catalogue")
    void desertLayout_matchesCatalog() {
        MapLayout layout = service.getLayout("desert");

        assertThat(layout.width()).isEqualTo(MapCatalog.WIDTH);
        assertThat(layout.height()).isEqualTo(MapCatalog.HEIGHT);
        assertThat(layout.terrain()).isEqualTo(TerrainType.NONE);
        assertThat(layout.castle()).isEqualTo(new Position(19, 13));
        assertThat(layout.spawns()).containsExactly(new Position(0, 3));
        assertThat(layout.waterCells()).isEmpty();
    }

    @Test
    @DisplayName("Fourche : trois voies mais une seule entrée (dédoublonnée)")
    void fourcheLayout_hasThreeLanesAndOneSpawn() {
        MapLayout layout = service.getLayout("fourche");

        assertThat(layout.lanePaths()).hasSize(3);
        assertThat(layout.spawns()).containsExactly(new Position(0, 8));
        assertThat(layout.castle()).isEqualTo(new Position(19, 8));
    }

    @Test
    @DisplayName("Printemps : lac présent, terrain SPRING")
    void springLayout_hasWater() {
        MapLayout layout = service.getLayout("spring");

        assertThat(layout.terrain()).isEqualTo(TerrainType.SPRING);
        assertThat(layout.waterCells()).isNotEmpty();
        assertThat(layout.spawns()).hasSize(2);
    }

    @ParameterizedTest(name = "{0} : chaque voie va d'une entrée au château")
    @ValueSource(strings = {"desert", "fourche", "spring", "autumn"})
    void lanePaths_goFromSpawnToCastle(String mapId) {
        MapLayout layout = service.getLayout(mapId);

        assertThat(layout.lanePaths()).isNotEmpty();
        for (List<Position> path : layout.lanePaths()) {
            assertThat(layout.spawns()).contains(path.get(0));
            assertThat(path.get(path.size() - 1)).isEqualTo(layout.castle());
        }
    }

    @ParameterizedTest(name = "{0} : tracé du catalogue exposé (points de passage repris par le chemin)")
    @ValueSource(strings = {"desert", "fourche", "spring", "autumn"})
    void lanes_matchCatalogAndPaths(String mapId) {
        MapLayout layout = service.getLayout(mapId);

        assertThat(layout.lanes()).isEqualTo(MapCatalog.buildMap(mapId).getLanes());
        assertThat(layout.lanes()).hasSameSizeAs(layout.lanePaths());
        for (int i = 0; i < layout.lanes().size(); i++) {
            List<Position> waypoints = layout.lanes().get(i);
            List<Position> path = layout.lanePaths().get(i);
            assertThat(path).containsAll(waypoints);
            assertThat(path.get(0)).isEqualTo(waypoints.get(0));
            assertThat(path.get(path.size() - 1)).isEqualTo(waypoints.get(waypoints.size() - 1));
        }
    }

    @Test
    @DisplayName("Forme de la route : demi-largeur du couloir et aires élargies du catalogue")
    void roadShape_matchesCatalog() {
        MapLayout desert = service.getLayout("desert");
        assertThat(desert.corridorHalfWidth()).isEqualTo(1);
        assertThat(desert.wideSpots()).isEmpty();

        MapLayout fourche = service.getLayout("fourche");
        assertThat(fourche.corridorHalfWidth()).isZero();
        assertThat(fourche.wideSpots()).isNotEmpty();
        assertThat(fourche.corridorCells()).containsAll(fourche.wideSpots());
    }

    @ParameterizedTest(name = "{0} : constructible = calcul du domaine, jamais sur la route ni l'eau")
    @ValueSource(strings = {"desert", "fourche", "spring", "autumn"})
    void buildableCells_matchDomainAndAvoidRoadAndWater(String mapId) {
        MapLayout layout = service.getLayout(mapId);

        Set<Position> expected = pathfindingService.buildableCells(MapCatalog.buildMap(mapId));
        assertThat(new HashSet<>(layout.buildableCells())).isEqualTo(expected);
        // Collections.disjoint plutôt que doesNotContainAnyElementsOf : AssertJ refuse
        // une liste de référence vide, or seule la carte du printemps a de l'eau.
        assertThat(layout.buildableCells()).isNotEmpty();
        assertThat(Collections.disjoint(layout.buildableCells(), layout.corridorCells()))
                .as("aucune case constructible sur la route").isTrue();
        assertThat(Collections.disjoint(layout.buildableCells(), layout.waterCells()))
                .as("aucune case constructible dans l'eau").isTrue();
    }

    @Test
    @DisplayName("Cases triées par ligne puis colonne (réponse stable)")
    void cells_areSortedByRowThenColumn() {
        List<Position> cells = service.getLayout("autumn").buildableCells();

        for (int i = 1; i < cells.size(); i++) {
            Position a = cells.get(i - 1);
            Position b = cells.get(i);
            assertThat(a.y() < b.y() || (a.y() == b.y() && a.x() < b.x()))
                    .as("%s avant %s", a, b).isTrue();
        }
    }

    @Test
    @DisplayName("Carte inconnue : UnknownMapException (pas de repli silencieux sur le désert)")
    void unknownMap_throws() {
        assertThatThrownBy(() -> service.getLayout("atlantide"))
                .isInstanceOf(UnknownMapException.class);
        assertThatThrownBy(() -> service.getLayout(null))
                .isInstanceOf(UnknownMapException.class);
    }
}
