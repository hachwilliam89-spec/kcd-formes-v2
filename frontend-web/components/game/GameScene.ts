import Phaser from 'phaser'

const CELL_SIZE = 40
const GRID_WIDTH = 20
const GRID_HEIGHT = 15
const TICK_DELAY_MS = 120

export interface TowerData {
    id: string
    type: 'ARCHER' | 'MAGE' | 'CATAPULT' | 'BALLISTA'
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

// Couleurs des pulsations de Boss (voir drawBossAbilityEvents) : vert pour le
// soin de zone, orange pour l'attaque de zone — pour rester cohérent avec les
// codes couleur déjà utilisés ailleurs (vert = positif, orange/rouge = dégâts).
const BOSS_HEAL_PULSE_COLOR = 0x22c55e
const BOSS_AOE_PULSE_COLOR = 0xf97316

// COULOIR STRICT (décision de design, voir GAME_DESIGN 2.6 et
// PathfindingService.corridorCells côté backend) : la bande y=6..8 est
// inconstructible — chemin y=7 élargi d'une case de part et d'autre, là où
// circulent les files d'ennemis (laneOffset ±0.8). Le backend rejette de toute
// façon ces placements (400 CellOnPathException) ; ce filtre évite juste un
// aller-retour réseau pour un clic qui ne peut pas aboutir.
const CORRIDOR_MIN_Y = 6
const CORRIDOR_MAX_Y = 8

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
    // DamageEvent pendant playWave (position + profil de dégâts).
    private towersById = new Map<string, TowerData>()

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

        // Écoute les clics sur le canvas
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const cellX = Math.floor(pointer.x / CELL_SIZE)
            const cellY = Math.floor(pointer.y / CELL_SIZE)

            // Vérifie que le clic est dans la grille, hors du couloir des ennemis
            // (inconstructible — voir CORRIDOR_MIN_Y/MAX_Y).
            if (
                cellX >= 0 && cellX < GRID_WIDTH &&
                cellY >= 0 && cellY < GRID_HEIGHT &&
                (cellY < CORRIDOR_MIN_Y || cellY > CORRIDOR_MAX_Y)
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
        if (!this.towersGraphics) return
        this.towersGraphics.clear()

        this.towersById.clear()
        towers.forEach((tower) => this.towersById.set(tower.id, tower))

        towers.forEach((tower) => {
            const color = TOWER_COLORS[tower.type] ?? 0xffffff
            const px = tower.x * CELL_SIZE
            const py = tower.y * CELL_SIZE

            // Dessine un carré coloré pour la tour
            this.towersGraphics.fillStyle(color, 1)
            this.towersGraphics.fillRect(
                px + 4, py + 4,
                CELL_SIZE - 8, CELL_SIZE - 8
            )

            // Lettre initiale du type
            this.add.text(
                px + CELL_SIZE / 2,
                py + CELL_SIZE / 2,
                tower.type[0],
                { fontSize: '14px', color: '#ffffff', fontStyle: 'bold' }
            ).setOrigin(0.5)

            // Barre de vie de la structure elle-même — affichée uniquement si la
            // tour a déjà subi des dégâts de siège (Sapeur) ; une tour intacte ou
            // dont le backend n'envoie pas encore hp/maxHp ne l'affiche pas, pour
            // ne pas surcharger l'écran en l'absence de menace.
            if (tower.hp != null && tower.maxHp != null && tower.hp < tower.maxHp) {
                const hpRatio = tower.maxHp > 0 ? Math.max(0, tower.hp / tower.maxHp) : 0
                const barWidth = CELL_SIZE * 0.8
                const barX = px + CELL_SIZE / 2 - barWidth / 2
                const barY = py - 6

                this.towersGraphics.fillStyle(0x000000, 0.5)
                this.towersGraphics.fillRect(barX, barY, barWidth, 4)
                this.towersGraphics.fillStyle(hpRatio > 0.3 ? 0x22c55e : 0xef4444, 1)
                this.towersGraphics.fillRect(barX, barY, barWidth * hpRatio, 4)
            }
        })
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

            // Une tour détruite par un Sapeur ce tick doit disparaître immédiatement
            // de l'affichage (et de towersById, sinon drawEffects continuerait de lui
            // trouver une position pour d'éventuels événements résiduels) — on
            // redessine donc towersGraphics dès qu'une destruction survient, plutôt
            // que d'attendre le prochain drawTowers() déclenché par React.
            if (tick.destroyedTowers.length > 0) {
                tick.destroyedTowers.forEach((towerId) => this.towersById.delete(towerId))
                this.drawTowers(Array.from(this.towersById.values()))
            }

            this.effectsGraphics.clear()
            this.drawEnemies(tick.enemies)
            this.drawEffects(tick.damageEvents, tick.towerDamageEvents, tick.enemies)
            this.drawBossAbilityEvents(tick.bossAbilityEvents)
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

        // Ligne de siège : un Sapeur qui attaque une tour — sens inverse des
        // DamageEvent habituels (ennemi → tour, pas tour → ennemi), donc tracée
        // à part avec sa propre couleur pour rester immédiatement identifiable.
        towerDamageEvents.forEach((event) => {
            const tower = this.towersById.get(event.towerId)
            const enemy = enemyById.get(event.enemyId)
            if (!tower || !enemy) return

            const towerPx = tower.x * CELL_SIZE + CELL_SIZE / 2
            const towerPy = tower.y * CELL_SIZE + CELL_SIZE / 2
            const enemyPx = enemy.x * CELL_SIZE + CELL_SIZE / 2
            const enemyPy = enemy.y * CELL_SIZE + CELL_SIZE / 2

            this.effectsGraphics.lineStyle(3, SIEGE_LINE_COLOR, 0.9)
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
                this.effectsGraphics.lineStyle(1.5, color, 0.6)
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
