package com.kcdformes.domain.model;

public enum EnemyType {
    // PV de base +25 % (passe d'équilibrage) : ce socle se cumule avec le scaling
    // par vague de WaveFactory, qui ne touche que la progression, pas le départ.
    //
    // goldReward réduit de ~45-50 % (passe d'équilibrage économique) : combiné au
    // nombre d'ennemis qui croît linéairement par vague (voir WaveFactory), les
    // anciennes valeurs faisaient grimper le revenu du joueur plus vite que la
    // difficulté, supprimant toute rareté de l'or en milieu/fin de partie.
    //
    // goldReward remonté de +20 % ensuite (retour d'expérience : mort en vague 7,
    // budget de construction/upgrade trop serré pour viser la vague 10) :
    // GOBLIN 6->7, ORC 14->17, TROLL 32->38, DARK_KNIGHT 42->50, SAPEUR 18->22.
    // Objectif : rendre la vague 10 atteignable sans la garantir (pas un simple
    // détricotage du nerf précédent, qui visait un problème différent — la
    // croissance du nombre d'ennemis par vague, toujours valable).
    //
    // goldReward remonté de +25 % supplémentaires :
    // GOBLIN 7->9, ORC 17->21, TROLL 38->48, DARK_KNIGHT 50->63, SAPEUR 22->28.
    // wallDamage (7e paramètre) : dégâts de contact contre un mur-barrage, par
    // tick, PAR TYPE — écarts volontairement marqués pour que la composition de
    // la vague détermine la durée de vie d'un mur. Le Goblin gratte (1), le
    // Troll démolit (8) : un mur qui tient 3 vagues de piétaille tombe en une
    // vague de Trolls. Remplace l'ancien dérivé castleDamage/5, trop plat pour
    // se ressentir en jeu.
    GOBLIN(38, 0.3, 9, 5, false, 0, 1, null, false),
    ORC(100, 0.16, 21, 10, false, 0, 3, null, false),
    // Ray(1, 2.5) : démolisseur d'appoint — en défilant, le Troll grignote la
    // tour la plus proche (~30-45 dégâts par passage, il est lent). Pression
    // diffuse qui s'ajoute au Chariot (rayon dédié, plus fort et plus long) :
    // une vague à Trolls use la première ligne même sans Sapeur ni Chariot.
    TROLL(250, 0.1, 48, 20, false, 0, 8, new Ray(1, 2.5), false),
    // ARMURE ENCHANTÉE (magicArmor) : seuls les Mages le blessent. Les tours
    // physiques le ciblent et tirent quand même — tout RICOCHE (dégâts 0,
    // éclats de Catapulte compris) : c'est un LEURRE qui aspire la cadence de
    // la défense pendant que la piétaille défile derrière. Double punition
    // pour un build sans Mage : il fuit ET gaspille vos tirs. Synergie voulue :
    // le mur le bloque pendant qu'un Mage le dissout (voir wallDamage ci-dessous).
    // wallDamage 4 -> 12 (x3 façon Sapeur) : le Chevalier noir défonce les
    // portes — un mur qui le bloque tombe vite, et on ne peut le dissoudre
    // qu'à la magie pendant qu'il cogne. Le duo mur+Mage reste son contre,
    // mais le mur seul n'achète que quelques secondes.
    DARK_KNIGHT(188, 0.2, 63, 15, false, 0, 12, null, true),
    /**
     * Nouvel ennemi (à partir de la vague 3, voir WaveFactory) : au lieu de
     * suivre le chemin jusqu'au château, dévie pour foncer sur la tour la plus
     * proche (sans limite de portée) et la détruit à coups de dégâts de siège
     * (voir WaveSimulationService.handleSapperTick) — la tour est perdue
     * définitivement, sa case redevient constructible. S'il survit à sa cible,
     * il enchaîne ensuite sur la tour suivante la plus proche, et ainsi de
     * suite jusqu'à ce qu'il ne reste plus aucune tour sur la map ; ce n'est
     * qu'à ce moment-là qu'il reprend sa route vers le château.
     */
    // PV +20 % (180, au lieu de 150) : le rend plus difficile à abattre en route
    // vers sa tour cible, pour augmenter la pression qu'il met sur le joueur.
    // Dégâts de siège 12 -> 8 (harnais d'équilibrage, voir BalanceHarnessTest) :
    // à 12, les Sapeurs détruisaient les tours plus vite que l'économie ne
    // permettait de les racheter (4-5 tours perdues PAR VAGUE dès la vague 5,
    // mort médiane vague 7 quel que soit le build, boss vague 10 inatteignable).
    // À 8, un Archer (150 PV) tient 19 ticks de siège au lieu de 13 — le temps
    // pour la défense de tuer le Sapeur avant de perdre la tour.
    // wallDamage 2 : cas rare — un Sapeur ne subit le blocage d'un mur que
    // s'il est déjà en train de suivre le chemin ; face aux structures, son
    // vrai outil reste le siège en déviation (8 x3 contre les murs, voir
    // WALL_SAPPER_MULTIPLIER).
    SAPEUR(180, 0.12, 28, 8, true, 8, 2, null, false),

