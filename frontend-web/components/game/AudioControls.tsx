'use client'

import { useEffect, useState } from 'react'
import { audio } from '@/lib/audio'

// Contrôle audio compact pour le HUD : bouton mute (icône haut-parleur) + slider
// de volume. L'état vient de l'AudioManager (persisté en localStorage) et est
// synchronisé via son abonnement.
export default function AudioControls() {
    const [muted, setMuted] = useState(false)
    const [volume, setVolume] = useState(0.7)

    useEffect(() => {
        const sync = () => { setMuted(audio.isMuted()); setVolume(audio.getVolume()) }
        sync()
        return audio.subscribe(sync)
    }, [])

    return (
        <div className="kcd-panel font-pixel flex items-center gap-2 px-2 py-1.5">
            <button
                type="button"
                aria-label={muted ? 'Activer le son' : 'Couper le son'}
                onClick={() => { audio.resume(); audio.toggleMute() }}
                className="shrink-0 text-[#3a2a12] hover:text-[#7a5a2c]"
            >
                {muted || volume === 0 ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M3 9v6h4l5 5V4L7 9H3z" />
                        <path d="M16 8l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                    </svg>
                ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                        <path d="M3 9v6h4l5 5V4L7 9H3z" />
                        <path d="M15.5 8.5a5 5 0 010 7M18 6a8 8 0 010 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
                    </svg>
                )}
            </button>
            <input
                type="range"
                min={0} max={1} step={0.05}
                value={muted ? 0 : volume}
                onChange={(e) => { audio.resume(); const v = Number(e.target.value); if (audio.isMuted() && v > 0) audio.setMuted(false); audio.setVolume(v) }}
                className="w-full accent-[#7a5a2c]"
                aria-label="Volume"
            />
        </div>
    )
}
