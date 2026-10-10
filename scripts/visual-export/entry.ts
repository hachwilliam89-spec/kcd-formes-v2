// Page d'export : la VRAIE GameScene du jeu web, sans tours ni vague, dont on
// relève ce qu'elle a réellement construit pour une carte :
//   - le SOL (tout ce qui est sous les unités, profondeur < 0.5) en une image ;
//   - le DÉCOR posé parmi les unités (0.5 <= profondeur < 50 : château, portails,
//     ruines, arbres…) : texture, découpe, position, ancrage, taille, profondeur,
//     animation — rejoué tel quel par le client Godot ;
//   - les textures de ces éléments (y compris celles peintes par code : châteaux).
// La météo (profondeur >= 50) et les unités dynamiques ne sont pas exportées.
//
// Paramètres d'URL : map (desert | fourche | spring | autumn), mode :
//   export (défaut) : sol + décor ;
//   wave  : rejoue une vague déterministe (générateur de scripts/perf-bench) avec des
//           tours posées et publie des captures de référence + les ticks, pour comparer
//           le rendu Godot image par image ;
//   bench : publie seulement la vague du banc de charge (mêmes paramètres que
//           scripts/perf-bench : 200 ennemis, 32 tours, graine 1), rejouée par Godot.
import Phaser from 'phaser'
import { GameScene } from '@/components/game/GameScene'
import { getMapDef, useCatalogStore, type CatalogData } from '@/store/catalogStore'
import { buildBenchWave } from '../perf-bench/wave'

// Catalogue servi par run.mjs / export.mjs (backend ou --catalog) : chargé avant toute lecture.
useCatalogStore.getState().seed((window as unknown as { __CATALOG__: CatalogData }).__CATALOG__)

const params = new URLSearchParams(location.search)
const MAP = getMapDef(params.get('map') ?? 'desert')
const MODE = params.get('mode') ?? 'export'
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

async function playReference() {
    const enemyCount = Number(params.get('enemies') ?? 40)
    const towerCount = Number(params.get('towers') ?? 12)
    const shotTicks = (params.get('shots') ?? '30,70,110').split(',').map(Number)
    const { towers, ticks } = buildBenchWave(MAP, enemyCount, towerCount, 1)
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

if (MODE === 'bench') {
    const enemies = Number(params.get('enemies') ?? 200)
    const towerCount = Number(params.get('towers') ?? 32)
    const seed = Number(params.get('seed') ?? 1)
    const { towers, ticks } = buildBenchWave(MAP, enemies, towerCount, seed)
    const end = MAP.waypoints[MAP.waypoints.length - 1]
    win.__export = { map: MAP.id, width: 20, height: 16, castle: { x: end.x, y: end.y }, enemies, seed, towers, ticks }
    win.__done = true
} else {
    scene.setOnCoopReady(() => {
        // Laisse les animations et calques se mettre en place avant de relever la scène.
        setTimeout(() => {
            (MODE === 'wave' ? playReference() : exportMap()).catch((e) => { win.__error = String(e); win.__done = true })
        }, 1500)
    })
}

if (MODE !== 'bench') new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0f172a',
    scene,
    pixelArt: true,
    scale: { mode: Phaser.Scale.NONE, width: 800, height: 640 },
})
