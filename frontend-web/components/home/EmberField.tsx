'use client'

import { useEffect, useRef } from 'react'

// Braises/étincelles qui montent lentement à l'écran (canvas plein cadre, en
// fond). Léger, sans dépendance : ambiance "champ de bataille" pour l'accueil.
export default function EmberField() {
    const ref = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = ref.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let w = 0, h = 0
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const resize = () => {
            w = canvas.clientWidth; h = canvas.clientHeight
            canvas.width = w * dpr; canvas.height = h * dpr
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        }
        resize()
        window.addEventListener('resize', resize)

        type P = { x: number; y: number; r: number; vy: number; vx: number; a: number; hue: number }
        const N = Math.min(70, Math.round((w * h) / 22000))
        const rnd = (a: number, b: number) => a + Math.random() * (b - a)
        const spawn = (init: boolean): P => ({
            x: rnd(0, w),
            y: init ? rnd(0, h) : h + 10,
            r: rnd(0.8, 2.6),
            vy: rnd(8, 26),          // px/s vers le haut
            vx: rnd(-6, 6),
            a: rnd(0.2, 0.9),
            hue: rnd(24, 42),        // orangé
        })
        const parts: P[] = Array.from({ length: N }, () => spawn(true))

        let raf = 0, last = performance.now()
        const tick = (now: number) => {
            const dt = Math.min(0.05, (now - last) / 1000); last = now
            ctx.clearRect(0, 0, w, h)
            for (const p of parts) {
                p.y -= p.vy * dt
                p.x += p.vx * dt + Math.sin(p.y / 40) * 0.3
                if (p.y < -10) Object.assign(p, spawn(false))
                const flick = 0.7 + 0.3 * Math.sin(now / 200 + p.x)
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
                ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${p.a * flick})`
                ctx.shadowBlur = 8
                ctx.shadowColor = `hsla(${p.hue}, 100%, 55%, ${p.a})`
                ctx.fill()
            }
            ctx.shadowBlur = 0
            raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)

        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize) }
    }, [])

    return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden />
}