    /**
     * Engin de siège (à partir de la vague 8, voir WaveFactory.CHARIOT_THRESHOLD,
     * plafonné à 3/vague) : descend le couloir SANS jamais dévier ni s'arrêter,
     * en canalisant son rayon (Ray 3/tick, portée 3.0) sur la tour non détruite
     * la plus proche — retarget permanent, il tire sur ce qui passe à portée,
     * il ne se fixe sur rien. Décision de design : le Sapeur ne doit pas être
     * l'UNIQUE menace sur les tours, sinon son contre une fois construit, plus
     * rien n'use la défense et la partie est gagnée d'avance (constaté en
     * partie réelle). Trois vecteurs, trois contres : le Sapeur se snipe avant
     * contact, le Chariot se tue à distance (massif : cible x2 de la Baliste)
     * ou s'encaisse en réparant, le Boss se gère au positionnement.
     * Lent et blindé : ~150 dégâts de rayon par passage en première ligne.
     * PV 300 -> 450 (retour de partie : mourait trop vite pour peser) — le
     * blindage est son identité, la Baliste (x2) reste son bourreau attitré.
     */
    CHARIOT(450, 0.09, 55, 12, false, 0, 6, new Ray(3, 3.0), false),

    /**
     * Premier boss du jeu (voir WaveFactory.BOSS_MILESTONE_INTERVAL) : apparaît
     * toutes les 10 vagues, accompagné d'une escorte d'ennemis classiques (voir
     * WaveFactory.generateEnemies). Contrairement au Sapeur, il ne dévie jamais
     * du chemin vers le château : à la place, toutes les abilityIntervalTicks,
     * il (1) soigne les ennemis proches d'une fraction (auraHealRatio) de leurs
     * PV max dans un rayon auraRadius, et (2) inflige aoeDamage à toutes les
     * tours dans un rayon aoeRadius ET les étourdit stunDurationTicks (elles
     * cessent de tirer — voir WaveSimulationService.handleBossAbilityTick).
     * L'étourdissement fait du boss une zone morte MOBILE : plutôt que de
     * gonfler ses PV, il neutralise temporairement la défense sur son passage —
     * c'est en l'encadrant à distance ou en diversifiant les positions qu'on le
     * gère, pas en empilant du DPS au contact. PV de base très élevés, encore
     * amplifiés par le scaling multiplicatif par vague (HP_GROWTH_RATE) : à la
     * vague 10 il dépasse déjà largement les PV d'un Troll de la même vague.
     */
    // stunDurationTicks 25 sur un pulse de 40 : les tours au contact perdent
    // ~60 % de leur uptime tant que le boss est à portée — fort mais localisé,
    // et ça se dissipe dès qu'il s'éloigne.
    // aoeRadius 2.0 -> 3.0 (aligné sur auraRadius) : avec le couloir strict, les
    // tours légales sont à 2 cases perpendiculaires du chemin — à 2.0, un boss
    // centré ne pouvait les toucher qu'à dx=0 exactement : son AoE ne touchait en
    // pratique jamais rien. À 3.0, la fenêtre est de +/-2.2 cases : chaque tour
    // en première ligne prend au moins un pulse au passage du boss.
    // rayDamage 2/tick (rayon continu type tour Mage, mais inversé : le boss
    // canalise sur la tour la plus proche dans son rayon de menace) : une tour
    // en première ligne encaisse ~90-110 dégâts sur tout le passage du boss —
    // survivable pour une tour saine, fatal pour une tour déjà entamée.
    // Vitesse 0.07 -> 0.08 : réduit d'autant la fenêtre d'exposition au rayon
    // et rend le boss un peu moins facile à focaliser.
    // wallDamage 10 : au contact d'un mur qui lui barre la route, le Boss le
    // démonte vite — s'ajoutent son rayon (2/tick) et son pulse (15), un mur
    // ne le retient qu'une poignée de secondes, c'est voulu.
    BOSS_WARLORD(900, 0.08, 220, 40, false, 0, 10, new Ray(2, 3.0), false,
            true, 0.06, 3.0, 15, 3.0, 40, 25);

