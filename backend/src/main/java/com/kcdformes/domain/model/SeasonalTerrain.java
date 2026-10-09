package com.kcdformes.domain.model;

import java.util.*;

/**
 * Terrain saisonnier : règles communes au solo (WaveSimulationService) et au live
 * (MatchEngine), sans état de rendu ni dépendance Spring. Le serveur fait autorité ;
 * le front affiche seulement l'état envoyé avec chaque tick / snapshot.
 *
 * <ul>
 *   <li>Printemps : crue toutes les {@link #FLOOD_INTERVAL} vagues → les tours des
 *   berges noyées ne tirent plus pendant la vague (jamais détruites, réactivées à la
 *   décrue). Le sens de la crue change d'une fois sur l'autre (ouest-est, nord, sud…).
 *   Certaines autres vagues, la grêle cabosse les armures : les ennemis subissent
 *   {@link #HAIL_DAMAGE_FACTOR} fois les dégâts. Tout est tiré à l'avance, donc annoncé.
 *   Terre fertile : chaque ennemi tué rapporte {@link #FERTILE_GOLD_FACTOR} fois son or.</li>
 *   <li>Automne : un terrain qui aide ET qui gêne. La boue (cases du chemin) ralentit
 *   les ennemis, qui s'y entassent sous le feu — sauf les géants (Troll, boss), qui
 *   la traversent sans peine. Ses flaques changent de place à chaque vague (tirage
 *   fixe, donc annoncé dans l'aperçu), comme la brume. La brume coûte
 *   {@link #FOG_RANGE_PENALTY} case de portée aux tours qu'elle couvre ; ses bancs
 *   changent de place à chaque vague selon un cycle fixe, donc annoncé à l'avance
 *   dans l'aperçu de la vague suivante. En échange, elle protège : une tour couverte
 *   ne reçoit que {@link #FOG_DAMAGE_TAKEN_FACTOR} des dégâts de siège.</li>
 * </ul>
 */
public final class SeasonalTerrain {

    public static final int FLOOD_INTERVAL = 3;
    /** Vitesse d'un ennemi dans la boue, en fraction de sa vitesse normale. */
    public static final double MUD_SPEED_FACTOR = 0.6;
    /** Portée perdue (en cases) par une tour couverte par la brume. */
    public static final double FOG_RANGE_PENALTY = 1.0;
    /** Dégâts reçus par les ennemis pendant une grêle (armures cabossées). */
    public static final double HAIL_DAMAGE_FACTOR = 1.25;
    /**
     * Terre fertile (printemps) : chaque ennemi tué rapporte cette fraction de son or.
     * Bonus permanent qui compense une carte courte (voies de ~20 cases), aux berges
     * inondables : mesuré au harnais (MapBalanceHarnessTest), il ramène le printemps
     * vers le niveau du désert sans toucher aux crues.
     */
    public static final double FERTILE_GOLD_FACTOR = 1.25;
    /**
     * Brume protectrice (automne) : une tour couverte par la brume ne reçoit que cette
     * fraction des dégâts de siège (Sapeur, rayons, pulse du boss) — mal visible, les
     * coups portent moins. Contrepoids de la portée perdue : la brume devient un choix
     * (portée contre solidité) plutôt qu'une simple gêne. 0,45 = -55 %, mesuré au
     * simulateur : ramène l'automne au niveau du désert.
     */
    public static final double FOG_DAMAGE_TAKEN_FACTOR = 0.45;

