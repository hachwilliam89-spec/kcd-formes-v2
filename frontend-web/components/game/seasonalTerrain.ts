import type { MapDef } from './maps'
import { corridorHas, buildableHas } from './constants'
import { LAKE } from './seasons'

export type Sprite = { sx: number; sy: number; w: number; h: number }
// Régions de l'atlas plants.png (TX Plant, Cainos) : trois arbres, quatre buissons.
export const TREES: Sprite[] = [
    { sx: 24, sy: 14, w: 113, h: 139 }, { sx: 161, sy: 17, w: 97, h: 151 }, { sx: 295, sy: 31, w: 79, h: 120 },
]
const BUSHES: Sprite[] = [
    { sx: 98, sy: 195, w: 27, h: 25 }, { sx: 156, sy: 190, w: 38, h: 32 },
    { sx: 216, sy: 185, w: 47, h: 42 }, { sx: 346, sy: 190, w: 40, h: 35 },
]
const ATLAS_ROWS = 240 // arbres + buissons ; les touffes d'herbe plus bas ne servent pas

/** HSL (h en degrés, s et l dans 0..1) → RGB 0..255. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const c = (1 - Math.abs(2 * l - 1)) * s, hp = ((h % 360) + 360) % 360 / 60, x = c * (1 - Math.abs((hp % 2) - 1))
    const [r, g, b] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
    const m = l - c / 2
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

/** Teinte d'un feuillage recoloré : teinte, saturation et luminosité relatives, écart clair/sombre. */
export type Tint = { hue: number; sat: number; light: number; lift: number; spread: number }

/**
 * Feuillages saisonniers : automne orange / rouge / or ; printemps en cerisiers (sakura)
 * rose pâle et rose soutenu, et lilas blancs (les arbres verts d'origine s'y mêlent).
 */
export const FOLIAGE_TINTS: Record<string, Tint[]> = {
    autumn: [
        { hue: 26, sat: 1.4, light: 1.05, lift: 0, spread: 45 },
        { hue: 10, sat: 1.4, light: 1.05, lift: 0, spread: 45 },
        { hue: 40, sat: 1.4, light: 1.05, lift: 0, spread: 45 },
    ],
    spring: [
        { hue: 346, sat: 0.6, light: 1, lift: 0.42, spread: 12 },   // rose pâle
        { hue: 339, sat: 0.72, light: 1, lift: 0.35, spread: 12 },  // rose plus soutenu
        { hue: 285, sat: 0.28, light: 1, lift: 0.52, spread: 8 },   // blanc lilas
    ],
}

/**
 * Feuillage recoloré : les verts de l'atlas passent à la teinte donnée, troncs et ombres
 * grises intacts. Fait à la main, pixel par pixel et une seule fois : `ctx.filter` n'est
 * pas pris en charge partout (Safari), d'où des arbres restés verts chez certains joueurs.
 */
export function recolorFoliage(src: CanvasImageSource, tint: Tint): HTMLCanvasElement {
    const w = (src as HTMLImageElement).naturalWidth || (src as HTMLCanvasElement).width
    const h = Math.min(ATLAS_ROWS, (src as HTMLImageElement).naturalHeight || (src as HTMLCanvasElement).height)
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h
    const c = canvas.getContext('2d', { willReadFrequently: true })
    if (!c) return canvas
    c.drawImage(src, 0, 0)
    const img = c.getImageData(0, 0, w, h), d = img.data
    for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255
        const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min
        if (delta < 0.05) continue                                   // gris : tronc, ombres
        let hh = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
        hh *= 60; if (hh < 0) hh += 360
        if (hh < 45 || hh > 170) continue                            // bruns : inchangés
        const l = (max + min) / 2, s = delta / (1 - Math.abs(2 * l - 1))
        // Les tons clairs (côté lumière) et sombres s'écartent un peu de la teinte.
        const [nr, ng, nb] = hslToRgb(tint.hue + (l - 0.4) * tint.spread, Math.min(1, s * tint.sat + 0.12), Math.min(0.93, l * tint.light + tint.lift))
        d[i] = nr; d[i + 1] = ng; d[i + 2] = nb
    }
    c.putImageData(img, 0, 0)
    return canvas
}

/**
 * Arbres plantés en bord de route (automne) :
 * de vrais arbres, posés par la scène comme sprites triés en profondeur (un ennemi passe
 * devant ou derrière), pas peints au sol. Uniquement sur la rangée extérieure du couloir,
 * loin des forts et du lac. Positions fixes.
 */
