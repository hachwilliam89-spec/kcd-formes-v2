'use client'

import { useEffect, useRef, useState } from 'react'
import { audio } from '@/lib/audio'

// Bouton volume compact (même gabarit que les autres boutons du HUD) qui ouvre un
// petit menu : couper le son + réglages séparés Musique / Bruitages (persistés).
export default function AudioControls() {
    const [open, setOpen] = useState(false)
    const [muted, setMuted] = useState(false)
    const [sfx, setSfx] = useState(1)
    const [music, setMusic] = useState(1)
    const ref = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const sync = () => { setMuted(audio.isMuted()); setSfx(audio.getSfx()); setMusic(audio.getMusic()) }
        sync()
        return audio.subscribe(sync)
    }, [])

    // Fermeture au clic en dehors.
    useEffect(() => {
        if (!open) return
        const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
        document.addEventListener('mousedown', onDoc)
        return () => document.removeEventListener('mousedown', onDoc)
    }, [open])

    const off = muted || (sfx === 0 && music === 0)

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                aria-label="Réglages audio"
                onClick={() => { audio.resume(); setOpen((o) => !o) }}
                className="kcd-btn text-xs py-1 px-2 flex items-center"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M3 9v6h4l5 5V4L7 9H3z" />
                    {off
                        ? <path d="M16 8l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                        : <path d="M15.5 8.5a5 5 0 010 7M18 6a8 8 0 010 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />}
                </svg>
            </button>

            {open && (
                <div className="absolute right-0 top-full mt-1 z-50 kcd-panel w-52 flex flex-col gap-2 font-pixel">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#5a3d16]">Son</span>
                        <button
                            onClick={() => { audio.resume(); audio.toggleMute() }}
                            className="kcd-btn text-[10px] py-0.5 px-2"
                        >
                            {muted ? '🔈 Réactiver' : '🔇 Couper'}
                        </button>
                    </div>
                    <label className="text-[11px] text-[#5a3d16] flex flex-col gap-0.5">
                        Musique de fond
                        <input type="range" min={0} max={1} step={0.05} value={music} disabled={muted}
                               onChange={(e) => { audio.resume(); audio.setMusicVolume(Number(e.target.value)) }}
                               className="w-full accent-[#c9a84a] disabled:opacity-40" aria-label="Volume musique" />
                    </label>
                    <label className="text-[11px] text-[#5a3d16] flex flex-col gap-0.5">
                        Bruitages
                        <input type="range" min={0} max={1} step={0.05} value={sfx} disabled={muted}
                               onChange={(e) => { audio.resume(); audio.setSfxVolume(Number(e.target.value)) }}
                               className="w-full accent-[#c9a84a] disabled:opacity-40" aria-label="Volume bruitages" />
                    </label>
                </div>
            )}
        </div>
    )
}
