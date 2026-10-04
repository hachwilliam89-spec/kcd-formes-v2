// Ce qui bouge sur la carte de guerre de l'accueil (public/home/war-map.webp) :
// ennemis sur les quatre routes, tirs des tours, catapultes, feux, fumées et
// météo de chaque saison. Tout est en pixels de l'image (1376 × 768) : la scène
// se dessine dans un tampon de cette taille, agrandi ensuite comme l'image.

export const IW = 1376
export const IH = 768

type Pt = readonly [number, number]
type Ctx = CanvasRenderingContext2D

const P = 2 // un pixel « dessiné » = 2 pixels de l'image, comme le reste de la carte
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]

// ── Décor relevé sur l'image ────────────────────────────────────────────────

// Routes, de l'entrée de chaque saison jusqu'à un pont du château.
const ROUTES: { pts: Pt[]; mix: [Kind, number][] }[] = [
    { // été : depuis l'oasis, par la piste qui longe le château
        pts: [[405, 242], [450, 250], [496, 262], [535, 274], [548, 285], [527, 305], [496, 324], [469, 347], [454, 374], [450, 401], [454, 435], [465, 458], [485, 485], [512, 505], [535, 514], [555, 502], [577, 483], [600, 466], [612, 458]],
        mix: [['goblin', 5], ['orc', 3], ['troll', 1]],
    },
    { // printemps : depuis le village
        pts: [[403, 772], [405, 740], [409, 712], [418, 684], [430, 660], [441, 641], [450, 614], [460, 592], [482, 573], [505, 555], [520, 532], [545, 508], [575, 483], [600, 466], [612, 458]],
        mix: [['goblin', 4], ['orc', 3], ['knight', 1]],
    },
    { // hiver : descente du col
        pts: [[975, 198], [962, 222], [940, 242], [912, 262], [896, 284], [905, 303], [921, 322], [933, 345], [937, 368], [941, 391], [940, 415], [933, 440], [925, 462], [910, 489], [887, 512], [856, 501], [818, 478], [785, 462]],
        mix: [['knight', 3], ['orc', 3], ['troll', 1]],
    },
    { // automne : la route de la forêt
        pts: [[1028, 772], [1014, 751], [995, 720], [975, 689], [960, 655], [948, 624], [941, 593], [929, 566], [914, 543], [887, 520], [856, 501], [818, 478], [785, 462]],
        mix: [['orc', 3], ['goblin', 3], ['troll', 1], ['knight', 1]],
    },
]

type Shot = 'arrow' | 'magic' | 'frost' | 'fire' | 'cannon'
// Sommet des tours (là où se tient le tireur).
const TOWERS: [number, number, Shot][] = [
    [571, 245, 'arrow'], [485, 282, 'arrow'],                                   // été
    [495, 478, 'arrow'], [525, 535, 'magic'], [423, 675, 'arrow'],              // printemps
    [852, 243, 'frost'], [935, 283, 'frost'], [1003, 172, 'arrow'],             // hiver
    [908, 478, 'fire'], [854, 518, 'arrow'], [981, 598, 'arrow'], [945, 674, 'fire'], // automne
    [575, 340, 'arrow'], [814, 329, 'arrow'], [712, 262, 'cannon'],             // château
]
// Engins de siège des assaillants, et où tombent leurs projectiles.
const SIEGE: Pt[] = [[546, 339], [538, 481], [848, 329], [868, 405]]
const CASTLE_HITS: Pt[] = [[640, 330], [700, 322], [742, 362], [622, 392], [690, 402], [760, 410], [660, 432], [722, 440], [600, 360], [790, 380]]
const CASTLE_BOX = { x0: 565, y0: 238, x1: 832, y1: 492 }
const inCastle = (x: number, y: number) => x > CASTLE_BOX.x0 && x < CASTLE_BOX.x1 && y > CASTLE_BOX.y0 && y < CASTLE_BOX.y1

