package com.kcdformes.domain.model;

public enum TowerType {
    // Cadences réduites par rapport à la version initiale : les ennemis restent
    // longtemps à portée d'une tour fixe (ils sont lents), donc une cadence trop
    // élevée cumule un dégât largement supérieur à leurs PV avant qu'ils ne
    // sortent de portée — une seule tour suffisait alors à tenir indéfiniment.
    // Resserrées une nouvelle fois (toujours trop facile en test local).
    // baseDamage encore réduit de 20 % (DPS = baseDamage * attackSpeed) :
    // ARCHER 15->12, MAGE 30->24, CATAPULT 50->40, BALLISTA 80->64.
    //
    // Profils de dégâts (DamageType) : mono-cible inchangé pour Archer/Baliste
    // (tir précis), zone pour la Catapulte (projectile à éclats, cohérent avec
    // le lore "siège"), continu pour le Mage (rayon magique sans cooldown).
    // Pour MAGE, attackSpeed n'est plus utilisé (dégâts appliqués chaque tick) :
    // baseDamage a été recalé à l'équivalent de l'ancien DPS moyen (24*0.45≈11)
    // pour ne pas re-déséquilibrer en changeant juste le profil de tir.
    ARCHER(12, 3.0, 50, 0.6, 0, DamageType.SINGLE_TARGET, 0),
    MAGE(11, 2.5, 100, 0.45, 0, DamageType.CONTINUOUS, 0),
    // baseDamage réduit de 40 à 27 (-33 %) : la zone restait trop dominante en
    // pratique (un seul tir touchait la cible principale + tous les ennemis
    // groupés dans splashRadius, pour un DPS effectif largement supérieur aux
    // autres profils à coût équivalent).
    // Cadence franchement ralentie 0.3->0.1 (tir toutes les 10 ticks, ~1,2 s) :
    // vraie arme de siège lente, l'animation du marteau (17 frames @32 fps ≈
    // 531 ms, voir TOWER_ANIM) finit largement avant le tir suivant → 1 marteau
    // = 1 explosion. Équilibrage volontairement mis de côté (DPS ~4/tick), à
    // réajuster plus tard (baseDamage/splash) si la catapulte devient trop faible.
    CATAPULT(40, 4.0, 150, 0.1, 0, DamageType.AOE, 1.5),
    // Tour débloquée par la progression de compte (meilleure vague atteinte),
    // pas par l'or de la partie en cours : voir GameService.placeTower().
    // PERCE-BLINDAGE (heavyTargetMultiplier x2) : dégâts doublés contre les
    // cibles massives (voir WaveSimulationService.HEAVY_TARGET_HP_THRESHOLD —
    // Troll, Chevalier noir, Sapeur, Boss), inchangés contre la piétaille.
    // Sans ça, la baliste n'était qu'un archer cher (même profil, x5 le prix) :
    // elle est désormais LE choix anti-élite, inutile contre les Goblins.
    // Profil "sniper de siège" (64/0.22 -> 110/0.12) : DPS soutenu quasi
    // inchangé (14.1 -> 13.2/tick) mais chaque carreau est un événement —
    // 220 sur un élite : un Sapeur de base tombe d'UN tir, un Troll en deux.
    // Sa faiblesse assumée : la cadence — noyée sous la piétaille, elle perd.
    BALLISTA(110, 5.0, 200, 0.12, 10, DamageType.SINGLE_TARGET, 0, 0, 2.0),

    /**
     * Mur-barrage (voir GAME_DESIGN 2.7) : structure passive posée SUR le couloir
     * des ennemis (seule exception au couloir strict, voir PlaceTowerService) —
     * il ne tire pas (baseDamage 0), il bloque : les ennemis s'arrêtent devant et
     * l'attaquent au contact jusqu'à le détruire (voir
     * WaveSimulationService.handleWallBlocking ; Sapeur ×3, c'est son métier).
     * Il ne force JAMAIS de contournement — le chemin reste fixe. Vendu au prix
     * d'une case (barrer le couloir complet = 3 cases ≈ le prix d'une Mage) ;
     * ses PV ne dérivent pas du coût (voir structureHp) sinon 35 d'or ne
     * paieraient que ~105 PV, cassés en 2 pulses de boss.
     * Débloqué vague 6 (avant la baliste) : c'est l'outil défensif de la crise
     * des vagues 6-9 (arrivée du mix élite et des Sapeurs), là où la baliste
     * reste la récompense du premier boss.
     */
    WALL(0, 0, 35, 0, 6, DamageType.SINGLE_TARGET, 0, 450);

    public final int baseDamage;
    public final double baseRange;
    public final int baseCost;
    /** Ignoré pour DamageType.CONTINUOUS (pas de cooldown, dégâts chaque tick). */
    public final double attackSpeed;
    /** Vague (bestWave du compte) requise pour débloquer cette tour. 0 = débloquée d'office. */
    public final int unlockWave;
    public final DamageType damageType;
    /** Rayon de l'effet de zone autour de la cible principale. Utilisé seulement si damageType == AOE. */
    public final double splashRadius;
    /**
     * PV de structure explicites : 0 = dérivés du coût comme pour toutes les
     * tours (voir Tower.getMaxHp, baseCost x 3). Une valeur > 0 découple PV et
     * prix — nécessaire pour le WALL, dont tout l'intérêt est d'être bien plus
     * résistant que son coût à la case ne le permettrait.
     */
    public final int structureHp;
    /**
     * Multiplicateur de dégâts contre les cibles massives (maxHp au-delà de
     * WaveSimulationService.HEAVY_TARGET_HP_THRESHOLD). 1.0 = pas de bonus.
     * Identité de la Baliste (perce-blindage) : voir son commentaire.
     */
    public final double heavyTargetMultiplier;

    TowerType(int baseDamage, double baseRange, int baseCost, double attackSpeed, int unlockWave,
              DamageType damageType, double splashRadius) {
        this(baseDamage, baseRange, baseCost, attackSpeed, unlockWave, damageType, splashRadius, 0, 1.0);
    }

    TowerType(int baseDamage, double baseRange, int baseCost, double attackSpeed, int unlockWave,
              DamageType damageType, double splashRadius, int structureHp) {
        this(baseDamage, baseRange, baseCost, attackSpeed, unlockWave, damageType, splashRadius, structureHp, 1.0);
    }

    TowerType(int baseDamage, double baseRange, int baseCost, double attackSpeed, int unlockWave,
              DamageType damageType, double splashRadius, int structureHp, double heavyTargetMultiplier) {
        this.baseDamage = baseDamage;
        this.baseRange = baseRange;
        this.baseCost = baseCost;
        this.attackSpeed = attackSpeed;
        this.unlockWave = unlockWave;
        this.damageType = damageType;
        this.splashRadius = splashRadius;
        this.structureHp = structureHp;
        this.heavyTargetMultiplier = heavyTargetMultiplier;
    }
}