    public final int baseHp;
    public final double speed;
    public final int goldReward;
    /** Dégâts infligés au château lorsque cet ennemi atteint la fin du chemin. */
    public final int castleDamage;
    /** Si vrai, dévie du chemin pour cibler et détruire la tour la plus proche. */
    public final boolean attacksTowers;
    /** Dégâts de siège infligés à la tour ciblée, par tick, une fois à portée de mêlée. */
    public final int siegeDamage;
    /** Dégâts de contact contre un mur-barrage qui bloque cet ennemi, par tick (voir les valeurs sur l'enum). */
    public final int wallDamage;
    /** Si vrai, c'est un boss : déclenche le pulse d'aura/AoE (voir WaveSimulationService.handleBossAbilityTick). */
    public final boolean isBoss;
    /** Fraction des PV max soignée à chaque ennemi proche à chaque pulsation (boss uniquement). */
    public final double auraHealRatio;
    /** Rayon (en cases) de l'aura de soin (boss uniquement). */
    public final double auraRadius;
    /** Dégâts infligés à chaque tour dans aoeRadius à chaque pulsation (boss uniquement). */
    public final int aoeDamage;
    /** Rayon (en cases) de l'attaque de zone périodique (boss uniquement). */
    public final double aoeRadius;
    /** Intervalle (en ticks) entre deux pulsations d'aura/AoE (boss uniquement). */
    public final int abilityIntervalTicks;
    /**
     * Durée (en ticks) de l'étourdissement infligé aux tours touchées par le
     * pulse : une tour étourdie cesse de tirer (boss uniquement). État de combat
     * éphémère, géré dans la simulation (voir WaveSimulationService.towerStuns) —
     * jamais persisté sur la tour.
     */
    public final int stunDurationTicks;
    /**
     * Rayon de siège continu (profil "tour Mage" inversé) : chaque tick, sans
     * cooldown et tout en avançant, l'ennemi canalise damagePerTick sur la tour
     * non détruite la plus proche dans range (voir
     * WaveSimulationService.handleSiegeRayTick). Généralisé du Boss au Troll et
     * au Chevalier noir : le Sapeur ne doit pas être l'unique menace sur les
     * tours. Null = pas de rayon.
     */
    public record Ray(int damagePerTick, double range) {}

    public final Ray ray;
    /**
     * Armure enchantée : seules les tours de type MAGE peuvent blesser cet
     * ennemi. Les tours physiques le ciblent et tirent quand même — leurs
     * dégâts sont annulés au point d'impact (voir
     * WaveSimulationService.applyDamage) : rôle de LEURRE, il consomme la
     * cadence de la défense. Seule la passe prioritaire perce-blindage de la
     * Baliste l'évite.
     */
    public final boolean magicArmor;

    EnemyType(int baseHp, double speed, int goldReward, int castleDamage,
              boolean attacksTowers, int siegeDamage, int wallDamage, Ray ray, boolean magicArmor) {
        this(baseHp, speed, goldReward, castleDamage, attacksTowers, siegeDamage, wallDamage, ray, magicArmor,
                false, 0, 0, 0, 0, 0, 0);
    }

    // NOTE : liste de paramètres toujours longue — le record Ray a montré la
    // voie : à la prochaine capacité, regrouper le bloc boss (aura/pulse/stun)
    // dans un record BossProfile du même genre.
    EnemyType(int baseHp, double speed, int goldReward, int castleDamage,
              boolean attacksTowers, int siegeDamage, int wallDamage, Ray ray, boolean magicArmor,
              boolean isBoss, double auraHealRatio, double auraRadius,
              int aoeDamage, double aoeRadius, int abilityIntervalTicks,
              int stunDurationTicks) {
        this.baseHp = baseHp;
        this.speed = speed;
        this.goldReward = goldReward;
        this.castleDamage = castleDamage;
        this.attacksTowers = attacksTowers;
        this.siegeDamage = siegeDamage;
        this.wallDamage = wallDamage;
        this.ray = ray;
        this.magicArmor = magicArmor;
        this.isBoss = isBoss;
        this.auraHealRatio = auraHealRatio;
        this.auraRadius = auraRadius;
        this.aoeDamage = aoeDamage;
        this.aoeRadius = aoeRadius;
        this.abilityIntervalTicks = abilityIntervalTicks;
        this.stunDurationTicks = stunDurationTicks;
    }
}