export type TreeSpot = { x: number; y: number; tree: number; hue: number; flip: boolean; scale: number }

export function roadTreeSpots(map: MapDef): TreeSpot[] {
    const tints = FOLIAGE_TINTS[map.id]
    if (map.id !== 'autumn' || !tints) return []
    const nearLake = (x: number, y: number) => map.water.length > 0 && x >= LAKE.x0 - 1 && x <= LAKE.x1 + 1 && y >= LAKE.y0 - 2 && y <= LAKE.y1 + 2
    let seed = 404
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
    const gates = [...map.lanes.map(l => l[0]), map.waypoints[map.waypoints.length - 1]]
    const spots: TreeSpot[] = []
    const cells = [...map.path.corridorCells].sort((a, b) => a.y - b.y || a.x - b.x)
    for (const p of cells) {
        if (gates.some(g => Math.max(Math.abs(g.x - p.x), Math.abs(g.y - p.y)) <= 2) || nearLake(p.x, p.y)) continue
        // Côté hors route : l'arbre se range contre ce bord.
        const out = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !corridorHas(map.path, p.x + dx, p.y + dy))
        if (!out || rnd() > 0.16) continue
        if (spots.some(s => Math.abs(s.x - (p.x * 40 + 20)) < 60 && Math.abs(s.y - (p.y * 40 + 20)) < 60)) continue
        spots.push({
            x: p.x * 40 + 20 + out[0] * 11 + (rnd() - 0.5) * 8,
            y: p.y * 40 + 28 + out[1] * 9 + (rnd() - 0.5) * 6,
            tree: Math.floor(rnd() * TREES.length), hue: Math.floor(rnd() * tints.length), flip: rnd() < 0.5, scale: 0.36,
        })
    }
    return spots
}

/**
 * Printemps : allée de six cerisiers et lilas devant le château, hors des files des ennemis qui arrivent par l'allée (sprites triés en
 * profondeur, comme les arbres de bord de route).
 */
export function castleTreeSpots(map: MapDef): TreeSpot[] {
    if (map.water.length === 0) return []
    const c = map.waypoints[map.waypoints.length - 1]
    const x0 = (c.x - 1) * 40, y0 = (c.y - 1) * 40 // île de 3 × 3 cases
    // Trois paires devant le château ; l'axe central et le pont restent libres.
    return [0, 1, 2].flatMap(row => [
        { x: x0 + 18, y: y0 + 82 + row * 22, tree: 2, hue: row % 3, flip: false, scale: 0.25 },
        { x: x0 + 102, y: y0 + 82 + row * 22, tree: 2, hue: row % 3, flip: true, scale: 0.25 },
    ])
}

