import Phaser from 'phaser'

const CELL_SIZE = 40
const GRID_WIDTH = 20
const GRID_HEIGHT = 15
const TICK_DELAY_MS = 120

export interface TowerData {
    id: string
    type: 'ARCHER' | 'MAGE' | 'CATAPULT' | 'BALLISTA' | 'WALL'
    x: number
    y: number
    // Renvoyés par le backend (TowerResponse) — pilotent le rendu visuel des
    // effets de combat (voir drawEffects) sans dupliquer côté frontend la
    // logique de profil de dégâts définie dans TowerType côté Java.
    damageType?: 'SINGLE_TARGET' | 'AOE' | 'CONTINUOUS'
    splashRadius?: number
    // PV courants/max de la structure — absents tant que le backend n'a pas
    // été redéployé avec le champ (voir GameMapMapper) ; dans ce cas on ne
    // dessine simplement pas de barre de vie pour la tour.
    hp?: number
    maxHp?: number
}

export interface EnemySnapshot {
    id: string
    type: string
    x: number
    y: number
    hp: number
    maxHp: number
}

export interface DamageEvent {
    towerId: string
    enemyId: string
    damage: number
}

// Dégât infligé par un Sapeur à la tour qu'il assiège (voir
// WaveSimulationService.TowerDamageEvent côté backend) — distinct de
// DamageEvent (tour → ennemi) puisque le sens de l'attaque est inversé ici.
export interface TowerDamageEvent {
    enemyId: string
    towerId: string
    damage: number
}

// Pulsation d'aura/AoE d'un Boss (voir WaveSimulationService.BossAbilityEvent
// côté backend) : un évènement par Boss à chaque déclenchement, même quand
// alliesHealed/towersHit valent 0 — sert à animer le pulse à l'écran.
export interface BossAbilityEvent {
    bossId: string
    x: number
    y: number
    alliesHealed: number
    towersHit: number
}

export interface TickSnapshot {
    tick: number
    // Tours étourdies par le pulse d'un Boss pendant ce tick (état complet par
    // tick, recalculé côté backend) : grisées tant qu'elles y figurent — le
    // frontend ne compte aucune durée lui-même.
    stunnedTowers: string[]
    enemies: EnemySnapshot[]
    damageEvents: DamageEvent[]
    towerDamageEvents: TowerDamageEvent[]
    deaths: string[]
    reachedCastle: string[]
    destroyedTowers: string[]
    bossAbilityEvents: BossAbilityEvent[]
    castleHp: number
}

// Couleurs par type de tour
const TOWER_COLORS: Record<string, number> = {
    ARCHER: 0x22c55e,   // vert
    MAGE: 0x8b5cf6,     // violet
    CATAPULT: 0xf97316, // orange
    BALLISTA: 0x94a3b8, // gris-bleu
    WALL: 0x78716c,     // pierre — structure passive, volontairement terne
}

// Couleurs par type d'ennemi
const ENEMY_COLORS: Record<string, number> = {
    GOBLIN: 0x84cc16,      // vert clair
    ORC: 0xb45309,         // marron
    TROLL: 0x6b7280,       // gris
    DARK_KNIGHT: 0x4338ca, // violet sombre
    SAPEUR: 0xdc2626,      // rouge — signale visuellement la menace sur les tours
    CHARIOT: 0x0ea5e9,     // cyan acier — l'engin de siège qui tire en avançant
    BOSS_WARLORD: 0xeab308, // or — distinct de tout le reste, signale le premier boss
}

// Couleur de la ligne de siège (Sapeur → tour visée), distincte des couleurs
// de tir des tours pour ne jamais être confondue avec une attaque de tour.
const SIEGE_LINE_COLOR = 0xdc2626

// Rayon continu du Boss (profil "tour Mage" inversé, voir EnemyType.rayDamage) :
// violet pour évoquer la magie du Mage tout en restant distinct du rouge Sapeur.
const BOSS_RAY_COLOR = 0x8b5cf6

// Couleurs des pulsations de Boss (voir drawBossAbilityEvents) : vert pour le
// soin de zone, orange pour l'attaque de zone — pour rester cohérent avec les
// codes couleur déjà utilisés ailleurs (vert = positif, orange/rouge = dégâts).
const BOSS_HEAL_PULSE_COLOR = 0x22c55e
const BOSS_AOE_PULSE_COLOR = 0xf97316

