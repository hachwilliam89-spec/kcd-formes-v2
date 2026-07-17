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

// COULOIR STRICT (décision de design, voir GAME_DESIGN 2.6 et
// PathfindingService.corridorCells côté backend) : la bande y=6..8 est
// inconstructible pour les tours — chemin y=7 élargi d'une case de part et
// d'autre, là où circulent les files d'ennemis (laneOffset ±0.8). Exportées :
// c'est la page (qui connaît le type sélectionné) qui applique la règle, car
// elle s'INVERSE pour le mur-barrage (WALL, posable UNIQUEMENT sur le couloir).
// Le backend reste l'arbitre final dans tous les cas.
export const CORRIDOR_MIN_Y = 6
export const CORRIDOR_MAX_Y = 8

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

    constructor() {
        super({ key: 'GameScene' })
    }

    preload() {
        // On n'a pas encore d'assets — on dessine avec des formes géométriques
    }

    create() {
        this.gridGraphics = this.add.graphics()
        this.towersGraphics = this.add.graphics()
        this.enemiesGraphics = this.add.graphics()
        this.effectsGraphics = this.add.graphics()

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

            this.effectsGraphics.clear()
            this.drawEnemies(tick.enemies)
            this.drawEffects(tick.damageEvents, tick.towerDamageEvents, tick.enemies)
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

    private drawEnemies(enemies: EnemySnapshot[]) {
        this.enemiesGraphics.clear()

        enemies.forEach((enemy) => {
            const color = ENEMY_COLORS[enemy.type] ?? 0xffffff
            const px = enemy.x * CELL_SIZE + CELL_SIZE / 2
            const py = enemy.y * CELL_SIZE + CELL_SIZE / 2
            // Le Boss est nettement plus gros que les ennemis classiques, avec un
            // contour noir épais — doit rester identifiable au premier coup d'œil
            // au milieu de son escorte, même sans connaître ENEMY_COLORS par cœur.
            const isBoss = enemy.type === 'BOSS_WARLORD'
            const radius = isBoss ? CELL_SIZE * 0.55 : CELL_SIZE / 3

            this.enemiesGraphics.fillStyle(color, 1)
            this.enemiesGraphics.fillCircle(px, py, radius)
            if (isBoss) {
                this.enemiesGraphics.lineStyle(3, 0x000000, 0.8)
                this.enemiesGraphics.strokeCircle(px, py, radius)
            }

            // Barre de vie au-dessus de l'ennemi
            const hpRatio = enemy.maxHp > 0 ? Math.max(0, enemy.hp / enemy.maxHp) : 0
            const barWidth = isBoss ? CELL_SIZE * 1.4 : CELL_SIZE * 0.8
            const barX = px - barWidth / 2
            const barY = py - radius - 6

            this.enemiesGraphics.fillStyle(0x000000, 0.5)
            this.enemiesGraphics.fillRect(barX, barY, barWidth, 4)
            this.enemiesGraphics.fillStyle(hpRatio > 0.3 ? 0x22c55e : 0xef4444, 1)
            this.enemiesGraphics.fillRect(barX, barY, barWidth * hpRatio, 4)
        })
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
        enemies: EnemySnapshot[]
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

            const isBossRay = enemy.type === 'BOSS_WARLORD'
            this.effectsGraphics.lineStyle(3, isBossRay ? BOSS_RAY_COLOR : SIEGE_LINE_COLOR, 0.9)
            this.effectsGraphics.lineBetween(enemyPx, enemyPy, towerPx, towerPy)
        })

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
                this.effectsGraphics.lineStyle(3, color, 0.85)
                this.effectsGraphics.lineBetween(towerPx, towerPy, targetPx, targetPy)
            } else if (damageType === 'AOE') {
                const radiusPx = Math.max(tower.splashRadius ?? 0, 0.5) * CELL_SIZE
                this.effectsGraphics.lineStyle(2, color, 0.7)
                this.effectsGraphics.lineBetween(towerPx, towerPy, targetPx, targetPy)
                this.effectsGraphics.fillStyle(color, 0.22)
                this.effectsGraphics.fillCircle(targetPx, targetPy, radiusPx)
                this.effectsGraphics.lineStyle(2, color, 0.8)
                this.effectsGraphics.strokeCircle(targetPx, targetPy, radiusPx)
            } else {
                // Trait de la Baliste nettement plus épais que celui de l'Archer :
                // même profil mono-cible, mais son tir perce-blindage (x2 contre
                // les cibles massives côté backend) doit se voir au premier coup
                // d'œil — sinon les deux tours sont visuellement interchangeables.
                const isBallista = tower.type === 'BALLISTA'
                this.effectsGraphics.lineStyle(isBallista ? 4 : 1.5, color, isBallista ? 0.95 : 0.6)
                this.effectsGraphics.lineBetween(towerPx, towerPy, targetPx, targetPy)
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