/** Décor en pixels peint une seule fois : aucune géométrie statique à rejouer par image. */
export function paintSeasonalTerrain(ctx: CanvasRenderingContext2D, map: MapDef, plants?: CanvasImageSource, road?: CanvasImageSource, standingPlant?: (atlas: CanvasImageSource, sprite: Sprite, x: number, y: number, w: number, h: number) => void) {
    ctx.imageSmoothingEnabled = false
    const autumn = map.id === 'autumn'
    const palette = autumn
        ? ['#655036', '#6b5338', '#70563b', '#765b3e', '#605037']
        : ['#536b41', '#587145', '#5d7448', '#61794b', '#50663e']
    let seed = autumn ? 202610 : 202604
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
    ctx.fillStyle = palette[0]; ctx.fillRect(0, 0, 800, 640)
    for (let y = 0; y < 640; y += 4) for (let x = 0; x < 800; x += 4) {
        ctx.fillStyle = palette[Math.floor(rnd() * palette.length)]
        ctx.fillRect(x, y, 4, 4)
    }

    // Chemins strictement issus du catalogue : le dessin et la simulation coïncident.
    // Largeur suivie du couloir : voie fine (halfWidth 0) ou large de trois cases.
    const widen = map.halfWidth * 80
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    for (const [color, width] of [[autumn ? '#503b2c' : '#405037', 36 + widen], [autumn ? '#a88457' : '#b1a079', 30 + widen]] as const) {
        ctx.strokeStyle = color; ctx.lineWidth = width
        for (const lane of map.lanes) {
            ctx.beginPath(); lane.forEach((p, i) => i ? ctx.lineTo(p.x * 40 + 20, p.y * 40 + 20) : ctx.moveTo(p.x * 40 + 20, p.y * 40 + 20)); ctx.stroke()
        }
    }
    // Dalles du pack CraftPix pour les jardins ; sous-bois en terre à l’automne.
    if (!autumn && road) {
        const tile = document.createElement('canvas'); tile.width = 16; tile.height = 16
        const tileCtx = tile.getContext('2d')!
        tileCtx.drawImage(road, 32, 32, 16, 16, 0, 0, 16, 16)
        const pattern = ctx.createPattern(tile, 'repeat')
        if (pattern) {
            ctx.strokeStyle = pattern; ctx.lineWidth = 26 + widen
            for (const lane of map.lanes) {
                ctx.beginPath(); lane.forEach((p, i) => i ? ctx.lineTo(p.x*40+20, p.y*40+20) : ctx.moveTo(p.x*40+20, p.y*40+20)); ctx.stroke()
            }
        }
    }
    for (const p of map.path.corridorCells) for (let i = 0; i < 6; i++) {
        ctx.fillStyle = autumn ? '#c19d69' : '#c6b58d'
        ctx.fillRect(p.x * 40 + 9 + rnd() * 22, p.y * 40 + 9 + rnd() * 22, 3, 2)
    }

    // Lac du printemps : l'île du château au centre, les douves (map.water) et les ponts
    // (cases de route qui traversent le lac). L'eau n'est jamais une case de tour.
    const castle = map.waypoints[map.waypoints.length - 1]
    const inLake = (x: number, y: number) => map.water.length > 0 && x >= LAKE.x0 && x <= LAKE.x1 && y >= LAKE.y0 && y <= LAKE.y1
    if (map.water.length > 0) {
        const lx = LAKE.x0 * 40, ly = LAKE.y0 * 40, lw = (LAKE.x1 - LAKE.x0 + 1) * 40, lh = (LAKE.y1 - LAKE.y0 + 1) * 40
        ctx.fillStyle = '#344e39'; ctx.fillRect(lx - 4, ly - 4, lw + 8, lh + 8)          // rive
        ctx.fillStyle = '#527f87'; ctx.fillRect(lx, ly, lw, lh)
        for (const c of map.water) {
            for (let i = 0; i < 3; i++) {                                                  // reflets
                ctx.fillStyle = i % 2 ? '#76a4a4' : '#466d79'
                ctx.fillRect(c.x * 40 + 6 + rnd() * 22, c.y * 40 + 6 + rnd() * 26, 6 + rnd() * 8, 2)
            }
            if (rnd() < 0.3) {                                                             // nénuphar, parfois fleuri
                const px = c.x * 40 + 10 + rnd() * 20, py = c.y * 40 + 10 + rnd() * 20
                ctx.fillStyle = '#5f8f4e'; ctx.fillRect(px - 4, py - 2, 8, 4); ctx.fillRect(px - 2, py - 3, 4, 6)
                if (rnd() < 0.5) { ctx.fillStyle = '#e7b7c8'; ctx.fillRect(px - 1, py - 1, 2, 2) }
            }
        }
        // Île : pelouse cerclée de pierre, autour du château.
        const ix = (castle.x - 1) * 40, iy = (castle.y - 1) * 40
        ctx.fillStyle = '#7d7466'; ctx.fillRect(ix + 2, iy + 2, 116, 116)
        ctx.fillStyle = '#5d7448'; ctx.fillRect(ix + 7, iy + 7, 106, 106)
        ctx.fillStyle = '#b1a079'; ctx.fillRect(ix + 44, iy + 7, 32, 106)                 // allée nord-sud
        // Ponts : planches en travers, garde-corps de chaque côté, sur chaque traversée.
        for (let y = LAKE.y0; y <= LAKE.y1; y++) {
            const run: number[] = []
            for (let x = LAKE.x0; x <= LAKE.x1; x++) {
                const island = Math.max(Math.abs(x - castle.x), Math.abs(y - castle.y)) <= 1
                if (corridorHas(map.path, x, y) && !island) run.push(x)
            }
            if (run.length === 0) continue
            const bx = run[0] * 40 + 4, bw = run.length * 40 - 8, by = y * 40 - 3
            for (let i = 0; i < 9; i++) {
                ctx.fillStyle = i % 2 ? '#9e7950' : '#b39360'
                ctx.fillRect(bx, by + i * 5, bw, 4)
            }
            ctx.fillStyle = '#513e2b'; ctx.fillRect(bx - 3, by - 2, 4, 48); ctx.fillRect(bx + bw - 1, by - 2, 4, 48)
        }
    }

    // Arbres et buissons : seulement sur les zones mortes, loin des entrées et du château.
    // Automne : érables orange, rouges, or. Printemps : les mêmes arbres en cerisiers
    // (sakura) roses, lilas blancs et arbres verts classiques.
    let foliage: CanvasImageSource[] = plants ? [plants] : []
    if (plants && FOLIAGE_TINTS[map.id]) {
        // Atlas d'une autre origine (canvas « teinté ») : on garde les arbres d'origine.
        try {
            const tinted = FOLIAGE_TINTS[map.id].map((tint) => recolorFoliage(plants, tint))
            foliage = autumn ? tinted : [...tinted, plants]
        } catch { foliage = [plants] }
    }
    // Ce qui tombe au pied des arbres : feuilles mortes ou pétales de cerisier.
    const LEAVES = autumn ? ['#c8642a', '#e2a548', '#9a3b1d', '#d8812f'] : ['#f6c6d6', '#f9e1ea', '#eaa3bd', '#fdf3f6']
    const plant = (s: Sprite, scale: number, fx: number, footY: number, litter: number) => {
        const atlas = foliage[Math.floor(rnd() * foliage.length)]
        const w = Math.round(s.w * scale), h = Math.round(s.h * scale)
        ctx.fillStyle = '#27362644'; ctx.beginPath(); ctx.ellipse(fx, footY - 1, w * 0.42, Math.max(3, w * 0.1), 0, 0, Math.PI * 2); ctx.fill()
        for (let i = 0; i < litter; i++) {                                                // feuilles tombées au pied
            ctx.fillStyle = LEAVES[Math.floor(rnd() * LEAVES.length)]
            ctx.fillRect(fx - w * 0.6 + rnd() * w * 1.2, footY - 6 + rnd() * 10, 3, 2)
        }
        if (standingPlant) standingPlant(atlas, s, fx, footY, w, h)
        else ctx.drawImage(atlas, s.sx, s.sy, s.w, s.h, fx - w / 2, footY - h, w, h)
    }
    // Distance (Chebyshev) aux forts : on laisse le fort lisible (rien à 1 case, buissons à 2).
    const gateDist = (x: number, y: number) => Math.min(...[...map.lanes.map(l => l[0]), castle].map(p => Math.max(Math.abs(p.x - x), Math.abs(p.y - y))))
    const free = (x: number, y: number) => !corridorHas(map.path, x, y) && !buildableHas(map.path, x, y) && !inLake(x, y)
    // L'automne remplit toutes les cases vides ; le printemps garde ses arbres, en cerisiers.
    const density = autumn ? 1 : 0.4
    // Printemps : massifs de fleurs dans l'herbe libre et le long de la route (sous les arbres).
    if (!autumn) {
        const COLORS = ['#f4a7c3', '#fbeff4', '#f2d45c', '#c7a6e8', '#e0566a', '#ffffff']
        const tuft = (px: number, py: number, n: number) => {
            const color = COLORS[Math.floor(rnd() * COLORS.length)]
            for (let i = 0; i < n; i++) {
                const fx = Math.round(px + (rnd() - 0.5) * 16), fy = Math.round(py + (rnd() - 0.5) * 10)
                ctx.fillStyle = '#5f8f4e'; ctx.fillRect(fx, fy + 2, 1, 3)                    // tige
                ctx.fillStyle = color                                                     // corolle en croix
                ctx.fillRect(fx - 1, fy, 3, 1); ctx.fillRect(fx, fy - 1, 1, 3)
                ctx.fillStyle = color === '#f2d45c' ? '#c9822e' : '#f6dd6a'; ctx.fillRect(fx, fy, 1, 1) // cœur
            }
        }
        for (let y = 0; y < 16; y++) for (let x = 0; x < 20; x++) {
            if (!free(x, y) || gateDist(x, y) <= 1) continue
            for (let k = 0; k < 2; k++) if (rnd() < 0.7) tuft(x * 40 + 8 + rnd() * 24, y * 40 + 10 + rnd() * 24, 4 + Math.floor(rnd() * 4))
        }
        for (const p of map.path.corridorCells) {
            const out = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !corridorHas(map.path, p.x + dx, p.y + dy))
            if (!out || inLake(p.x, p.y) || rnd() > 0.35) continue
            tuft(p.x * 40 + 20 + out[0] * 15, p.y * 40 + 20 + out[1] * 15, 3)
        }
    }
    for (let y = 0; y < 16; y++) for (let x = 0; x < 20; x++) {
        const gate = gateDist(x, y)
        if (!free(x, y) || gate <= 1 || (!autumn && gate <= 2)) continue
        if (rnd() > density) continue
        const cx = x * 40 + 20, cy = y * 40 + 25
        if (foliage.length > 0) {
            // Un grand arbre ne doit pas déborder sur une case de tour au-dessus.
            const room = !buildableHas(map.path, x, y - 1) && gate > 2
            const fx = cx + Math.round((rnd() - 0.5) * 8)
            if (room) plant(TREES[Math.floor(rnd() * TREES.length)], 0.42, fx, cy + 6, 7)
            else plant(BUSHES[Math.floor(rnd() * BUSHES.length)], 0.7, fx, cy + 6, 4)
            // Automne : un buisson de plus devant, pour un sous-bois bien fourni.
            if (autumn && rnd() < 0.45) plant(BUSHES[Math.floor(rnd() * BUSHES.length)], 0.5, cx + (rnd() < 0.5 ? -12 : 12), cy + 15, 3)
            continue
        }
        ctx.fillStyle = '#34402e'; ctx.fillRect(cx - 17, cy + 9, 35, 7)
        ctx.fillStyle = '#5a402e'; ctx.fillRect(cx - 3, cy - 12, 7, 26)
        // Masses de feuillage ombrées : de petits bouquets plutôt qu'un bruit multicolore.
        const leaves = autumn ? ['#6b4930', '#985c32', '#bd7b40', '#d7a35a'] : ['#486140', '#84915c', '#c9ac9b', '#e5cabb']
        const oval = (px: number, py: number, rx: number, ry: number, color: string) => {
            ctx.fillStyle = color
            for (let dy = -ry; dy <= ry; dy += 2) {
                const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy/ry)**2)) / 2) * 2
                ctx.fillRect(px - half, py + dy, half * 2, 2)
            }
        }
        oval(cx, cy - 7, 22, 20, leaves[0])
        oval(cx - 9, cy - 13, 14, 14, leaves[1]); oval(cx + 9, cy - 13, 14, 15, leaves[1])
        oval(cx - 1, cy - 24, 16, 14, leaves[2])
        oval(cx - 8, cy - 25, 9, 8, leaves[3])
        oval(cx + 12, cy - 12, 9, 8, leaves[2])
        oval(cx - 12, cy - 10, 8, 8, leaves[2])
        for (let i = 0; i < 6; i++) {
            ctx.fillStyle = i % 2 ? leaves[3] : leaves[1]
            ctx.fillRect(cx - 13 + Math.floor(rnd()*25), cy - 28 + Math.floor(rnd()*25), 3, 2)
        }
    }
    // Automne : la route est jonchée de tas de feuilles, avec quelques petits buissons sur
    // ses bords (bas : les ennemis passent par-dessus sans être masqués).
    if (autumn) {
        for (const p of map.path.corridorCells) {
            if (rnd() < 0.35) {
                const px = p.x * 40 + 6 + rnd() * 28, py = p.y * 40 + 6 + rnd() * 28
                for (let i = 0; i < 10; i++) {
                    ctx.fillStyle = LEAVES[Math.floor(rnd() * LEAVES.length)]
                    ctx.fillRect(px - 8 + rnd() * 16, py - 5 + rnd() * 10, 3, 2)
                }
            }
            const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !corridorHas(map.path, p.x + dx, p.y + dy))
            if (foliage.length > 0 && edge && gateDist(p.x, p.y) > 2 && rnd() < 0.1) {
                plant(BUSHES[Math.floor(rnd() * 2)], 0.55, p.x * 40 + 8 + rnd() * 24, p.y * 40 + 20 + rnd() * 14, 4)
            }
        }
    }
    // Fleurs / feuilles au sol : petites touches, jamais sur les cases de pose.
    const flecks = autumn ? 700 : 420
    for (let i = 0; i < flecks; i++) {
        const x = Math.floor(rnd() * 800), y = Math.floor(rnd() * 640)
        if (!free(Math.floor(x / 40), Math.floor(y / 40))) continue
        ctx.fillStyle = autumn ? ['#c1904a', '#c8642a', '#e2a548', '#9a3b1d'][i % 4] : ['#f6c6d6', '#fbeff4', '#cad59c', '#eaa3bd'][i % 4]
        ctx.fillRect(x, y, 3, 2)
    }
}
