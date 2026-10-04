'use client'

import { useEffect, useRef } from 'react'
import { createWarScene, IH, IW } from './warScene'

// Fond de l'accueil : la carte de guerre des quatre saisons, animée.
// L'image est aussi le fond CSS du conteneur (affichée avant le JavaScript et
// quand l'utilisateur réduit les animations) ; le canvas la redessine avec la
// scène par-dessus, au même cadrage (cover + background-position du CSS).

const FPS = 30

export default function WarMap() {
    const hostRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const host = hostRef.current, canvas = canvasRef.current
        if (!host || !canvas) return
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
        // Sans sa feuille de style (CSS pas encore rechargé), le canvas serait dans
        // le flux et grandirait à chaque mesure : on ne lance rien.
        if (getComputedStyle(host).position !== 'fixed') return
        const screen = canvas.getContext('2d')
        if (!screen) return

        let stopped = false, raf = 0
        let view = { sx: 0, sy: 0, sw: IW, sh: IH }

        // Même cadrage que background-size: cover + background-position.
        const fit = () => {
            const w = host.clientWidth, h = host.clientHeight
            if (!w || !h) return
            const dpr = Math.min(window.devicePixelRatio || 1, 2, 4096 / Math.max(w, h))
            canvas.width = Math.round(w * dpr)
            canvas.height = Math.round(h * dpr)
            const css = getComputedStyle(host)
            const fx = (parseFloat(css.backgroundPositionX) || 50) / 100
            const fy = (parseFloat(css.backgroundPositionY) || 50) / 100
            const s = Math.max(w / IW, h / IH)
            const ox = (w - IW * s) * fx, oy = (h - IH * s) * fy
            view = { sx: -ox / s, sy: -oy / s, sw: w / s, sh: h / s }
            screen.imageSmoothingEnabled = false
        }
        const ro = new ResizeObserver(fit)

        const img = new Image()
        img.src = getComputedStyle(host).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1] ?? '/home/war-map.webp'
        img.decode().then(() => {
            if (stopped) return
            const scene = createWarScene(img)
            for (let i = 0; i < 120; i++) scene.step(1 / FPS) // la bataille a déjà commencé
            const buffer = document.createElement('canvas')
            buffer.width = IW
            buffer.height = IH
            const g = buffer.getContext('2d')!
            fit()
            ro.observe(host)
            let last = performance.now()
            const frame = (now: number) => {
                raf = requestAnimationFrame(frame)
                const elapsed = now - last
                if (elapsed < 1000 / FPS - 2) return
                last = now
                scene.step(Math.min(elapsed / 1000, 0.1))
                scene.draw(g)
                screen.drawImage(buffer, view.sx, view.sy, view.sw, view.sh, 0, 0, canvas.width, canvas.height)
            }
            raf = requestAnimationFrame(frame)
        }).catch(() => { /* l'image fixe du CSS reste affichée */ })

        return () => { stopped = true; cancelAnimationFrame(raf); ro.disconnect() }
    }, [])

    return (
        <div ref={hostRef} className="ws-map" aria-hidden="true">
            <canvas ref={canvasRef} className="ws-map-canvas" />
        </div>
    )
}