// Feux peints sur la carte : on les fait vaciller ; les plus gros fument.
const FIRES: { x: number; y: number; smoke: boolean }[] = ([
    [607, 357, 1], [760, 352, 1], [650, 380, 1], [685, 415, 0], [712, 279, 1],
    [515, 290, 1], [498, 343, 0], [481, 366, 0], [456, 333, 1], [508, 403, 1],
    [825, 252, 1], [912, 293, 1], [883, 395, 0], [843, 471, 0], [877, 479, 1],
    [927, 528, 0], [954, 541, 0], [559, 536, 1],
] as const).map(([x, y, s]) => ({ x, y, smoke: s === 1 }))

// ── Ennemis : petits sprites pixel, contour encre ajouté à la construction ──

type Kind = 'goblin' | 'orc' | 'knight' | 'troll'
const KINDS: Record<Kind, { speed: number; hp: number; pal: Record<string, string>; body: string[]; legs: [string[], string[]] }> = {
    goblin: {
        speed: 15, hp: 3,
        pal: { s: '#7fb24a', e: '#ffe066', a: '#7b4b25', w: '#cfcfcf' },
        body: ['.sss.', 'sssse', '.sss.', 'aaaaw', 'aaaaw', '.aaa.'],
        legs: [['.a.a.', 'a...a'], ['.a.a.', '.a.a.']],
    },
    orc: {
        speed: 12, hp: 5,
        pal: { s: '#4e7d33', e: '#ff5a3c', a: '#7d766f', d: '#4a4440', w: '#c4c4c4' },
        body: ['.sss..', 'sssse.', '.sss..', 'aaaaaw', 'adaaaw', 'aaaa.w', '.ddd..'],
        legs: [['.d.d..', 'd...d.'], ['.d.d..', '.d.d..']],
    },
    knight: {
        speed: 11, hp: 6,
        pal: { r: '#c23b2b', h: '#6c7590', e: '#ff4a4a', a: '#3b3f4f', w: '#dcdce4' },
        body: ['..rr..', '.hhh..', 'hhhe..', 'aaaaaw', 'ahaaaw', '.aaa.w', '.aaa..'],
        legs: [['.a.a..', 'a...a.'], ['.a.a..', '.a.a..']],
    },
    troll: {
        speed: 8, hp: 12,
        pal: { s: '#8b9aa6', d: '#61707c', e: '#ffd34a', b: '#6b4a2a', w: '#7a5230' },
        body: ['..sss..w', '.sssse.w', '.sssss.w', 'sssssssw', 'ssdsssss', 's.ssss..', '..bbbb..', '..bbbb..'],
        legs: [['..s..s..', '.ss..ss.'], ['...ss...', '...ss...']],
    },
}

interface Sprite { w: number; h: number; img: HTMLCanvasElement[] } // [pas][variante][sens]
const VARIANTS = 3 // normal, touché (blanc), gelé

function hex(c: string): [number, number, number] {
    const n = parseInt(c.slice(1), 16)
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function buildSprite(kind: Kind): Sprite {
    const def = KINDS[kind]
    const frames = def.legs.map((legs) => [...def.body, ...legs])
    const w = Math.max(...frames[0].map((r) => r.length)) + 2
    const h = frames[0].length + 2
    const img: HTMLCanvasElement[] = []
    for (const rows of frames) {
        const at = (x: number, y: number) => rows[y - 1]?.[x - 1] ?? '.'
        for (let v = 0; v < VARIANTS; v++) for (let flip = 0; flip < 2; flip++) {
            const c = document.createElement('canvas')
            c.width = w * P; c.height = h * P
            const g = c.getContext('2d')!
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
                const ch = at(x, y)
                let col: string | null = null
                if (ch !== '.') col = def.pal[ch]
                else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) !== '.')) col = '#1a1210'
                if (!col) continue
                if (v === 1) col = '#fff6e8'
                else if (v === 2) { const [r, gg, b] = hex(col); col = `rgb(${(r + 150) >> 1},${(gg + 215) >> 1},${(b + 255) >> 1})` }
                g.fillStyle = col
                g.fillRect((flip ? w - 1 - x : x) * P, y * P, P, P)
            }
            img.push(c)
        }
    }
    return { w: w * P, h: h * P, img }
}

