// Page du banc de charge : la VRAIE GameScene du jeu, des tours posées et une
// vague synthétique massive (déplacements, tirs, morts, arrivées au château)
// rejouée exactement comme en solo (playWave). Mesure le temps CPU de chaque
// image Phaser (update + rendu) et le publie dans window.__bench pour run.mjs.
//
// Paramètres d'URL : enemies, towers, seed, map (desert | fourche),
// mode (wave | idle), perf (affiche le compteur ?perf=1 du jeu).
import Phaser from 'phaser'
import { GameScene, type TowerData, type TickSnapshot, type EnemySnapshot } from '@/components/game/GameScene'
import { getMapDef } from '@/components/game/maps'
import { towerRangeAt } from '@/components/game/constants'

const params = new URLSearchParams(location.search)
const ENEMIES = Number(params.get('enemies') ?? 200)
const TOWERS = Number(params.get('towers') ?? 32)
const SEED = Number(params.get('seed') ?? 1)
const MODE = params.get('mode') === 'idle' ? 'idle' : 'wave'
const IDLE_MS = 8000

// PRNG déterministe (mulberry32) : deux runs = exactement la même vague.
function rng(seed: number) {
    return () => {
        seed |= 0
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}
const rand = rng(SEED)

const map = getMapDef(params.get('map') ?? 'desert')

// ── Chemin : position à une distance d (en cases) le long de la 1re voie ──
const waypoints = map.waypoints
const segments = waypoints.slice(1).map((b, i) => {
    const a = waypoints[i]
    return { a, b, len: Math.abs(b.x - a.x) + Math.abs(b.y - a.y) }
})
const pathLength = segments.reduce((sum, s) => sum + s.len, 0)
function positionAt(distance: number) {
    let d = distance
    for (const s of segments) {
        if (d <= s.len) {
            const t = d / s.len
            return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t }
        }
        d -= s.len
    }
    return { ...waypoints[waypoints.length - 1] }
}

// ── Tours : réparties régulièrement sur la bande constructible ──
const buildable = [...map.path.buildableSet]
    .map((k) => { const [x, y] = k.split(',').map(Number); return { x, y } })
    .filter((c) => c.y >= 1)
    .sort((a, b) => a.y - b.y || a.x - b.x)
const TYPES: TowerData['type'][] = ['ARCHER', 'MAGE', 'CATAPULT', 'BALLISTA']
const towers: TowerData[] = []
const stride = Math.max(1, Math.floor(buildable.length / Math.max(1, TOWERS)))
for (let i = 0; i < buildable.length && towers.length < TOWERS; i += stride) {
    const type = TYPES[towers.length % TYPES.length]
    towers.push({
        id: `t${towers.length}`, type, x: buildable[i].x, y: buildable[i].y,
        level: 1 + Math.floor(rand() * 3), hp: 300, maxHp: 300,
        damageType: type === 'MAGE' ? 'CONTINUOUS' : type === 'CATAPULT' ? 'AOE' : 'SINGLE_TARGET',
        splashRadius: type === 'CATAPULT' ? 1 : undefined,
    })
}

// ── Vague : mix de types, PV gonflés pour garder une foule à l'écran ──
// [type, poids, vitesse (cases/tick), PV]
const MIX: [string, number, number, number][] = [
    ['GOBLIN', 50, 0.16, 1600], ['ORC', 20, 0.12, 3000], ['TROLL', 8, 0.08, 8000],
    ['SAPEUR', 10, 0.12, 2200], ['CHARIOT', 6, 0.1, 5000], ['DARK_KNIGHT', 6, 0.1, 6000],
]
const COOLDOWN: Record<string, number> = { ARCHER: 2, MAGE: 1, CATAPULT: 8, BALLISTA: 8 }
const DAMAGE: Record<string, number> = { ARCHER: 14, MAGE: 9, CATAPULT: 45, BALLISTA: 120 }

type SimEnemy = { id: string; type: string; speed: number; hp: number; maxHp: number; d: number; spawn: number; alive: boolean }
const totalWeight = MIX.reduce((sum, m) => sum + m[1], 0)
const sims: SimEnemy[] = Array.from({ length: ENEMIES }, (_, i) => {
    let r = rand() * totalWeight
    let pick = MIX[0]
    for (const m of MIX) { if ((r -= m[1]) < 0) { pick = m; break } }
    return { id: `e${i}`, type: pick[0], speed: pick[2], hp: pick[3], maxHp: pick[3], d: 0, spawn: i * 3, alive: true }
})

const ticks: TickSnapshot[] = []
let reachedCount = 0
for (let tick = 0; tick < 4000 && ENEMIES > 0; tick++) {
    const deaths: string[] = []
    const reached: string[] = []
    for (const s of sims) {
        if (!s.alive || tick < s.spawn) continue
        s.d += s.speed
        if (s.d >= pathLength) { s.alive = false; reached.push(s.id); reachedCount++ }
    }
    const live = sims.filter((s) => s.alive && tick >= s.spawn).map((s) => ({ s, p: positionAt(s.d) }))
    const damageEvents: TickSnapshot['damageEvents'] = []
    for (const t of towers) {
        if (tick % COOLDOWN[t.type] !== 0) continue
        const range = towerRangeAt(t.type, t.level)
        let target: (typeof live)[number] | null = null
        let best = Infinity
        for (const e of live) {
            if (e.s.hp <= 0) continue
            const dist = Math.hypot(e.p.x - t.x, e.p.y - t.y)
            if (dist <= range && dist < best) { target = e; best = dist }
        }
        if (!target) continue
        const center = target
        const hits = t.type === 'CATAPULT'
            ? live.filter((e) => e.s.hp > 0 && Math.hypot(e.p.x - center.p.x, e.p.y - center.p.y) <= 1)
            : [target]
        for (const e of hits) {
            const dmg = DAMAGE[t.type] * (1 + ((t.level ?? 1) - 1) * 0.6)
            e.s.hp -= dmg
            damageEvents.push({ towerId: t.id, enemyId: e.s.id, damage: dmg })
        }
    }
    for (const e of live) if (e.s.hp <= 0 && e.s.alive) { e.s.alive = false; deaths.push(e.s.id) }
    const enemies: EnemySnapshot[] = live.filter((e) => e.s.alive).map((e) => ({
        id: e.s.id, type: e.s.type, x: e.p.x, y: e.p.y, hp: Math.max(0, Math.round(e.s.hp)), maxHp: e.s.maxHp,
    }))
    ticks.push({
        tick, stunnedTowers: [], enemies, damageEvents, towerDamageEvents: [], deaths,
        reachedCastle: reached, destroyedTowers: [], bossAbilityEvents: [], castleAttacks: [], castleHp: 100,
    })
    if (enemies.length === 0 && sims.every((s) => !s.alive)) break
}

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
