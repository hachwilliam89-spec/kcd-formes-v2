// Page d'export : la VRAIE GameScene du jeu web, sans tours ni vague, dont on
// relève ce qu'elle a réellement construit pour une carte :
//   - le SOL (tout ce qui est sous les unités, profondeur < 0.5) en une image ;
//   - le DÉCOR posé parmi les unités (0.5 <= profondeur < 50 : château, portails,
//     ruines, arbres…) : texture, découpe, position, ancrage, taille, profondeur,
//     animation — rejoué tel quel par le client Godot ;
//   - les textures de ces éléments (y compris celles peintes par code : châteaux).
// La météo (profondeur >= 50) et les unités dynamiques ne sont pas exportées.
//
// Paramètres d'URL : map (desert | fourche | spring | autumn).
// Mode "wave" : rejoue une vague déterministe avec des tours posées et publie des
// captures de référence + les ticks, pour comparer le rendu Godot au pixel près.
import Phaser from 'phaser'
import { GameScene, type TowerData, type TickSnapshot, type EnemySnapshot } from '@/components/game/GameScene'
import { getMapDef } from '@/components/game/maps'
import { towerRangeAt } from '@/components/game/constants'

const params = new URLSearchParams(location.search)
const MAP = getMapDef(params.get('map') ?? 'desert')
const MODE = params.get('mode') === 'wave' ? 'wave' : 'export'
const GROUND_MAX_DEPTH = 0.5
const WEATHER_MIN_DEPTH = 50

type Win = Window & { __export?: unknown; __shots?: { tick: number; png: string }[]; __done?: boolean; __error?: string }
const win = window as unknown as Win

const scene = new GameScene()
scene.setActiveMap(MAP.id)

function canvasToPng(source: CanvasImageSource, w: number, h: number): string {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    c.getContext('2d')!.drawImage(source, 0, 0)
    return c.toDataURL('image/png')
}

function snapshot(): Promise<string> {
    return new Promise((resolve) => {
        scene.renderer.snapshot((img) => {
            const el = img as HTMLImageElement
            resolve(canvasToPng(el, el.width, el.height))
        })
    })
}

type Obj = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth & Phaser.GameObjects.Components.Visible

async function exportMap() {
    const textures: Record<string, string> = {}
    const items: unknown[] = []
    const hidden: Obj[] = []
    const kinds: Record<string, number> = {}
    for (const raw of scene.children.list) {
        const obj = raw as Obj
        kinds[obj.type] = (kinds[obj.type] ?? 0) + 1
        if (obj.depth < GROUND_MAX_DEPTH || !obj.visible) continue
        hidden.push(obj)
        if (obj.depth >= WEATHER_MIN_DEPTH) continue
        if (!(obj instanceof Phaser.GameObjects.Image) && !(obj instanceof Phaser.GameObjects.Sprite)) {
            items.push({ unsupported: obj.type, depth: obj.depth })
            continue
        }
        const img = obj as Phaser.GameObjects.Sprite
        if (img.alpha <= 0) continue
        const key = img.texture.key
        if (!textures[key]) {
            const src = img.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement
            textures[key] = canvasToPng(src, src.width, src.height)
        }
        const cut = (f: Phaser.Textures.Frame) => [f.cutX, f.cutY, f.cutWidth, f.cutHeight]
        let anim: unknown = null
        if (img instanceof Phaser.GameObjects.Sprite && img.anims?.currentAnim) {
            const a = img.anims.currentAnim
            anim = { frames: a.frames.map((f) => cut(f.frame)), fps: a.frameRate, repeat: a.repeat }
        }
        items.push({
            texture: key, frame: cut(img.frame),
            x: img.x, y: img.y, originX: img.originX, originY: img.originY,
            width: img.displayWidth, height: img.displayHeight,
            flipX: img.flipX, flipY: img.flipY, rotation: img.rotation,
            alpha: img.alpha, tint: img.isTinted ? img.tintTopLeft : null, blend: img.blendMode,
            depth: img.depth, anim,
        })
    }
    // Le web trace certains repères d'unités (anneau du Chevalier noir) à la
    // profondeur 0 : ils restent visibles sauf si un calque de sol plein écran
    // est posé au-dessus (terrain saisonnier à 0.3). Godot applique la même règle.
    const groundCoversDepth0 = scene.children.list.some((raw) => {
        const o = raw as Obj & { displayWidth?: number; displayHeight?: number; alpha?: number }
        return o.visible && o.depth > 0 && o.depth < GROUND_MAX_DEPTH
            && (o.displayWidth ?? 0) >= 790 && (o.displayHeight ?? 0) >= 630 && (o.alpha ?? 1) >= 0.99
    })
    hidden.forEach((o) => o.setVisible(false))
    await new Promise((r) => setTimeout(r, 300))
    const ground = await snapshot()
    hidden.forEach((o) => o.setVisible(true))
    win.__export = {
        map: MAP.id, cellSize: 40, width: 800, height: 640,
        ground, textures, items, kinds, groundCoversDepth0,
    }
    win.__done = true
}

