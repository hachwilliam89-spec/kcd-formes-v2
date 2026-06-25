import Phaser from 'phaser'

const CELL_SIZE = 40
const GRID_WIDTH = 20
const GRID_HEIGHT = 15
const TICK_DELAY_MS = 120

export interface TowerData {
    id: string
    type: 'ARCHER' | 'MAGE' | 'CATAPULT'
    x: number
    y: number
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

export interface TickSnapshot {
    tick: number
    enemies: EnemySnapshot[]
    damageEvents: DamageEvent[]
    deaths: string[]
    reachedCastle: string[]
    castleHp: number
}

// Couleurs par type de tour
const TOWER_COLORS: Record<string, number> = {
    ARCHER: 0x22c55e,   // vert
    MAGE: 0x8b5cf6,     // violet
    CATAPULT: 0xf97316, // orange
}

// Couleurs par type d'ennemi
const ENEMY_COLORS: Record<string, number> = {
    GOBLIN: 0x84cc16,      // vert clair
    ORC: 0xb45309,         // marron
    TROLL: 0x6b7280,       // gris
    DARK_KNIGHT: 0x4338ca, // violet sombre
}

export class GameScene extends Phaser.Scene {
    private gridGraphics!: Phaser.GameObjects.Graphics
    private towersGraphics!: Phaser.GameObjects.Graphics
    private enemiesGraphics!: Phaser.GameObjects.Graphics
    private onCellClick?: (x: number, y: number) => void
    private waveTimer?: Phaser.Time.TimerEvent

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

        this.drawGrid()
        this.drawPath()

        // Écoute les clics sur le canvas
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const cellX = Math.floor(pointer.x / CELL_SIZE)
            const cellY = Math.floor(pointer.y / CELL_SIZE)

            // Vérifie que le clic est dans la grille
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
        if (!this.towersGraphics) return
        this.towersGraphics.clear()

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
        if (!this.enemiesGraphics) return
        this.waveTimer?.remove()

        let index = 0

        const renderTick = () => {
            if (index >= ticks.length) {
                this.enemiesGraphics.clear()
                this.waveTimer?.remove()
                this.waveTimer = undefined
                onComplete?.()
                return
            }

            const tick = ticks[index]
            this.drawEnemies(tick.enemies)
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

            this.enemiesGraphics.fillStyle(color, 1)
            this.enemiesGraphics.fillCircle(px, py, CELL_SIZE / 3)

            // Barre de vie au-dessus de l'ennemi
            const hpRatio = enemy.maxHp > 0 ? Math.max(0, enemy.hp / enemy.maxHp) : 0
            const barWidth = CELL_SIZE * 0.8
            const barX = px - barWidth / 2
            const barY = py - CELL_SIZE / 2 - 2

            this.enemiesGraphics.fillStyle(0x000000, 0.5)
            this.enemiesGraphics.fillRect(barX, barY, barWidth, 4)
            this.enemiesGraphics.fillStyle(hpRatio > 0.3 ? 0x22c55e : 0xef4444, 1)
            this.enemiesGraphics.fillRect(barX, barY, barWidth * hpRatio, 4)
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
        // Chemin de spawn à destination — ligne y=7 en surbrillance
        this.gridGraphics.fillStyle(0x1e293b, 0.6) // slate-800
        this.gridGraphics.fillRect(
            0, 7 * CELL_SIZE,
            GRID_WIDTH * CELL_SIZE, CELL_SIZE
        )

        // Marqueur spawn (gauche)
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