// Halos doux (feux, explosions, magie), dessinés une fois.
function glow(rgb: string): HTMLCanvasElement {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    gr.addColorStop(0, `rgba(${rgb},1)`); gr.addColorStop(0.35, `rgba(${rgb},.45)`); gr.addColorStop(1, `rgba(${rgb},0)`)
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64)
    return c
}

// ── Géométrie des routes ────────────────────────────────────────────────────

interface Route { pts: Pt[]; acc: number[]; len: number; mix: [Kind, number][]; spawn: number }
function makeRoute(pts: Pt[], mix: [Kind, number][]): Route {
    const acc = [0]
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
    return { pts, acc, len: acc[acc.length - 1], mix, spawn: rnd(0, 3) }
}
function along(r: Route, d: number) {
    let i = 1
    while (i < r.pts.length - 1 && r.acc[i] < d) i++
    const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i]
    const seg = r.acc[i] - r.acc[i - 1] || 1
    const t = Math.max(0, Math.min(1, (d - r.acc[i - 1]) / seg))
    return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, ux: (bx - ax) / seg, uy: (by - ay) / seg }
}

// ── La scène ────────────────────────────────────────────────────────────────

interface Enemy { kind: Kind; route: Route; d: number; off: number; hp: number; flash: number; slow: number; dying: number; x: number; y: number; dir: number; step: number }
interface Tower { x: number; y: number; shot: Shot; cd: number }
interface Bolt { shot: Shot; x: number; y: number; target: Enemy | null; tx: number; ty: number; sx: number; sy: number; t: number; dur: number; arc: number; siege: boolean }
type PartKind = 'ember' | 'spark' | 'smoke' | 'debris' | 'ice'
interface Part { k: PartKind; x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string }
interface Drift { x: number; y: number; vx: number; vy: number; ph: number; c: string; s: number }

const SHOT: Record<Shot, { speed: number; dmg: number; cd: [number, number]; range: number }> = {
    arrow: { speed: 260, dmg: 1, cd: [0.8, 1.3], range: 115 },
    magic: { speed: 150, dmg: 2, cd: [1.5, 2.0], range: 120 },
    frost: { speed: 190, dmg: 1, cd: [1.3, 1.8], range: 120 },
    fire: { speed: 165, dmg: 2, cd: [1.4, 2.0], range: 115 },
    cannon: { speed: 0, dmg: 3, cd: [2.6, 3.6], range: 230 },
}

export interface WarScene { step(dt: number): void; draw(g: Ctx): void }

