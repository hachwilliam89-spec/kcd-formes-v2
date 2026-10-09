// Page du banc de charge : la VRAIE GameScene du jeu, des tours posées et une
// vague synthétique massive (déplacements, tirs, morts, arrivées au château)
// rejouée exactement comme en solo (playWave). Mesure le temps CPU de chaque
// image Phaser (update + rendu) et le publie dans window.__bench pour run.mjs.
//
// Paramètres d'URL : enemies, towers, seed, map (desert | fourche | spring | autumn),
// mode (wave | idle), perf (affiche le compteur ?perf=1 du jeu).
import Phaser from 'phaser'
import { GameScene } from '@/components/game/GameScene'
import { getMapDef } from '@/components/game/maps'
import { buildBenchWave } from './wave'

const params = new URLSearchParams(location.search)
const ENEMIES = Number(params.get('enemies') ?? 200)
const TOWERS = Number(params.get('towers') ?? 32)
const SEED = Number(params.get('seed') ?? 1)
const MODE = params.get('mode') === 'idle' ? 'idle' : 'wave'
const IDLE_MS = 8000

const map = getMapDef(params.get('map') ?? 'desert')
const { towers, ticks, reachedCount } = buildBenchWave(map, ENEMIES, TOWERS, SEED)

// ── Mesure : temps CPU de chaque image (game.step = update + rendu) ──
// game.step est lié au démarrage de la boucle : on patche le prototype AVANT le boot.
const stepTimes: number[] = []
const longFrames: { atS: number; ms: number }[] = []
let recording = false
let recordStart = 0
const gameProto = Phaser.Game.prototype as unknown as { step: (time: number, delta: number) => void }
const originalStep = gameProto.step
gameProto.step = function (this: unknown, time: number, delta: number) {
    const start = performance.now()
    originalStep.call(this, time, delta)
    if (!recording) return
    const ms = performance.now() - start
    stepTimes.push(ms)
    if (ms > 25) longFrames.push({ atS: +((start - recordStart) / 1000).toFixed(2), ms: +ms.toFixed(1) })
}

const scene = new GameScene()
scene.setActiveMap(map.id)
if (params.has('perf')) scene.enablePerfOverlay()

// Compilations de shaders PENDANT la mesure : chacune bloque le rendu (voir
// GameScene.prewarmShaders). Accès interne à Phaser, donc optionnel.
let compilesDuringRun = 0
let maxObjects = 0

function publish(extra: Record<string, unknown>) {
    const sorted = [...stepTimes].sort((a, b) => a - b)
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0
    const round = (x: number) => +x.toFixed(2)
    ;(window as unknown as { __bench: unknown }).__bench = {
        map: map.id, mode: MODE, towers: towers.length, enemies: ENEMIES,
        frames: stepTimes.length,
        avgMs: round(stepTimes.reduce((sum, x) => sum + x, 0) / Math.max(1, stepTimes.length)),
        p50: round(q(0.5)), p95: round(q(0.95)), p99: round(q(0.99)), max: round(sorted[sorted.length - 1] ?? 0),
        over8ms: stepTimes.filter((x) => x > 8).length,
        over16ms: stepTimes.filter((x) => x > 16.7).length,
        compilesDuringRun, maxObjects,
        longFrames: longFrames.slice(0, 20),
        ...extra,
    }
}

scene.setOnCoopReady(() => {
    const renderer = scene.renderer as unknown as {
        shaderProgramFactory?: { getShaderProgram: (...a: unknown[]) => unknown; getKey: (...a: unknown[]) => string }
    }
    const factory = renderer.shaderProgramFactory
    if (factory) {
        const seen = new Set<string>()
        const original = factory.getShaderProgram.bind(factory)
        factory.getShaderProgram = (...a: unknown[]) => {
            const key = factory.getKey(...a)
            if (!seen.has(key)) { seen.add(key); if (recording) compilesDuringRun++ }
            return original(...a)
        }
    }

    scene.drawTowers(towers)
    const sampler = setInterval(() => { maxObjects = Math.max(maxObjects, scene.children.list.length) }, 100)

    // Laisse passer le chargement (préchauffage, premières images) avant de mesurer.
    setTimeout(() => {
        recording = true
        recordStart = performance.now()
        ;(window as unknown as { __recording: boolean }).__recording = true // signal pour le profil CPU
        if (MODE === 'idle') {
            setTimeout(() => { recording = false; clearInterval(sampler); publish({ durationS: IDLE_MS / 1000 }) }, IDLE_MS)
            return
        }
        const maxOnScreen = Math.max(...ticks.map((t) => t.enemies.length))
        scene.playWave(ticks, undefined, () => {
            recording = false
            clearInterval(sampler)
            publish({
                ticks: ticks.length, maxOnScreen, killed: ENEMIES - reachedCount, reached: reachedCount,
                durationS: +((performance.now() - recordStart) / 1000).toFixed(1),
            })
        })
    }, 1500)
})

new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0f172a',
    scene,
    pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 800, height: 640 },
})
