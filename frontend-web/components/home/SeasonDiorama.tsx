'use client'

import { useEffect, useRef } from 'react'
import { recolorFoliage, TREES, FOLIAGE_TINTS, type Tint } from '@/components/game/seasonalTerrain'

// Scène d'accueil : les quatre cartes du jeu côte à côte (été, hiver, printemps,
// automne), chacune avec sa météo, et une route où défilent les ennemis du jeu.
// Tout est dessiné sur une grille de « gros pixels » (PX) pour garder le grain du jeu.

/** Hauteur (px CSS) du centre de la route au-dessus du bas de la scène : la page cale ses panneaux dessus. */
export const ROAD_FROM_BOTTOM = 112

type Season = {
    ground: string[]
    road: string; roadEdge: string
    trees: Tint[] | null   // null : feuillage d'origine
    treeChance: number
}
const SEASONS: Season[] = [
    { ground: ['#c9a463', '#d0ab69', '#c19c5c', '#d6b475'], road: '#e2c78c', roadEdge: '#a8884e', trees: [{ hue: 52, sat: 0.9, light: 1.05, lift: 0.06, spread: 25 }], treeChance: 0.14 },
    { ground: ['#dfe8ee', '#d3dee6', '#e8f0f4', '#c8d6df'], road: '#f2f6f8', roadEdge: '#93aab8', trees: [{ hue: 205, sat: 0.22, light: 1, lift: 0.5, spread: 6 }], treeChance: 0.32 },
    { ground: ['#536b41', '#587145', '#5d7448', '#4f663d'], road: '#c6b58d', roadEdge: '#7e6c49', trees: FOLIAGE_TINTS.spring, treeChance: 0.38 },
    { ground: ['#655036', '#6b5338', '#70563b', '#5f4b33'], road: '#b8915f', roadEdge: '#6b4d31', trees: FOLIAGE_TINTS.autumn, treeChance: 0.5 },
]
const ENEMIES = [
    { type: 'GOBLIN', speed: 38 }, { type: 'ORC', speed: 32 }, { type: 'GOBLIN', speed: 40 },
    { type: 'TROLL', speed: 24 }, { type: 'DARK_KNIGHT', speed: 30 }, { type: 'ORC', speed: 33 },
]
const CELL = 96, WALK_FRAMES = 12

type Particle = { band: number; x: number; y: number; vx: number; vy: number; phase: number; color: string; w: number; h: number }

function loadImage(src: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = src
    })
}

