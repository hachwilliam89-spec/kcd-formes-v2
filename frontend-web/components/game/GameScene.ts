import Phaser from 'phaser'

const CELL_SIZE = 40
const GRID_WIDTH = 20
const GRID_HEIGHT = 15

export interface TowerData {
    id: string
    type: 'ARCHER' | 'MAGE' | 'CATAPULT'
    x: number
    y: number
}

// Couleurs par type de tour
const TOWER_COLORS: Record<string, number> = {
    ARCHER: 0x22c55e,   // vert
    MAGE: 0x8b5cf6,     // violet
    CATAPULT: 0xf97316, // orange
}

export class GameScene extends Phaser.Scene {
    private gridGraphics!: Phaser.GameObjects.Graphics
    private towersGraphics!: Phaser.GameObjects.Graphics
    private onCellClick?: (x: number, y: number) => void

    constructor() {
        super({ key: 'GameScene' })
    }

    preload() {
        // On n'a pas encore d'assets — on dessine avec des formes géométriques
    }

    create() {
        this.gridGraphics = this.add.graphics()
        this.towersGraphics = this.add.graphics()

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
        // Game loop — vide pour l'instant
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