// Atlas d'ennemis (voir preload / manifest.json) : frames 96x96, 12 frames de
// marche (index 0-11) puis 10 de mort (12-21). SPRITE_ENEMY_TYPES : types dont
// l'atlas est branché — les autres restent en formes géométriques le temps de
// la généralisation.
const SPRITE_CELL = 96
const SPRITE_WALK = { start: 0, end: 11 }
const SPRITE_DIE = { start: 12, end: 21 }
const SPRITE_ATTACK = { start: 22, end: 31 }
const SPRITE_ENEMY_TYPES = [
    'GOBLIN', 'ORC', 'TROLL', 'SAPEUR', 'CHARIOT', 'DARK_KNIGHT', 'BOSS_WARLORD',
]

// Effets d'impact animés (public/sprites/effects/) : jouent une fois à la
// position de l'ennemi touché, puis s'auto-détruisent. Mappés par type de tour.
const EFFECT_CELL = 64
const EFFECT_KEYS = ['heavy', 'explosion', 'fireball', 'firearrow']
const TOWER_IMPACT: Record<string, string> = {
    ARCHER: 'firearrow',   // flèche de feu à l'impact
    BALLISTA: 'heavy',     // gros impact perçant (perce-blindage)
    CATAPULT: 'explosion', // nuage de poussière (impact de rocher)
    // MAGE : boule de feu cadencée sur son rayon continu (voir drawEffects).
}
// Période (en frames) entre deux éclats de magie du Mage — l'anim dure ~8
// frames/20fps ≈ 400ms, une période de 3 ticks donne un scintillement quasi
// continu sans chevauchement excessif.
const MAGIC_FX_PERIOD = 3

export class GameScene extends Phaser.Scene {
    private gridGraphics!: Phaser.GameObjects.Graphics
    private towersGraphics!: Phaser.GameObjects.Graphics
    private enemiesGraphics!: Phaser.GameObjects.Graphics
    // Calque dédié aux effets de combat (rayon continu, cercle de zone, tir
    // mono-cible) — séparé de enemiesGraphics pour pouvoir le vider/redessiner
    // indépendamment à chaque tick sans repasser par drawEnemies.
    private effectsGraphics!: Phaser.GameObjects.Graphics
    private onCellClick?: (x: number, y: number) => void
    private waveTimer?: Phaser.Time.TimerEvent
    // Indexées par id pour retrouver rapidement la tour à l'origine d'un
    // DamageEvent pendant playWave (position + profil de dégâts). Contient des
    // COPIES des données React (voir drawTowers) : les PV y sont décrémentés en
    // direct pendant l'animation (voir renderTick) sans toucher au store.
    private towersById = new Map<string, TowerData>()
    // Lettres des tours : GameObjects indépendants de towersGraphics, à détruire
    // explicitement à chaque redraw (voir drawTowers) sous peine de fuite.
    private towerTexts: Phaser.GameObjects.Text[] = []
    // Tours reçues AVANT que la scène soit prête (create() est asynchrone) :
    // rejouées à la fin de create(). Cas typique : reprise de partie persistée
    // (gameId en localStorage) où la réponse du serveur peut arriver avant
    // l'initialisation de Phaser — sans ce tampon, le premier drawTowers était
    // silencieusement perdu et les tours n'apparaissaient jamais à l'écran.
    private pendingTowers: TowerData[] | null = null
    // Sprites d'ennemis animés (CraftPix), indexés par id d'ennemi — réutilisés
    // d'un tick à l'autre, détruits quand l'ennemi disparaît (mort/fuite) ou en
    // fin de vague. Seuls les types listés dans SPRITE_ENEMY_TYPES ont un atlas
    // chargé ; les autres retombent sur les formes géométriques (drawEnemies).
    private enemySprites = new Map<string, Phaser.GameObjects.Sprite>()
    // Dernier tick où chaque Mage a émis son éclat de magie (cadencé pour un
    // scintillement continu sans spawn à chaque tick — voir drawEffects).
    private magicFxTick = new Map<string, number>()

    constructor() {
        super({ key: 'GameScene' })
    }