export default function SeasonDiorama() {
    const ref = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = ref.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        let w = 0, h = 0, PX = 3, roadY = 0
        let ground: HTMLCanvasElement | null = null
        let parts: Particle[] = []
        let raf = 0, last = performance.now(), cancelled = false
        let atlases: CanvasImageSource[][] | null = null   // feuillage recoloré par saison (calculé une fois)
        const sheets = new Map<string, HTMLImageElement>()
        const walkers = ENEMIES.map((e, i) => ({ ...e, x: -120 - i * 190, frame: (i * 5) % WALK_FRAMES }))

        let seed = 4
        const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
        const bandOf = (x: number) => Math.min(3, Math.max(0, Math.floor((x / w) * 4)))

        const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
        const PAL = SEASONS.map((s) => ({ ground: s.ground.map(rgb), road: rgb(s.road), edge: rgb(s.roadEdge) }))

        /** Sol, route et arbres : dessinés une fois par taille d'écran. */
        const buildGround = () => {
            seed = 4
            const lw = Math.ceil(w / PX), lh = Math.ceil(h / PX)
            const low = document.createElement('canvas'); low.width = lw; low.height = lh
            const lc = low.getContext('2d')!
            const img = lc.createImageData(lw, lh), d = img.data
            const roadLow = Math.round(roadY / PX), roadHalf = 5
            for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
                // Frontières entre saisons tramées sur quelques pixels, comme un fondu de pixel art.
                const fx = (x / lw) * 4 + (rnd() - 0.5) * 0.06
                const pal = PAL[Math.min(3, Math.max(0, Math.floor(fx)))]
                const dy = Math.abs(y - roadLow)
                const c = dy < roadHalf ? (dy === roadHalf - 1 || rnd() < 0.08 ? pal.edge : pal.road) : pal.ground[Math.floor(rnd() * pal.ground.length)]
                const i = (y * lw + x) * 4
                d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255
            }
            lc.putImageData(img, 0, 0)
            const g = document.createElement('canvas'); g.width = w; g.height = h
            const gc = g.getContext('2d')!
            gc.imageSmoothingEnabled = false
            gc.drawImage(low, 0, 0, lw * PX, lh * PX)
            if (atlases) {
                // Arbres en rangées, triés de haut en bas : ceux de devant passent devant.
                const scale = PX >= 3 ? 0.5 : 0.36
                const step = Math.round(64 * scale * 2)
                const spots: { x: number; y: number; band: number }[] = []
                for (let y = step; y < h + step; y += Math.round(step * 0.8)) {
                    if (Math.abs(y - roadY) < 40) continue                     // la route reste dégagée
                    for (let x = (y / step) % 2 ? step / 2 : 0; x < w; x += step) {
                        const band = bandOf(x)
                        if (rnd() < SEASONS[band].treeChance) spots.push({ x: x + (rnd() - 0.5) * step * 0.6, y: y + (rnd() - 0.5) * 10, band })
                    }
                }
                for (const p of spots) {
                    const t = TREES[Math.floor(rnd() * TREES.length)]
                    const list = atlases[p.band]
                    const atlas = list[Math.floor(rnd() * list.length)]
                    const tw = Math.round(t.w * scale), th = Math.round(t.h * scale)
                    gc.fillStyle = '#00000030'
                    gc.fillRect(Math.round(p.x - tw * 0.35), Math.round(p.y - 3), Math.round(tw * 0.7), 4)
                    gc.drawImage(atlas, t.sx, t.sy, t.w, t.h, Math.round(p.x - tw / 2), Math.round(p.y - th), tw, th)
                }
            }
            ground = g
        }

        /** Météo de chaque saison : sable, neige, pétales et pluie, feuilles. */
        const buildParticles = () => {
            const bw = w / 4, n = Math.max(10, Math.round((bw * h) / 9000))
            parts = []
            const add = (band: number, color: string, vx: number, vy: number, pw: number, ph: number) => parts.push({
                band, x: band * bw + Math.random() * bw, y: Math.random() * h, vx, vy, phase: Math.random() * 6.28, color, w: pw, h: ph,
            })
            for (let i = 0; i < n; i++) add(0, i % 2 ? '#f6e2a8' : '#e9c983', 40 + Math.random() * 40, 4, PX, PX)
            for (let i = 0; i < n; i++) add(1, i % 3 ? '#ffffff' : '#d6ecf7', 0, 22 + Math.random() * 26, PX, PX)
            for (let i = 0; i < n * 0.6; i++) add(2, i % 2 ? '#f7c3d6' : '#fdf0f5', 18, 22 + Math.random() * 14, PX * 2, PX)
            for (let i = 0; i < n * 0.6; i++) add(2, '#bcd9ea', -30, 300 + Math.random() * 80, PX, PX * 4)
            for (let i = 0; i < n * 0.8; i++) add(3, ['#d8692b', '#e2a548', '#9a3b1d'][i % 3], 0, 26 + Math.random() * 22, PX * 2, PX * 2)
        }

        const resize = () => {
            if (canvas.clientWidth === w && canvas.clientHeight === h && ground) return
            w = canvas.clientWidth; h = canvas.clientHeight
            canvas.width = w; canvas.height = h
            PX = w < 640 ? 2 : 3
            roadY = h - ROAD_FROM_BOTTOM
            buildGround(); buildParticles()
            if (reduced) draw(0)
        }

        const draw = (dt: number) => {
            ctx.imageSmoothingEnabled = false
            if (ground) ctx.drawImage(ground, 0, 0)
            const bw = w / 4
            const snap = (v: number) => Math.round(v / PX) * PX
            for (const p of parts) {
                p.phase += dt * 2
                p.x += (p.vx + (p.band === 1 || p.band === 3 ? Math.sin(p.phase) * 18 : 0)) * dt
                p.y += (p.vy + (p.band === 0 ? Math.sin(p.phase) * 8 : 0)) * dt
                const x0 = p.band * bw
                if (p.y > h) p.y -= h + 10
                if (p.x > x0 + bw) p.x -= bw
                if (p.x < x0) p.x += bw
                ctx.fillStyle = p.color
                ctx.fillRect(snap(p.x), snap(p.y), p.w, p.h)
            }
            // Brume d'automne : nappes qui traînent au ras de la route.
            ctx.fillStyle = '#e8e6ee14'
            for (let i = 0; i < 6; i++) {
                const fx = 3 * bw + ((performance.now() / 90 + i * 70) % (bw + 160)) - 80
                ctx.fillRect(snap(fx), snap(roadY - 30 - (i % 3) * 14), PX * 26, PX * 5)
            }
            // Défilé d'ennemis sur la route, de gauche à droite.
            for (const e of walkers) {
                const sheet = sheets.get(e.type)
                e.x += e.speed * dt
                e.frame = (e.frame + dt * 10) % WALK_FRAMES
                if (e.x > w + 80) e.x = -80 - Math.random() * 240
                if (!sheet) continue
                const size = PX >= 3 ? CELL : CELL * 0.67
                ctx.drawImage(sheet, Math.floor(e.frame) * CELL, 0, CELL, CELL, Math.round(e.x - size / 2), Math.round(roadY - size * 0.86), size, size)
            }
        }

        const tick = (now: number) => {
            if (cancelled) return
            const dt = Math.min(0.05, (now - last) / 1000); last = now
            draw(dt)
            raf = requestAnimationFrame(tick)
        }

        let pending = 0
        const observer = new ResizeObserver(() => { cancelAnimationFrame(pending); pending = requestAnimationFrame(resize) })
        observer.observe(canvas)
        Promise.all([
            loadImage('/sprites/seasonal/plants.png'),
            ...[...new Set(ENEMIES.map((e) => e.type))].map((t) => loadImage(`/sprites/enemies/${t}.png`).then((img) => { if (img) sheets.set(t, img) })),
        ]).then(([p]) => {
            if (cancelled) return
            const plants = p as HTMLImageElement | null
            if (plants) atlases = SEASONS.map((s) => {
                try { return s.trees ? s.trees.map((t) => recolorFoliage(plants, t)) : [plants] } catch { return [plants] }
            })
            ground = null
            resize()
            if (!reduced) raf = requestAnimationFrame(tick)
        })
        resize()
        return () => { cancelled = true; cancelAnimationFrame(raf); cancelAnimationFrame(pending); observer.disconnect() }
    }, [])

    return <canvas ref={ref} className="ws-diorama" aria-hidden="true" />
}