    // Rives du lac (printemps) : chaque crue en noie une partie, dans un sens qui change.
    private static final List<Position> BANK_WEST = rect(6, 5, 6, 11);
    private static final List<Position> BANK_EAST = rect(14, 5, 14, 11);
    private static final List<Position> BANK_NORTH = union(rect(6, 5, 8, 5), rect(12, 5, 14, 5));
    private static final List<Position> BANK_SOUTH = union(rect(6, 11, 8, 11), rect(12, 11, 14, 11));
    private static final List<Position> BANK_CELLS = union(union(BANK_WEST, BANK_EAST), union(BANK_NORTH, BANK_SOUTH));
    /** Sens des crues successives (vagues 3, 6, 9…), en boucle : jamais deux fois le même d'affilée. */
    private static final List<List<Position>> FLOOD_SEQUENCE = List.of(
            union(BANK_WEST, BANK_EAST),    // face aux forts
            BANK_NORTH,
            BANK_SOUTH,
            union(BANK_WEST, BANK_EAST),
            union(BANK_NORTH, BANK_SOUTH),
            BANK_SOUTH,
            BANK_NORTH,
            union(BANK_NORTH, BANK_SOUTH));
    private static final List<Position> WATER_CELLS = buildWaterCells();
    /** Emplacements de flaques : 6 sur le serpentin seul, 2 sur le raccourci seul. */
    private static final List<List<Position>> MUD_SERPENTINE = List.of(
            rect(12, 2, 14, 4),    // A : haut, avant le virage est
            rect(15, 4, 17, 6),    // B : descente est
            rect(12, 7, 14, 9),    // C : traverse du milieu, côté est
            rect(4, 7, 6, 9),      // D : traverse du milieu, côté ouest
            rect(2, 9, 4, 11),     // E : descente ouest
            rect(5, 12, 7, 14));   // F : bas, avant la jonction
    private static final List<List<Position>> MUD_SHORTCUT = List.of(
            rect(8, 5, 10, 6),     // G : raccourci, au nord du croisement
            rect(8, 10, 10, 11));  // H : raccourci, au sud du croisement
    /** Les 20 trios d'emplacements du serpentin, dans l'ordre lexicographique. */
    private static final List<int[]> MUD_TRIOS = buildTrios(MUD_SERPENTINE.size());
    private static final List<List<Position>> FOG_CYCLE = buildFogCycle();

    private final TerrainType type;
    private int wave;
    private List<Position> fog;
    private Set<Position> fogSet;
    private List<Position> flood;
    private Set<Position> floodSet;
    private List<Position> mud;
    private Set<Position> mudSet;
    /**
     * Reste fractionnaire des dégâts de siège atténués par la brume, par tour : les
     * rayons font 1 à 3 dégâts par tick, un simple arrondi les annulerait (1 × 0,45 → 0)
     * ou les laisserait intacts. Le reste est reporté au coup suivant : -55 % exact,
     * déterministe (même résultat en solo et en live).
     */
    private final Map<UUID, Double> fogDamageCarry = new HashMap<>();

    /** État de la vague en cours, envoyé au front avec chaque tick (solo) / snapshot (live). */
    public record Snapshot(boolean flooded, List<Position> fog, List<Position> mud,
                           List<UUID> disabledTowers, List<UUID> foggedTowers,
                           List<Position> flood, boolean hail) {}

    /**
     * Annonce d'une vague à venir (aperçu) : crue ou non, cases concernées (berges
     * noyées au printemps, flaques de boue en automne), bancs de brume, grêle.
     */
    public record Forecast(String type, boolean flooded, List<Position> affectedCells,
                           List<Position> fogCells, boolean hail) {}

    public SeasonalTerrain(TerrainType type, int wave) {
        this.type = type;
        setWave(wave);
    }

    /** Toutes les berges que la crue peut noyer (printemps). */
    public static List<Position> bankCells() { return BANK_CELLS; }

    /** Berges noyées à cette vague (vide hors crue) : le sens change d'une crue à l'autre. */
    public static List<Position> floodCells(TerrainType type, int wave) {
        if (!floodedAt(type, wave)) return List.of();
        return FLOOD_SEQUENCE.get((wave / FLOOD_INTERVAL - 1) % FLOOD_SEQUENCE.size());
    }

    /**
     * Grêle (printemps) : jamais en vague 1 ni pendant une crue ; environ une vague sur
     * quatre, selon un tirage fixe (4, 11, 14, 16, 19…), donc annoncée dans l'aperçu.
     */
    public static boolean hailAt(TerrainType type, int wave) {
        return type == TerrainType.SPRING && wave > 1 && !floodedAt(type, wave) && Math.floorMod(wave * 7 + 3, 5) < 2;
    }