// ── Mode vague : mêmes règles de génération que scripts/perf-bench (graine fixe) ──
function rng(seed: number) {
    return () => {
        seed |= 0; seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function buildWave(enemyCount: number, towerCount: number) {
    const rand = rng(1)
    const wp = MAP.waypoints
    const segs = wp.slice(1).map((b, i) => ({ a: wp[i], b, len: Math.abs(b.x - wp[i].x) + Math.abs(b.y - wp[i].y) }))
    const total = segs.reduce((s, x) => s + x.len, 0)
    const at = (d: number) => {
        for (const s of segs) { if (d <= s.len) { const t = d / s.len; return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t } } d -= s.len }
        return { ...wp[wp.length - 1] }
    }
    const buildable = [...MAP.path.buildableSet].map((k) => { const [x, y] = k.split(',').map(Number); return { x, y } })
        .filter((c) => c.y >= 1).sort((a, b) => a.y - b.y || a.x - b.x)
    const TYPES: TowerData['type'][] = ['ARCHER', 'MAGE', 'CATAPULT', 'BALLISTA']
    const towers: TowerData[] = []
    const stride = Math.max(1, Math.floor(buildable.length / Math.max(1, towerCount)))
    for (let i = 0; i < buildable.length && towers.length < towerCount; i += stride) {
        const type = TYPES[towers.length % TYPES.length]
        towers.push({ id: `t${towers.length}`, type, x: buildable[i].x, y: buildable[i].y, level: 1, hp: 300, maxHp: 300,
            damageType: type === 'MAGE' ? 'CONTINUOUS' : type === 'CATAPULT' ? 'AOE' : 'SINGLE_TARGET',
            splashRadius: type === 'CATAPULT' ? 1 : undefined })
    }
    const MIX: [string, number, number][] = [['GOBLIN', 50, 0.16], ['ORC', 20, 0.12], ['TROLL', 8, 0.08], ['SAPEUR', 10, 0.12], ['CHARIOT', 6, 0.1], ['DARK_KNIGHT', 6, 0.1]]
    const HP: Record<string, number> = { GOBLIN: 1600, ORC: 3000, TROLL: 8000, SAPEUR: 2200, CHARIOT: 5000, DARK_KNIGHT: 6000 }
    const weight = MIX.reduce((s, m) => s + m[1], 0)
    const sims = Array.from({ length: enemyCount }, (_, i) => {
        let r = rand() * weight; let pick = MIX[0]
        for (const m of MIX) { if ((r -= m[1]) < 0) { pick = m; break } }
        return { id: `e${i}`, type: pick[0], speed: pick[2], hp: HP[pick[0]], maxHp: HP[pick[0]], d: 0, spawn: i * 3, alive: true }
    })
    const COOLDOWN: Record<string, number> = { ARCHER: 2, MAGE: 1, CATAPULT: 8, BALLISTA: 8 }
    const DAMAGE: Record<string, number> = { ARCHER: 14, MAGE: 9, CATAPULT: 45, BALLISTA: 120 }
    const ticks: TickSnapshot[] = []
    for (let tick = 0; tick < 4000; tick++) {
        const deaths: string[] = [], reached: string[] = []
        for (const s of sims) { if (!s.alive || tick < s.spawn) continue; s.d += s.speed; if (s.d >= total) { s.alive = false; reached.push(s.id) } }
        const live = sims.filter((s) => s.alive && tick >= s.spawn).map((s) => ({ s, p: at(s.d) }))
        const damageEvents: TickSnapshot['damageEvents'] = []
        for (const t of towers) {
            if (tick % COOLDOWN[t.type] !== 0) continue
            const range = towerRangeAt(t.type, t.level); let target: (typeof live)[number] | null = null; let best = Infinity
            for (const e of live) { if (e.s.hp <= 0) continue; const d = Math.hypot(e.p.x - t.x, e.p.y - t.y); if (d <= range && d < best) { target = e; best = d } }
            if (!target) continue
            const c = target
            const hits = t.type === 'CATAPULT' ? live.filter((e) => e.s.hp > 0 && Math.hypot(e.p.x - c.p.x, e.p.y - c.p.y) <= 1) : [target]
            for (const e of hits) { e.s.hp -= DAMAGE[t.type]; damageEvents.push({ towerId: t.id, enemyId: e.s.id, damage: DAMAGE[t.type] }) }
        }
        for (const e of live) if (e.s.hp <= 0 && e.s.alive) { e.s.alive = false; deaths.push(e.s.id) }
        const enemies: EnemySnapshot[] = live.filter((e) => e.s.alive).map((e) => ({ id: e.s.id, type: e.s.type, x: e.p.x, y: e.p.y, hp: Math.max(0, Math.round(e.s.hp)), maxHp: e.s.maxHp }))
        ticks.push({ tick, stunnedTowers: [], enemies, damageEvents, towerDamageEvents: [], deaths, reachedCastle: reached,
            destroyedTowers: [], bossAbilityEvents: [], castleAttacks: [], castleHp: 100 })
        if (enemies.length === 0 && sims.every((s) => !s.alive)) break
    }
    return { towers, ticks }
}

async function playReference() {
    const enemyCount = Number(params.get('enemies') ?? 40)
    const towerCount = Number(params.get('towers') ?? 12)
    const shotTicks = (params.get('shots') ?? '30,70,110').split(',').map(Number)
    const { towers, ticks } = buildWave(enemyCount, towerCount)
    scene.drawTowers(towers)
    win.__shots = []
    let index = 0
    await new Promise((r) => setTimeout(r, 1000))
    scene.playWave(ticks, async () => {
        index++
        if (shotTicks.includes(index)) win.__shots!.push({ tick: index, png: await snapshot() })
    }, () => { /* fin */ })
    const last = Math.max(...shotTicks)
    const timer = setInterval(() => {
        if (win.__shots!.length >= shotTicks.length || index > last + 5) {
            clearInterval(timer)
            win.__export = { map: MAP.id, towers, ticks }
            win.__done = true
        }
    }, 100)
}

scene.setOnCoopReady(() => {
    // Laisse les animations et calques se mettre en place avant de relever la scène.
    setTimeout(() => {
        (MODE === 'wave' ? playReference() : exportMap()).catch((e) => { win.__error = String(e); win.__done = true })
    }, 1500)
})

new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0f172a',
    scene,
    pixelArt: true,
    scale: { mode: Phaser.Scale.NONE, width: 800, height: 640 },
})
