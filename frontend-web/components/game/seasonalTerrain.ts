import type { MapDef } from './maps'
import { corridorHas, buildableHas } from './constants'

/** Décor en pixels peint une seule fois : aucune géométrie statique à rejouer par image. */
export function paintSeasonalTerrain(ctx: CanvasRenderingContext2D, map: MapDef, plants?: CanvasImageSource, road?: CanvasImageSource) {
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
    // Ruisseaux autour des berges basses, franchis par des ponts sur les voies.
    if (!autumn) {
        for (const y of [5, 11]) {
            ctx.fillStyle = '#344e39'; ctx.fillRect(282, y * 40 - 3, 339, 40)
            ctx.fillStyle = '#527f87'; ctx.fillRect(286, y * 40 + 1, 331, 30)
            for (let i = 0; i < 34; i++) {
                ctx.fillStyle = i % 2 ? '#76a4a4' : '#466d79'
                ctx.fillRect(290 + rnd() * 320, y * 40 + 4 + rnd() * 20, 8 + rnd() * 10, 2)
            }
        }
    }
    // Chemins strictement issus du catalogue : le dessin et la simulation coïncident.
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    for (const [color, width] of [[autumn ? '#503b2c' : '#405037', 36], [autumn ? '#a88457' : '#b1a079', 30]] as const) {
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
            ctx.strokeStyle = pattern; ctx.lineWidth = 26
            for (const lane of map.lanes) {
                ctx.beginPath(); lane.forEach((p, i) => i ? ctx.lineTo(p.x*40+20, p.y*40+20) : ctx.moveTo(p.x*40+20, p.y*40+20)); ctx.stroke()
            }
        }
    }
    for (const p of map.path.corridorCells) for (let i = 0; i < 6; i++) {
        ctx.fillStyle = autumn ? '#c19d69' : '#c6b58d'
        ctx.fillRect(p.x * 40 + 9 + rnd() * 22, p.y * 40 + 9 + rnd() * 22, 3, 2)
    }
    if (!autumn) for (const y of [5, 11]) {
        for (let i = 0; i < 8; i++) {
            ctx.fillStyle = i % 2 ? '#9e7950' : '#b39360'
            ctx.fillRect(280, y * 40 - 5 + i * 5, 39, 4)
        }
        ctx.fillStyle = '#513e2b'; ctx.fillRect(278, y * 40 - 7, 3, 44); ctx.fillRect(318, y * 40 - 7, 3, 44)
    }
    // Les bosquets restent dans les zones mortes, loin des entrées et du château.
    const nearGate = (x: number, y: number) => [...map.lanes.map(l => l[0]), map.waypoints.at(-1)!].some(p => Math.abs(p.x - x) < 3 && Math.abs(p.y - y) < 3)
    for (let y = 1; y < 16; y++) for (let x = 0; x < 20; x++) {
        if (corridorHas(map.path, x, y) || buildableHas(map.path, x, y) || nearGate(x, y)) continue
        if (!autumn && (y === 5 || y === 11) && x >= 7 && x <= 15) continue
        if (rnd() > 0.35) continue
        const cx = x * 40 + 20, cy = y * 40 + 25
        if (plants) {
            // Un grand arbre ne doit pas masquer la rangée constructible au-dessus.
            const room = [-1, 0, 1].every(dx => !corridorHas(map.path, x+dx, y-1) && !buildableHas(map.path, x+dx, y-1))
            ctx.fillStyle = '#27362644'; ctx.beginPath(); ctx.ellipse(cx, cy+5, room ? 20 : 10, 5, 0, 0, Math.PI*2); ctx.fill()
            ctx.save()
            // Teinte appliquée uniquement au décor baké, jamais aux unités ou à l’UI.
            if (autumn) ctx.filter = 'sepia(0.35) saturate(1.5) hue-rotate(-27deg)'
            if (room) ctx.drawImage(plants, 16, 8, 128, 152, cx-24, cy-52, 48, 57)
            else ctx.drawImage(plants, 32, 192, 32, 32, cx-12, cy-17, 24, 24)
            ctx.restore()
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
    // Fleurs / feuilles au sol : petites touches, jamais sur les cases de pose.
    for (let i = 0; i < 300; i++) {
        const x = Math.floor(rnd() * 800), y = Math.floor(rnd() * 640)
        if (corridorHas(map.path, Math.floor(x / 40), Math.floor(y / 40)) || buildableHas(map.path, Math.floor(x / 40), Math.floor(y / 40))) continue
        ctx.fillStyle = autumn ? '#c1904a' : (i % 2 ? '#dcbab4' : '#cad59c')
        ctx.fillRect(x, y, 3, 2)
    }
}