    /**
     * Eau permanente de la carte (lac du printemps) : jamais constructible, voir
     * PathfindingService.buildableCells. Dérivée du type de terrain, donc aussi des
     * parties sauvegardées (le terrain est persisté avec la carte).
     */
    public static List<Position> waterCells(TerrainType type) {
        return type == TerrainType.SPRING ? WATER_CELLS : List.of();
    }
    /**
     * Flaques de boue d'une vague (automne seulement) : une sur le raccourci + trois sur
     * le serpentin. Tirage fixe sur 40 combinaisons (pas de 7 : deux vagues voisines
     * n'ont jamais la même boue), donc identique en solo, en live et dans l'aperçu.
     */
    public static List<Position> mudCells(TerrainType type, int wave) {
        if (type != TerrainType.AUTUMN || wave < 1) return List.of();
        int draws = MUD_SHORTCUT.size() * MUD_TRIOS.size();
        int index = Math.floorMod(wave * 7 + 3, draws);
        LinkedHashSet<Position> cells = new LinkedHashSet<>(MUD_SHORTCUT.get(index % MUD_SHORTCUT.size()));
        for (int slot : MUD_TRIOS.get(index / MUD_SHORTCUT.size())) cells.addAll(MUD_SERPENTINE.get(slot));
        return List.copyOf(cells);
    }

    /** Toutes les cases où la boue peut se poser (tests : toujours sur la route). */
    public static List<Position> mudSlots() {
        LinkedHashSet<Position> cells = new LinkedHashSet<>();
        MUD_SERPENTINE.forEach(cells::addAll);
        MUD_SHORTCUT.forEach(cells::addAll);
        return List.copyOf(cells);
    }

    /** Bancs de brume d'une vague (automne seulement) : cycle de FOG_CYCLE.size() positions. */
    public static List<Position> fogCells(TerrainType type, int wave) {
        if (type != TerrainType.AUTUMN || wave < 1) return List.of();
        return FOG_CYCLE.get((wave - 1) % FOG_CYCLE.size());
    }

    public static boolean floodedAt(TerrainType type, int wave) {
        return type == TerrainType.SPRING && wave > 0 && wave % FLOOD_INTERVAL == 0;
    }

    public static Forecast forecast(TerrainType type, int wave) {
        List<Position> cells = type == TerrainType.SPRING ? floodCells(type, wave)
                : type == TerrainType.AUTUMN ? mudCells(type, wave) : List.of();
        return new Forecast(type.name(), floodedAt(type, wave), cells, fogCells(type, wave), hailAt(type, wave));
    }

    /** Passe à la vague donnée (le live l'appelle à chaque pas : sans effet si inchangée). */
    public void beginWave(int nextWave) {
        if (wave != nextWave) setWave(nextWave);
    }

    private void setWave(int w) {
        wave = w;
        fog = fogCells(type, w);
        fogSet = Set.copyOf(fog);
        flood = floodCells(type, w);
        floodSet = Set.copyOf(flood);
        mud = mudCells(type, w);
        mudSet = Set.copyOf(mud);
    }

    public boolean flooded() { return floodedAt(type, wave); }

    public boolean hail() { return hailAt(type, wave); }

    /** Multiplicateur des dégâts reçus par les ennemis (grêle : armures cabossées). */
    public double damageTakenFactor() { return hail() ? HAIL_DAMAGE_FACTOR : 1.0; }

    /** Or rapporté par un ennemi tué sur ce terrain (terre fertile du printemps : +25 %). */
    public static int goldFor(TerrainType type, int baseReward) {
        return type == TerrainType.SPRING ? (int) Math.round(baseReward * FERTILE_GOLD_FACTOR) : baseReward;
    }

    public int goldFor(EnemyType enemy) {
        return goldFor(type, enemy.goldReward);
    }

    /** Tour d'une berge noyée par la crue : ne tire pas (un mur, passif, n'est pas concerné). */
    public boolean disables(Tower tower) {
        return !floodSet.isEmpty() && tower.getType() != TowerType.WALL && floodSet.contains(cellOf(tower));
    }

    /** Les géants (Troll, boss) enjambent la boue : elle ne les ralentit pas. */
    public static boolean wadesThroughMud(EnemyType enemy) {
        return enemy == EnemyType.TROLL || enemy.isBoss;
    }