    preload() {
        // Atlas d'ennemis (public/sprites/enemies/, voir manifest.json) : une
        // spritesheet horizontale par type, frames 96x96, marche puis mort.
        // Démarrage progressif : le Goblin seul pour valider taille/vitesse
        // avant de généraliser aux 6 autres.
        SPRITE_ENEMY_TYPES.forEach((type) => {
            this.load.spritesheet(`enemy-${type}`, `/sprites/enemies/${type}.png`, {
                frameWidth: SPRITE_CELL,
                frameHeight: SPRITE_CELL,
            })
        })
        // Effets d'impact (slash, gros impact, explosion, magie).
        EFFECT_KEYS.forEach((key) => {
            this.load.spritesheet(`fx-${key}`, `/sprites/effects/${key}.png`, {
                frameWidth: EFFECT_CELL,
                frameHeight: EFFECT_CELL,
            })
        })
    }

    create() {
        this.gridGraphics = this.add.graphics()
        this.towersGraphics = this.add.graphics()
        this.enemiesGraphics = this.add.graphics()
        this.effectsGraphics = this.add.graphics()

        // Animations marche (bouclée) + mort (une fois) par type à sprite.
        SPRITE_ENEMY_TYPES.forEach((type) => {
            if (!this.anims.exists(`${type}-walk`)) {
                this.anims.create({
                    key: `${type}-walk`,
                    frames: this.anims.generateFrameNumbers(`enemy-${type}`, SPRITE_WALK),
                    frameRate: 12,
                    repeat: -1,
                })
            }
            if (!this.anims.exists(`${type}-die`)) {
                this.anims.create({
                    key: `${type}-die`,
                    frames: this.anims.generateFrameNumbers(`enemy-${type}`, SPRITE_DIE),
                    frameRate: 14,
                    repeat: 0,
                })
            }
            if (!this.anims.exists(`${type}-attack`)) {
                this.anims.create({
                    key: `${type}-attack`,
                    frames: this.anims.generateFrameNumbers(`enemy-${type}`, SPRITE_ATTACK),
                    frameRate: 14,
                    repeat: -1,
                })
            }
        })

        // Effets d'impact : one-shot (repeat 0), le sprite s'auto-détruit à la fin.
        EFFECT_KEYS.forEach((key) => {
            if (!this.anims.exists(`fx-${key}`)) {
                this.anims.create({
                    key: `fx-${key}`,
                    frames: this.anims.generateFrameNumbers(`fx-${key}`, {}),
                    frameRate: 20,
                    repeat: 0,
                })
            }
        })

        this.drawGrid()
        this.drawPath()

        // Rejoue les tours arrivées pendant l'initialisation de la scène
        // (reprise de partie : la réponse du serveur peut précéder ce create()).
        if (this.pendingTowers) {
            const pending = this.pendingTowers
            this.pendingTowers = null
            this.drawTowers(pending)
        }

        // Écoute les clics sur le canvas
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const cellX = Math.floor(pointer.x / CELL_SIZE)
            const cellY = Math.floor(pointer.y / CELL_SIZE)

            // Vérifie seulement que le clic est dans la grille : la règle du
            // couloir (interdit aux tours, obligatoire pour le mur) dépend du
            // type sélectionné, que seule la page connaît — voir handleCellClick.
            if (
                cellX >= 0 && cellX < GRID_WIDTH &&
                cellY >= 0 && cellY < GRID_HEIGHT
            ) {
                this.onCellClick?.(cellX, cellY)
            }
        })
    }

    update() {
        // Game loop — la boucle de combat est rejouée via playWave(), pas ici.
    }

    shutdown() {
        this.waveTimer?.remove()
        this.clearEnemySprites()
    }

    // ── API publique appelée depuis React ────────────────────────────────

    setOnCellClick(callback: (x: number, y: number) => void) {
        this.onCellClick = callback
    }

    drawTowers(towers: TowerData[]) {
        if (!this.towersGraphics) {
            // Scène pas encore initialisée : mémoriser pour rejouer en fin de
            // create() plutôt que de perdre silencieusement l'affichage.
            this.pendingTowers = towers
            return
        }
        this.towersGraphics.clear()

        // Les textes Phaser sont des GameObjects indépendants du Graphics : sans
        // destruction explicite, chaque redraw empilait de nouvelles lettres sur
        // les anciennes (leak), et une tour détruite laissait sa lettre fantôme
        // à l'écran.
        this.towerTexts.forEach((text) => text.destroy())
        this.towerTexts = []

        this.towersById.clear()
        // Copie défensive : playWave met à jour les PV en direct (voir renderTick)
        // sur les objets de towersById — cloner isole ces mutations d'animation
        // des données React/Zustand, qui restent la copie de référence jusqu'au
        // refetch de fin de vague.
        towers.forEach((tower) => this.towersById.set(tower.id, { ...tower }))

        this.towersById.forEach((tower) => {
            const color = TOWER_COLORS[tower.type] ?? 0xffffff
            const px = tower.x * CELL_SIZE
            const py = tower.y * CELL_SIZE

            // Mur-barrage : bloc pleine case avec liseré (il OCCUPE le couloir,
            // ce n'est pas une tour posée sur une case), sans lettre — sa forme
            // suffit à l'identifier, et la barre de vie reste lisible dessus.
            if (tower.type === 'WALL') {
                this.towersGraphics.fillStyle(color, 1)
                this.towersGraphics.fillRect(px, py, CELL_SIZE, CELL_SIZE)
                this.towersGraphics.lineStyle(2, 0x57534e, 1) // stone-600, effet maçonnerie
                this.towersGraphics.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2)
                this.towersGraphics.lineBetween(px, py + CELL_SIZE / 2, px + CELL_SIZE, py + CELL_SIZE / 2)
                this.drawStructureHpBar(tower, px, py)
                return
            }

            // Dessine un carré coloré pour la tour
            this.towersGraphics.fillStyle(color, 1)
            this.towersGraphics.fillRect(
                px + 4, py + 4,
                CELL_SIZE - 8, CELL_SIZE - 8
            )

            // Lettre initiale du type
            this.towerTexts.push(this.add.text(
                px + CELL_SIZE / 2,
                py + CELL_SIZE / 2,
                tower.type[0],
                { fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }
            ).setOrigin(0.5))

            this.drawStructureHpBar(tower, px, py)
        })
    }

    /**
     * Barre de vie de la structure (tour ou mur) — affichée uniquement si elle a
     * déjà subi des dégâts (Sapeur, rayon/pulse de Boss, mêlée contre un mur) ;
     * une structure intacte ou dont le backend n'envoie pas encore hp/maxHp ne
     * l'affiche pas, pour ne pas surcharger l'écran en l'absence de menace.
     */
    private drawStructureHpBar(tower: TowerData, px: number, py: number) {
        if (tower.hp == null || tower.maxHp == null || tower.hp >= tower.maxHp) return

        const hpRatio = tower.maxHp > 0 ? Math.max(0, tower.hp / tower.maxHp) : 0
        const barWidth = CELL_SIZE * 0.8
        const barX = px + CELL_SIZE / 2 - barWidth / 2
        const barY = py - 6

        this.towersGraphics.fillStyle(0x000000, 0.5)
        this.towersGraphics.fillRect(barX, barY, barWidth, 4)
        this.towersGraphics.fillStyle(hpRatio > 0.3 ? 0x22c55e : 0xef4444, 1)
        this.towersGraphics.fillRect(barX, barY, barWidth * hpRatio, 4)
    }

    /**
     * Rejoue le journal de ticks d'une vague reçu du backend : un tick = un instant
     * de la simulation (positions des ennemis, vie courante, dégâts au château).
     * Les ennemis sont redessinés à chaque tick à un rythme fixe (TICK_DELAY_MS).
     */
    playWave(
        ticks: TickSnapshot[],
        onTick?: (castleHp: number) => void,
        onComplete?: () => void
    ) {
        // Scène pas (ou plus) initialisée : signaler quand même la fin plutôt que
        // de sortir en silence — sinon l'appelant ne reçoit jamais onComplete et
        // l'UI reste verrouillée en "combat en cours" (voir GameCanvas/page).
        if (!this.enemiesGraphics) {
            onComplete?.()
            return
        }
        this.waveTimer?.remove()

        let index = 0

        const renderTick = () => {
            if (index >= ticks.length) {
                this.enemiesGraphics.clear()
                this.effectsGraphics.clear()
                this.clearEnemySprites()
                this.waveTimer?.remove()
                this.waveTimer = undefined
                onComplete?.()
                return
            }

            const tick = ticks[index]

            // Dégâts de siège de ce tick (Sapeur ou pulse de Boss) : appliqués en
            // direct aux copies locales (voir towersById) pour que les jauges des
            // tours baissent PENDANT l'animation — sans ça, les dégâts du Boss
            // étaient invisibles jusqu'au refetch de fin de vague et son attaque
            // de zone passait pour purement cosmétique. Une tour détruite doit en
            // plus disparaître immédiatement de l'affichage (et de towersById,
            // sinon drawEffects continuerait de lui trouver une position).
            if (tick.towerDamageEvents.length > 0 || tick.destroyedTowers.length > 0) {
                tick.towerDamageEvents.forEach((event) => {
                    const tower = this.towersById.get(event.towerId)
                    if (tower && tower.hp != null) {
                        tower.hp = Math.max(0, tower.hp - event.damage)
                    }
                })
                tick.destroyedTowers.forEach((towerId) => this.towersById.delete(towerId))
                this.drawTowers(Array.from(this.towersById.values()))
            }

            // Ennemis qui frappent une tour ce tick (siège du Sapeur, rayon d'un
            // Chariot/Boss, ou n'importe qui bloqué contre un mur) : jouent leur
            // anim d'attaque au lieu de marcher (voir drawEnemies).
            const attackingIds = new Set(tick.towerDamageEvents.map((e) => e.enemyId))

            this.effectsGraphics.clear()
            this.drawEnemies(tick.enemies, tick.deaths, attackingIds)
            this.drawEffects(tick.damageEvents, tick.towerDamageEvents, tick.enemies, index)
            this.drawBossAbilityEvents(tick.bossAbilityEvents)
            this.drawStunnedTowers(tick.stunnedTowers ?? [])
            onTick?.(tick.castleHp)
            index++
        }

        renderTick()
        if (ticks.length > 1) {
            this.waveTimer = this.time.addEvent({
                delay: TICK_DELAY_MS,
                callback: renderTick,
                loop: true,
            })
        } else {
            onComplete?.()
        }
    }

    private drawEnemies(enemies: EnemySnapshot[], deaths: string[] = [], attackingIds: Set<string> = new Set()) {
        this.enemiesGraphics.clear()

        const alive = new Set(enemies.map((e) => e.id))
        const dying = new Set(deaths)
        for (const [id, sprite] of this.enemySprites) {
            if (alive.has(id)) continue
            if (dying.has(id) && sprite.anims.currentAnim?.key !== sprite.getData('dieKey')) {
                // Mort ce tick : joue l'animation de mort SUR PLACE (dernière
                // position connue), puis auto-destruction à la fin — le sprite
                // n'est plus dans les ticks suivants mais son GameObject survit
                // le temps de l'agonie.
                const dieKey = sprite.getData('dieKey') as string
                sprite.setData('dying', true)
                sprite.play(dieKey)
                sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
                    sprite.destroy()
                    this.enemySprites.delete(id)
                })
            } else if (!dying.has(id) && !sprite.getData('dying')) {
                // Sorti du champ (fuite/atteint le château) sans mourir : retrait sec.
                sprite.destroy()
                this.enemySprites.delete(id)
            }
        }

        enemies.forEach((enemy) => {
            const color = ENEMY_COLORS[enemy.type] ?? 0xffffff
            const px = enemy.x * CELL_SIZE + CELL_SIZE / 2
            const py = enemy.y * CELL_SIZE + CELL_SIZE / 2
            const isBoss = enemy.type === 'BOSS_WARLORD'
            const radius = isBoss ? CELL_SIZE * 0.55 : CELL_SIZE / 3

            if (SPRITE_ENEMY_TYPES.includes(enemy.type)) {
                // Anneau arcane sous le Chevalier noir : rappelle son armure
                // enchantée (seuls les Mages le blessent, voir EnemyType.magicArmor)
                // — l'info était portée par un liseré à l'époque des cercles.
                if (enemy.type === 'DARK_KNIGHT') {
                    this.enemiesGraphics.lineStyle(2, 0xa78bfa, 0.9)
                    this.enemiesGraphics.strokeEllipse(px, py + CELL_SIZE * 0.2, CELL_SIZE * 0.7, CELL_SIZE * 0.35)
                }

                // Rendu sprite animé : réutilise ou crée le GameObject de cet ennemi.
                let sprite = this.enemySprites.get(enemy.id)
                if (!sprite) {
                    sprite = this.add.sprite(px, py, `enemy-${enemy.type}`)
                    // Le contenu utile du chibi occupe ~2/3 du cadre 96px, on
                    // surdimensionne donc ; le Boss est nettement plus grand pour
                    // rester identifiable au milieu de son escorte.
                    const scale = isBoss ? CELL_SIZE * 2.6 : CELL_SIZE * 1.6
                    sprite.setDisplaySize(scale, scale)
                    sprite.setData('dieKey', `${enemy.type}-die`)
                    sprite.play(`${enemy.type}-walk`)
                    this.enemySprites.set(enemy.id, sprite)
                }
                // Marche ↔ attaque : bascule selon que l'ennemi frappe une tour ce
                // tick (towerDamageEvents). On ne relance pas l'anim si elle tourne
                // déjà (sinon elle repart à la frame 0 chaque tick, effet saccadé).
                const wantKey = attackingIds.has(enemy.id) ? `${enemy.type}-attack` : `${enemy.type}-walk`
                if (sprite.anims.currentAnim?.key !== wantKey) {
                    sprite.play(wantKey)
                }
                sprite.setPosition(px, py - CELL_SIZE * 0.25) // pieds ~au centre de la case
                this.drawEnemyHpBar(enemy, px, py, radius, isBoss)
                return
            }

            this.enemiesGraphics.fillStyle(color, 1)
            if (enemy.type === 'CHARIOT') {
                // Silhouette carrée : un ENGIN, pas une créature.
                this.enemiesGraphics.fillRect(px - radius, py - radius, radius * 2, radius * 2)
            } else {
                this.enemiesGraphics.fillCircle(px, py, radius)
            }
            if (isBoss) {
                this.enemiesGraphics.lineStyle(3, 0x000000, 0.8)
                this.enemiesGraphics.strokeCircle(px, py, radius)
            } else if (enemy.type === 'DARK_KNIGHT') {
                // Liseré arcane : armure enchantée (voir EnemyType.magicArmor).
                this.enemiesGraphics.lineStyle(2, 0xa78bfa, 0.9)
                this.enemiesGraphics.strokeCircle(px, py, radius + 2)
            }

            this.drawEnemyHpBar(enemy, px, py, radius, isBoss)
        })
    }

    /** Barre de vie au-dessus d'un ennemi (commune sprites et formes géométriques). */
    private drawEnemyHpBar(enemy: EnemySnapshot, px: number, py: number, radius: number, isBoss: boolean) {
        const hpRatio = enemy.maxHp > 0 ? Math.max(0, enemy.hp / enemy.maxHp) : 0
        const barWidth = isBoss ? CELL_SIZE * 1.4 : CELL_SIZE * 0.8
        const barX = px - barWidth / 2
        const barY = py - radius - 6

        this.enemiesGraphics.fillStyle(0x000000, 0.5)
        this.enemiesGraphics.fillRect(barX, barY, barWidth, 4)
        this.enemiesGraphics.fillStyle(hpRatio > 0.3 ? 0x22c55e : 0xef4444, 1)
        this.enemiesGraphics.fillRect(barX, barY, barWidth * hpRatio, 4)
    }

    /** Détruit tous les sprites d'ennemis (fin de vague / arrêt de scène). */
    private clearEnemySprites() {
        for (const sprite of this.enemySprites.values()) sprite.destroy()
        this.enemySprites.clear()
    }

    /**
     * Joue un effet d'impact one-shot à une position (case), puis s'auto-détruit.
     * scale : diamètre affiché en cases (l'explosion de Catapulte est agrandie
     * au rayon d'éclat pour signaler sa zone).
     */
    private spawnImpact(key: string, cellX: number, cellY: number, scale = 1) {
        const fx = this.add.sprite(
            cellX * CELL_SIZE + CELL_SIZE / 2,
            cellY * CELL_SIZE + CELL_SIZE / 2,
            `fx-${key}`,
        )
        fx.setDisplaySize(CELL_SIZE * scale, CELL_SIZE * scale)
        fx.setDepth(10) // au-dessus des ennemis et du décor
        fx.play(`fx-${key}`)
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy())
    }

    /**
     * Voile gris sur chaque tour étourdie par le pulse d'un Boss (voir
     * TickSnapshot.stunnedTowers) : la tour est réduite au silence tant que le
     * voile est visible — le joueur doit comprendre d'un coup d'œil pourquoi
     * elle ne tire plus, sinon l'étourdissement passe pour un bug de tir.
     */
    private drawStunnedTowers(stunnedTowers: string[]) {
        stunnedTowers.forEach((towerId) => {
            const tower = this.towersById.get(towerId)
            if (!tower) return

            const px = tower.x * CELL_SIZE
            const py = tower.y * CELL_SIZE

            this.effectsGraphics.fillStyle(0x64748b, 0.55) // slate-500, voile semi-opaque
            this.effectsGraphics.fillRect(px, py, CELL_SIZE, CELL_SIZE)
            this.effectsGraphics.lineStyle(2, 0x94a3b8, 0.9) // slate-400
            this.effectsGraphics.strokeRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4)
        })
    }

    /**
     * Dessine la pulsation d'aura/AoE d'un Boss (voir BossAbilityEvent) : un
     * anneau vert qui s'étend pour le soin de zone si des alliés ont été
     * soignés, un anneau orange pour l'attaque de zone si des tours ont été
     * touchées — les deux peuvent apparaître ensemble sur le même pulse.
     */
    private drawBossAbilityEvents(events: BossAbilityEvent[]) {
        events.forEach((event) => {
            const px = event.x * CELL_SIZE + CELL_SIZE / 2
            const py = event.y * CELL_SIZE + CELL_SIZE / 2

            if (event.alliesHealed > 0) {
                this.effectsGraphics.lineStyle(3, BOSS_HEAL_PULSE_COLOR, 0.8)
                this.effectsGraphics.strokeCircle(px, py, CELL_SIZE * 1.5)
            }
            if (event.towersHit > 0) {
                this.effectsGraphics.lineStyle(3, BOSS_AOE_PULSE_COLOR, 0.8)
                this.effectsGraphics.strokeCircle(px, py, CELL_SIZE * 1.1)
            }
        })
    }

    /**
     * Matérialise visuellement chaque attaque du tick : un trait pour le
     * mono-cible, un cercle sur la cible pour la zone (rayon = splashRadius),
     * un trait épais et persistant pour le continu (redessiné chaque tick
     * tant que la tour reste en train de toucher sa cible — c'est ce qui lui
     * donne son aspect "rayon" plutôt qu'un tir isolé). Sans ça, la zone et
     * le continu sont indistinguables du mono-cible à l'écran : seule la
     * barre de vie de l'ennemi bouge, sans indice sur la cause.
     */
    private drawEffects(
        damageEvents: DamageEvent[],
        towerDamageEvents: TowerDamageEvent[],
        enemies: EnemySnapshot[],
        tickIndex = 0
    ) {
        // Note : effectsGraphics est déjà vidé une fois par tick par l'appelant
        // (renderTick, voir playWave), pour pouvoir accueillir ensuite les
        // anneaux de drawBossAbilityEvents sans que celui-ci ne les efface.
        if (damageEvents.length === 0 && towerDamageEvents.length === 0) return

        const enemyById = new Map(enemies.map((e) => [e.id, e]))

        // Ligne de siège : un ennemi qui attaque une tour — sens inverse des
        // DamageEvent habituels (ennemi → tour, pas tour → ennemi), donc tracée
        // à part. Deux menaces distinctes, deux couleurs : rouge = Sapeur au
        // corps à corps, violet = rayon continu du Boss (profil "tour Mage"
        // inversé) qui canalise à distance en avançant.
        towerDamageEvents.forEach((event) => {
            const tower = this.towersById.get(event.towerId)
            const enemy = enemyById.get(event.enemyId)
            if (!tower || !enemy) return

            const towerPx = tower.x * CELL_SIZE + CELL_SIZE / 2
            const towerPy = tower.y * CELL_SIZE + CELL_SIZE / 2
            const enemyPx = enemy.x * CELL_SIZE + CELL_SIZE / 2
            const enemyPy = enemy.y * CELL_SIZE + CELL_SIZE / 2

            // Chaque menace a sa couleur : rouge = Sapeur au corps à corps,
            // violet = rayon du Boss, sinon la couleur du type (cyan Chariot,
            // gris Troll) — on identifie l'agresseur d'une tour d'un coup d'œil.
            const rayColor = enemy.type === 'SAPEUR' ? SIEGE_LINE_COLOR
                : enemy.type === 'BOSS_WARLORD' ? BOSS_RAY_COLOR
                : (ENEMY_COLORS[enemy.type] ?? SIEGE_LINE_COLOR)
            this.effectsGraphics.lineStyle(3, rayColor, 0.9)
            this.effectsGraphics.lineBetween(enemyPx, enemyPy, towerPx, towerPy)
        })

        // Une tour AOE (Catapulte) génère un damageEvent par ennemi touché : on
        // ne veut qu'UN effet d'impact par tour et par tick, pas un par éclat.
        const impactSpawned = new Set<string>()

        damageEvents.forEach((event) => {
            const tower = this.towersById.get(event.towerId)
            const enemy = enemyById.get(event.enemyId)
            if (!tower || !enemy) return

            const damageType = tower.damageType ?? 'SINGLE_TARGET'
            const color = TOWER_COLORS[tower.type] ?? 0xffffff
            const towerPx = tower.x * CELL_SIZE + CELL_SIZE / 2
            const towerPy = tower.y * CELL_SIZE + CELL_SIZE / 2
            const targetPx = enemy.x * CELL_SIZE + CELL_SIZE / 2
            const targetPy = enemy.y * CELL_SIZE + CELL_SIZE / 2

            if (damageType === 'CONTINUOUS') {
                // Rayon continu (Mage) : trait persistant + éclat de magie sur la
                // cible, cadencé (toutes les MAGIC_FX_PERIOD frames) — le Mage
                // tire chaque tick, un spawn systématique saturerait l'écran.
                this.effectsGraphics.lineStyle(3, color, 0.85)
                this.effectsGraphics.lineBetween(towerPx, towerPy, targetPx, targetPy)
                const last = this.magicFxTick.get(tower.id) ?? -99
                if (tickIndex - last >= MAGIC_FX_PERIOD) {
                    this.spawnImpact('fireball', enemy.x, enemy.y, 1.1)
                    this.magicFxTick.set(tower.id, tickIndex)
                }
            } else if (damageType === 'AOE') {
                // Trait tour→cible conservé (montre qui tire) ; l'effet de zone
                // est désormais porté par le sprite d'explosion (dimensionné au
                // rayon d'éclat), plus lisible que l'ancien cercle plein.
                this.effectsGraphics.lineStyle(2, color, 0.5)
                this.effectsGraphics.lineBetween(towerPx, towerPy, targetPx, targetPy)
                if (!impactSpawned.has(tower.id)) {
                    const diameter = Math.max((tower.splashRadius ?? 0.5) * 2, 1.2)
                    this.spawnImpact('explosion', enemy.x, enemy.y, diameter)
                    impactSpawned.add(tower.id)
                }
            } else {
                // Trait de la Baliste plus épais que l'Archer (perce-blindage,
                // voir backend) + effet d'impact à la cible selon le type.
                const isBallista = tower.type === 'BALLISTA'
                this.effectsGraphics.lineStyle(isBallista ? 4 : 1.5, color, isBallista ? 0.95 : 0.6)
                this.effectsGraphics.lineBetween(towerPx, towerPy, targetPx, targetPy)
                const impact = TOWER_IMPACT[tower.type]
                if (impact && !impactSpawned.has(tower.id)) {
                    this.spawnImpact(impact, enemy.x, enemy.y, isBallista ? 1.4 : 1.0)
                    impactSpawned.add(tower.id)
                }
            }
        })
    }

    // ── Dessin de la grille ──────────────────────────────────────────────

    private drawGrid() {
        this.gridGraphics.lineStyle(1, 0x334155, 0.8) // slate-700

        for (let x = 0; x <= GRID_WIDTH; x++) {
            this.gridGraphics.lineBetween(
                x * CELL_SIZE, 0,
                x * CELL_SIZE, GRID_HEIGHT * CELL_SIZE
            )
        }

        for (let y = 0; y <= GRID_HEIGHT; y++) {
            this.gridGraphics.lineBetween(
                0, y * CELL_SIZE,
                GRID_WIDTH * CELL_SIZE, y * CELL_SIZE
            )
        }
    }

    private drawPath() {
        // Chemin de spawn à destination — bande sur les lignes y=6 à y=8 (3 cases
        // de haut, centrée sur y=7) : élargie par rapport à la case unique
        // d'origine pour accueillir visuellement les ennemis qui avancent
        // maintenant de front sur plusieurs files (voir Enemy.laneOffset côté
        // backend, décalages ±0.8 case).
        this.gridGraphics.fillStyle(0x1e293b, 0.6) // slate-800
        this.gridGraphics.fillRect(
            0, 6 * CELL_SIZE,
            GRID_WIDTH * CELL_SIZE, CELL_SIZE * 3
        )

        // Marqueur spawn (gauche) — reste centré sur la case y=7, seule la
        // bande de fond est élargie.
        this.gridGraphics.fillStyle(0xef4444, 0.8) // rouge
        this.gridGraphics.fillRect(0, 7 * CELL_SIZE, CELL_SIZE, CELL_SIZE)

        // Marqueur destination (droite)
        this.gridGraphics.fillStyle(0x3b82f6, 0.8) // bleu
        this.gridGraphics.fillRect(
            (GRID_WIDTH - 1) * CELL_SIZE, 7 * CELL_SIZE,
            CELL_SIZE, CELL_SIZE
        )
    }
}