export function createWarScene(img: HTMLImageElement): WarScene {
    const sprites = Object.fromEntries((Object.keys(KINDS) as Kind[]).map((k) => [k, buildSprite(k)])) as Record<Kind, Sprite>
    const halo = { fire: glow('255,150,50'), white: glow('255,240,210'), magic: glow('180,120,255'), frost: glow('150,215,255'), smoke: glow('62,56,66'), ash: glow('98,92,104') }
    const routes = ROUTES.map((r) => makeRoute(r.pts, r.mix))
    const towers: Tower[] = TOWERS.map(([x, y, shot]) => ({ x, y, shot, cd: rnd(0, 2) }))
    const siege = SIEGE.map(([x, y]) => ({ x, y, cd: rnd(1, 6) }))
    const enemies: Enemy[] = []
    const bolts: Bolt[] = []
    const parts: Part[] = []
    const smokeCd = FIRES.map(() => rnd(0, 0.5))
    let time = 0

    // Lecture de l'image une fois : reflets sur l'eau, étoiles du ciel nocturne.
    const glints: { x: number; y: number; ph: number; sp: number; w: number }[] = []
    const stars: { x: number; y: number; ph: number }[] = []
    {
        const c = document.createElement('canvas')
        c.width = IW; c.height = IH
        const g = c.getContext('2d', { willReadFrequently: true })!
        g.drawImage(img, 0, 0)
        const px = g.getImageData(0, 0, IW, IH).data
        const rgb = (x: number, y: number) => { const i = (y * IW + x) * 4; return [px[i], px[i + 1], px[i + 2]] }
        for (let tries = 0; tries < 20000 && glints.length < 80; tries++) {
            const x = Math.floor(rnd(2, IW - 6)), y = Math.floor(rnd(140, IH - 2))
            const [r, gg, b] = rgb(x, y)
            if (b > 110 && b > r + 45 && b > gg + 5 && r < 110 && r + gg + b < 480 && !inCastle(x, y))
                if (glints.every((o) => Math.abs(o.x - x) + Math.abs(o.y - y) > 14)) glints.push({ x, y, ph: rnd(0, 7), sp: rnd(1.2, 2.4), w: pick([2, 3, 4]) })
        }
        for (let tries = 0; tries < 6000 && stars.length < 22; tries++) {
            const x = Math.floor(rnd(1000, IW - 2)), y = Math.floor(rnd(2, 100))
            const [r, gg, b] = rgb(x, y)
            if (r + gg + b < 150 && stars.every((o) => Math.abs(o.x - x) + Math.abs(o.y - y) > 18)) stars.push({ x, y, ph: rnd(0, 7) })
        }
    }

    // Météo : une population par saison, qui boucle dans son quart de carte.
    const drift = (n: number, mk: () => Drift) => Array.from({ length: n }, mk)
    const snow = drift(150, () => ({ x: rnd(690, IW), y: rnd(0, 440), vx: rnd(-2, 3), vy: rnd(9, 20), ph: rnd(0, 7), c: '#ffffff', s: Math.random() < 0.3 ? 2 : 1 }))
    const sand = drift(45, () => ({ x: rnd(0, 700), y: rnd(110, 470), vx: rnd(60, 115), vy: rnd(-3, 4), ph: rnd(0, 7), c: '#fbe3a6', s: Math.floor(rnd(4, 9)) }))
    const petals = drift(50, () => ({ x: rnd(0, 690), y: rnd(440, IH), vx: rnd(9, 20), vy: rnd(7, 14), ph: rnd(0, 7), c: pick(['#ffc4dc', '#ff9fc6', '#fff0f6']), s: 2 }))
    const leaves = drift(50, () => ({ x: rnd(700, IW), y: rnd(420, IH), vx: rnd(6, 16), vy: rnd(8, 15), ph: rnd(0, 7), c: pick(['#e2672b', '#f2a23a', '#b8361f', '#d9892c']), s: 2 }))
    const fog = drift(7, () => ({ x: rnd(680, IW), y: rnd(440, IH - 20), vx: rnd(3, 7), vy: 0, ph: rnd(0, 7), c: '', s: rnd(110, 190) }))
    const fogImg = glow('225,225,215')

    const sky = { next: rnd(2, 5), age: 99, bolt: [] as Pt[][] }

    const pickKind = (mix: [Kind, number][]): Kind => {
        let r = Math.random() * mix.reduce((s, [, w]) => s + w, 0)
        for (const [k, w] of mix) { r -= w; if (r <= 0) return k }
        return mix[0][0]
    }
    const spawn = (route: Route, d: number) => {
        const kind = pickKind(route.mix)
        enemies.push({ kind, route, d, off: rnd(-3, 3), hp: KINDS[kind].hp, flash: 0, slow: 0, dying: 0, x: 0, y: 0, dir: 1, step: rnd(0, 1) })
    }
    const burst = (x: number, y: number, n: number, k: PartKind, colors: string[], speed: number, life: number) => {
        for (let i = 0; i < n; i++) {
            const a = rnd(0, Math.PI * 2), v = rnd(speed * 0.3, speed)
            parts.push({ k, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: 0, max: rnd(life * 0.6, life), size: k === 'smoke' ? rnd(3, 6) : 1, color: pick(colors) })
        }
    }
    const smoke = (x: number, y: number, big = 1) => parts.push({ k: 'smoke', x: x + rnd(-2, 2), y, vx: rnd(4, 9), vy: rnd(-13, -8), life: 0, max: rnd(4, 6) * big, size: rnd(2.5, 4) * big, color: '' })
    const hit = (e: Enemy, dmg: number) => {
        if (e.dying) return
        e.hp -= dmg
        e.flash = 0.09
        if (e.hp <= 0) {
            e.dying = 0.5
            burst(e.x, e.y - 6, 4, 'debris', ['#6b5a4a', '#3d3229', '#8a7a68'], 30, 0.6)
        }
    }
    const explode = (x: number, y: number, size: number) => {
        burst(x, y, 10 * size, 'spark', ['#ffd76a', '#ff9a3c', '#fff2c0', '#e9532b'], 55 * size, 0.6)
        for (let i = 0; i < 2 + size; i++) smoke(x + rnd(-4, 4), y - 2, 0.8)
        parts.push({ k: 'ember', x, y, vx: 0, vy: 0, life: 0, max: 0.3, size: 26 * size, color: 'flash' })
    }

    // Une armée déjà en marche dès la première image.
    for (const r of routes) for (let d = 30; d < r.len - 20; d += rnd(28, 70)) spawn(r, d)

    function step(dt: number) {
        time += dt

        // Renforts : une escouade par route de temps en temps.
        for (const r of routes) {
            r.spawn -= dt
            if (r.spawn > 0) continue
            r.spawn = rnd(6, 11)
            const n = Math.floor(rnd(2, 5))
            for (let i = 0; i < n; i++) spawn(r, -i * 15)
        }

        for (let i = enemies.length - 1; i >= 0; i--) {
            const e = enemies[i]
            if (e.dying) { e.dying -= dt; if (e.dying <= 0) enemies.splice(i, 1); continue }
            e.flash = Math.max(0, e.flash - dt)
            e.slow = Math.max(0, e.slow - dt)
            const v = KINDS[e.kind].speed * (e.slow ? 0.5 : 1)
            e.d += v * dt
            e.step += dt * v / 7
            const p = along(e.route, Math.max(0, e.d))
            e.x = p.x - p.uy * e.off
            e.y = p.y + p.ux * e.off
            if (Math.abs(p.ux) > 0.2) e.dir = p.ux < 0 ? -1 : 1
            if (e.d >= e.route.len) { // au pied du château : choc contre la porte
                burst(e.x, e.y - 6, 6, 'spark', ['#fff2c0', '#ffd76a'], 40, 0.35)
                smoke(e.x, e.y - 4, 0.7)
                enemies.splice(i, 1)
            }
        }

        for (const t of towers) {
            t.cd -= dt
            if (t.cd > 0) continue
            const spec = SHOT[t.shot]
            let best: Enemy | null = null
            for (const e of enemies) {
                if (e.dying || e.d < 6) continue
                if (Math.hypot(e.x - t.x, e.y - t.y) > spec.range) continue
                if (!best || e.d > best.d) best = e
            }
            if (!best) { t.cd = 0.3; continue }
            t.cd = rnd(...spec.cd)
            if (t.shot === 'cannon') {
                bolts.push({ shot: 'cannon', x: t.x, y: t.y, target: null, tx: best.x + rnd(-4, 4), ty: best.y, sx: t.x, sy: t.y, t: 0, dur: rnd(0.9, 1.2), arc: 55, siege: false })
                explode(t.x, t.y - 2, 0.3)
            } else bolts.push({ shot: t.shot, x: t.x, y: t.y, target: best, tx: best.x, ty: best.y - 6, sx: t.x, sy: t.y, t: 0, dur: 0, arc: 0, siege: false })
        }

        for (const s of siege) {
            s.cd -= dt
            if (s.cd > 0) continue
            s.cd = rnd(3.5, 7)
            const [tx, ty] = pick(CASTLE_HITS)
            bolts.push({ shot: 'cannon', x: s.x, y: s.y, target: null, tx, ty, sx: s.x, sy: s.y - 6, t: 0, dur: rnd(1.3, 1.7), arc: rnd(55, 75), siege: true })
        }

        for (let i = bolts.length - 1; i >= 0; i--) {
            const b = bolts[i]
            if (b.dur) { // boulet en cloche
                b.t += dt
                const k = Math.min(1, b.t / b.dur)
                b.x = b.sx + (b.tx - b.sx) * k
                b.y = b.sy + (b.ty - b.sy) * k - b.arc * 4 * k * (1 - k)
                if (b.siege && Math.random() < 0.7) parts.push({ k: 'ember', x: b.x, y: b.y, vx: rnd(-6, 6), vy: rnd(-10, 0), life: 0, max: rnd(0.3, 0.6), size: 1, color: pick(['#ffd76a', '#ff9a3c']) })
                if (k >= 1) {
                    explode(b.x, b.y, b.siege ? 1 : 0.7)
                    if (!b.siege) for (const e of enemies) if (Math.hypot(e.x - b.x, e.y - b.y) < 18) hit(e, SHOT.cannon.dmg)
                    bolts.splice(i, 1)
                }
                continue
            }
            if (b.target && !b.target.dying) { b.tx = b.target.x; b.ty = b.target.y - 6 }
            const dx = b.tx - b.x, dy = b.ty - b.y, dist = Math.hypot(dx, dy)
            const move = SHOT[b.shot].speed * dt
            if (dist <= move) {
                if (b.target && !b.target.dying) {
                    hit(b.target, SHOT[b.shot].dmg)
                    if (b.shot === 'frost') { b.target.slow = 2; burst(b.tx, b.ty, 5, 'ice', ['#e6f8ff', '#9fdcff'], 25, 0.4) }
                    else if (b.shot === 'fire') burst(b.tx, b.ty, 6, 'spark', ['#ffd76a', '#ff7a2c'], 35, 0.4)
                    else if (b.shot === 'magic') burst(b.tx, b.ty, 6, 'spark', ['#d8b8ff', '#9d6bff'], 30, 0.4)
                }
                bolts.splice(i, 1)
                continue
            }
            b.x += (dx / dist) * move
            b.y += (dy / dist) * move
            if (b.shot === 'fire' && Math.random() < 0.6) parts.push({ k: 'ember', x: b.x, y: b.y, vx: rnd(-5, 5), vy: rnd(-8, 2), life: 0, max: 0.3, size: 1, color: '#ff9a3c' })
        }

        // Feux : braises qui montent, fumée continue pour les plus gros.
        FIRES.forEach((f, i) => {
            if (Math.random() < dt * 3) parts.push({ k: 'ember', x: f.x + rnd(-3, 3), y: f.y - 2, vx: rnd(2, 10), vy: rnd(-32, -16), life: 0, max: rnd(0.5, 1.1), size: 1, color: pick(['#ffd76a', '#ff9a3c', '#ffefb0']) })
            if (!f.smoke) return
            smokeCd[i] -= dt
            if (smokeCd[i] <= 0) { smokeCd[i] = rnd(0.35, 0.6); smoke(f.x, f.y - 4) }
        })

        for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i]
            p.life += dt
            if (p.life >= p.max) { parts.splice(i, 1); continue }
            p.x += p.vx * dt
            p.y += p.vy * dt
            if (p.k === 'spark' || p.k === 'debris') p.vy += 70 * dt
            if (p.k === 'smoke') { p.vx *= 1 - 0.1 * dt; p.size += dt * 2.2 }
        }

        const wrap = (d: Drift, x0: number, x1: number, y0: number, y1: number) => {
            if (d.x > x1) d.x = x0; if (d.x < x0) d.x = x1
            if (d.y > y1) { d.y = y0; d.x = rnd(x0, x1) }
            if (d.y < y0) d.y = y1
        }
        for (const d of snow) { d.ph += dt; d.x += (d.vx + Math.sin(d.ph * 1.3) * 6) * dt; d.y += d.vy * dt; wrap(d, 690, IW, -4, 440) }
        for (const d of sand) { d.ph += dt; d.x += d.vx * dt; d.y += (d.vy + Math.sin(d.ph * 2) * 5) * dt; wrap(d, -10, 700, 110, 470) }
        for (const d of petals) { d.ph += dt * 3; d.x += (d.vx + Math.sin(d.ph) * 8) * dt; d.y += d.vy * dt; wrap(d, -4, 690, 440, IH + 4) }
        for (const d of leaves) { d.ph += dt * 4; d.x += (d.vx + Math.sin(d.ph * 0.7) * 10) * dt; d.y += d.vy * dt; wrap(d, 700, IW + 4, 420, IH + 4) }
        for (const d of fog) { d.x += d.vx * dt; if (d.x - d.s > IW) d.x = 680 - d.s / 2 }

        // Orage : un éclair de temps en temps dans les nuages noirs.
        sky.age += dt
        sky.next -= dt
        if (sky.next <= 0) {
            sky.next = rnd(4, 9)
            sky.age = 0
            const forks: Pt[][] = []
            let x = rnd(470, 1080), y = -4
            const main: Pt[] = [[x, y]]
            const bottom = rnd(70, 125)
            while (y < bottom) { x += rnd(-9, 9); y += rnd(7, 13); main.push([x, y]) }
            forks.push(main)
            const from = main[Math.floor(main.length / 2)]
            const fork: Pt[] = [from]
            let fx = from[0], fy = from[1]
            for (let k = 0; k < 4; k++) { fx += rnd(4, 12) * (Math.random() < 0.5 ? -1 : 1); fy += rnd(6, 10); fork.push([fx, fy]) }
            forks.push(fork)
            sky.bolt = forks
        }
    }

    function draw(g: Ctx) {
        g.globalCompositeOperation = 'source-over'
        g.globalAlpha = 1
        g.drawImage(img, 0, 0)

        // Reflets sur l'eau.
        g.fillStyle = '#e4f4ff'
        for (const s of glints) {
            const a = Math.sin(time * s.sp + s.ph)
            if (a < 0.6) continue
            g.globalAlpha = (a - 0.6) * 2.2
            g.fillRect(s.x, s.y, s.w, 1)
        }
        g.globalAlpha = 1

        // Ennemis, du fond vers l'avant.
        enemies.sort((a, b) => a.y - b.y)
        for (const e of enemies) {
            if (e.d < 0) continue
            const sp = sprites[e.kind]
            const x = Math.round(e.x - sp.w / 2), y = Math.round(e.y - sp.h + 1)
            const fade = Math.min(1, e.d / 18) * (e.dying ? Math.max(0, e.dying / 0.5) : 1)
            g.globalAlpha = 0.35 * fade
            g.fillStyle = '#140e0a'
            g.fillRect(x + 2, Math.round(e.y) - 1, sp.w - 4, 2)
            g.globalAlpha = fade
            const frame = e.dying ? 0 : Math.floor(e.step) % 2
            const variant = e.flash > 0 || e.dying > 0.45 ? 1 : e.slow > 0 ? 2 : 0
            const sink = e.dying ? Math.round((0.5 - e.dying) * 10) : frame
            g.drawImage(sp.img[(frame * VARIANTS + variant) * 2 + (e.dir < 0 ? 1 : 0)], x, y + sink)
        }
        g.globalAlpha = 1

        // Projectiles.
        for (const b of bolts) {
            const x = Math.round(b.x), y = Math.round(b.y)
            if (b.shot === 'arrow') {
                const dx = b.tx - b.x, dy = b.ty - b.y, d = Math.hypot(dx, dy) || 1
                g.fillStyle = '#f1e2b8'
                for (let k = 0; k < 4; k++) g.fillRect(Math.round(b.x - (dx / d) * k), Math.round(b.y - (dy / d) * k), 1, 1)
            } else if (b.shot === 'cannon') {
                g.fillStyle = '#1a1210'; g.fillRect(x - 2, y - 2, 4, 4)
                g.fillStyle = b.siege ? '#ff9a3c' : '#6d6a66'; g.fillRect(x - 1, y - 1, 2, 2)
            } else {
                g.fillStyle = b.shot === 'magic' ? '#e2ccff' : b.shot === 'frost' ? '#f0fbff' : '#ffe08a'
                g.fillRect(x - 1, y - 1, 3, 3)
            }
        }

        // Fumées.
        for (const p of parts) {
            if (p.k !== 'smoke') continue
            const k = p.life / p.max
            g.globalAlpha = 0.5 * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85)
            const r = p.size * 2.4
            g.drawImage(k < 0.3 ? halo.smoke : halo.ash, p.x - r, p.y - r, r * 2, r * 2)
        }
        g.globalAlpha = 1

        // Lumières : halos des feux, braises, étincelles, projectiles magiques.
        g.globalCompositeOperation = 'lighter'
        FIRES.forEach((f, i) => {
            const flick = 0.55 + 0.25 * Math.sin(time * 9 + i * 1.7) + 0.2 * Math.sin(time * 23 + i)
            const r = 11 + flick * 3
            g.globalAlpha = 0.32 * flick
            g.drawImage(halo.fire, f.x - r, f.y - 4 - r, r * 2, r * 2)
        })
        for (const b of bolts) {
            if (b.shot === 'arrow' || (b.shot === 'cannon' && !b.siege)) continue
            const h = b.shot === 'magic' ? halo.magic : b.shot === 'frost' ? halo.frost : halo.fire
            g.globalAlpha = 0.8
            g.drawImage(h, b.x - 7, b.y - 7, 14, 14)
        }
        for (const p of parts) {
            if (p.k === 'smoke' || p.k === 'debris') continue
            const k = p.life / p.max
            if (p.color === 'flash') {
                g.globalAlpha = 0.55 * (1 - k)
                g.drawImage(halo.white, p.x - p.size, p.y - p.size, p.size * 2, p.size * 2)
                continue
            }
            g.globalAlpha = 1 - k
            g.fillStyle = p.color
            g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
        }
        g.globalCompositeOperation = 'source-over'
        for (const p of parts) {
            if (p.k !== 'debris') continue
            g.globalAlpha = 1 - p.life / p.max
            g.fillStyle = p.color
            g.fillRect(Math.round(p.x), Math.round(p.y), 2, 2)
        }

        // Météo de chaque saison.
        g.globalAlpha = 0.5
        g.fillStyle = '#fbe3a6'
        for (const d of sand) if (!inCastle(d.x, d.y)) g.fillRect(Math.round(d.x), Math.round(d.y), d.s, 1)
        g.globalAlpha = 0.9
        for (const d of snow) {
            if (inCastle(d.x, d.y)) continue
            g.fillStyle = d.c
            g.fillRect(Math.round(d.x), Math.round(d.y), d.s, d.s)
        }
        for (const d of petals) {
            g.fillStyle = d.c
            const flat = Math.sin(d.ph) > 0
            g.fillRect(Math.round(d.x), Math.round(d.y), flat ? 2 : 1, flat ? 1 : 2)
        }
        g.globalAlpha = 1
        for (const d of leaves) {
            g.fillStyle = d.c
            const turn = Math.sin(d.ph) > 0
            g.fillRect(Math.round(d.x), Math.round(d.y), 2, turn ? 2 : 1)
        }
        for (const d of fog) {
            g.globalAlpha = 0.16 + 0.05 * Math.sin(time * 0.3 + d.ph)
            g.drawImage(fogImg, d.x - d.s / 2, d.y - d.s / 5, d.s, d.s / 2.5)
        }

        // Ciel : étoiles et orage.
        g.fillStyle = '#ffffff'
        for (const s of stars) {
            const a = 0.5 + 0.5 * Math.sin(time * 1.6 + s.ph)
            g.globalAlpha = 0.25 + 0.75 * a
            g.fillRect(s.x, s.y, 1, 1)
            if (a > 0.9) { g.globalAlpha = 0.5; g.fillRect(s.x - 1, s.y, 3, 1); g.fillRect(s.x, s.y - 1, 1, 3) }
        }
        if (sky.age < 0.45) {
            const on = sky.age < 0.12 || (sky.age > 0.18 && sky.age < 0.3)
            if (on) {
                g.globalCompositeOperation = 'lighter'
                g.lineJoin = 'miter'
                for (const [w, c, a] of [[4, '#7f9cff', 0.35], [1.5, '#ffffff', 1]] as const) {
                    g.globalAlpha = a
                    g.strokeStyle = c
                    g.lineWidth = w
                    for (const line of sky.bolt) {
                        g.beginPath()
                        line.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)))
                        g.stroke()
                    }
                }
                g.globalAlpha = 0.16 * (1 - sky.age / 0.45)
                g.fillStyle = '#c8d2ff'
                g.fillRect(0, 0, IW, IH)
                g.globalCompositeOperation = 'source-over'
            }
        }
        g.globalAlpha = 1
    }

    return { step, draw }
}