    /** Facteur de vitesse d'un ennemi à cette position : MUD_SPEED_FACTOR dans la boue, sauf géants. */
    public double speedFactorAt(EnemyType enemy, double x, double y) {
        if (type != TerrainType.AUTUMN || wadesThroughMud(enemy)) return 1.0;
        return mudSet.contains(new Position((int) Math.round(x), (int) Math.round(y))) ? MUD_SPEED_FACTOR : 1.0;
    }

    /** Tour couverte par la brume de la vague courante (un mur n'a pas de portée). */
    public boolean fogged(Tower tower) {
        return !fogSet.isEmpty() && tower.getType() != TowerType.WALL && fogSet.contains(cellOf(tower));
    }

    /**
     * Dégâts de siège réellement reçus par une tour (Sapeur, rayon, pulse du boss) :
     * atténués par la brume protectrice, inchangés sinon. Un mur n'est jamais couvert.
     */
    public int siegeDamageTo(Tower tower, int damage) {
        if (damage <= 0 || !fogged(tower)) return damage;
        double reduced = damage * FOG_DAMAGE_TAKEN_FACTOR + fogDamageCarry.getOrDefault(tower.getId(), 0.0);
        int dealt = (int) Math.floor(reduced + 1e-9);
        fogDamageCarry.put(tower.getId(), reduced - dealt);
        return dealt;
    }

    /** Portée effective d'une tour, brume comprise. */
    public double rangeOf(Tower tower) {
        return tower.getRange() - (fogged(tower) ? FOG_RANGE_PENALTY : 0);
    }

    /** Un ennemi en (x, y) est-il à portée de la tour, brume comprise ? */
    public boolean inRange(Tower tower, double x, double y) {
        double dx = tower.getX() - x;
        double dy = tower.getY() - y;
        double range = rangeOf(tower);
        return dx * dx + dy * dy <= range * range;
    }

    public Snapshot snapshot(List<Tower> towers) {
        List<Tower> standing = towers.stream().filter(t -> !t.isDestroyed()).toList();
        return new Snapshot(flooded(), fog, mud,
                standing.stream().filter(this::disables).map(Tower::getId).toList(),
                standing.stream().filter(this::fogged).map(Tower::getId).toList(),
                flood, hail());
    }

    private static Position cellOf(Tower tower) {
        return new Position(tower.getX(), tower.getY());
    }

    /**
     * Lac du printemps : douves de part et d'autre de l'île du château (10,8) ; les
     * deux ponts (nord, sud) sont les cases de route qui le traversent en x=9..11.
     */
    private static List<Position> buildWaterCells() {
        return union(rect(7, 6, 8, 10), rect(12, 6, 13, 10));
    }

    private static List<int[]> buildTrios(int n) {
        List<int[]> trios = new ArrayList<>();
        for (int i = 0; i < n; i++) for (int j = i + 1; j < n; j++) for (int k = j + 1; k < n; k++) trios.add(new int[]{i, j, k});
        return List.copyOf(trios);
    }

    /**
     * Cycle des bancs de brume (vague 1, 2, 3, puis on recommence) : deux bancs par
     * vague, jamais au même endroit d'une vague à la suivante — la défense doit
     * s'adapter. Les cases de chemin incluses n'ont aucun effet (pas de tour dessus).
     */
    private static List<List<Position>> buildFogCycle() {
        return List.of(
                union(rect(5, 1, 10, 6), rect(12, 10, 18, 11)),   // nord-ouest + sud-est
                union(rect(11, 1, 16, 6), rect(0, 11, 8, 15)),    // nord-est + sud-ouest
                union(rect(5, 4, 15, 6), rect(17, 1, 19, 11)));   // centre + flanc est
    }

    private static List<Position> rect(int x0, int y0, int x1, int y1) {
        List<Position> cells = new ArrayList<>();
        for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) cells.add(new Position(x, y));
        return cells;
    }

    private static List<Position> union(List<Position> a, List<Position> b) {
        LinkedHashSet<Position> cells = new LinkedHashSet<>(a);
        cells.addAll(b);
        return List.copyOf(cells);
    }
}
