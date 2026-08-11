// Gestionnaire audio global (Web Audio API) — indépendant de Phaser pour être
// utilisable aussi bien depuis la scène de jeu que depuis les composants React
// (menu, HUD, écrans de fin). Un seul contexte partagé, mixage via un gain
// maître (volume + mute persistés en localStorage). Les SFX sont décodés une
// fois puis rejoués par AudioBufferSourceNode → chevauchement propre (plusieurs
// tirs en même temps) sans clonage d'éléments <audio>.

export type Sfx =
    | 'ui_click' | 'tower_place'
    | 'shoot_arrow' | 'shoot_bolt' | 'shoot_catapult' | 'shoot_mage' | 'shoot_frost'
    | 'impact_hit' | 'explosion' | 'catapult_impact' | 'tower_destroy' | 'frost_impact'
    | 'enemy_death' | 'castle_hit' | 'wave_start' | 'victory' | 'defeat' | 'gold' | 'error'

const SFX_LIST: Sfx[] = [
    'ui_click', 'tower_place', 'shoot_arrow', 'shoot_bolt', 'shoot_catapult',
    'shoot_mage', 'shoot_frost', 'impact_hit', 'explosion', 'catapult_impact',
    'tower_destroy', 'frost_impact', 'enemy_death', 'castle_hit', 'wave_start',
    'victory', 'defeat', 'gold', 'error',
]

// Musiques de fond optionnelles (à déposer plus tard dans public/sounds/). Si
// le fichier n'existe pas, on ignore silencieusement — aucun crash.
const MUSIC = {
    menu: '/sounds/music_menu.mp3',
    game: '/sounds/music_game.mp3',
} as const
export type MusicKey = keyof typeof MUSIC

const LS_KEY = 'kcd_audio'

// Gains de base des bus (mix de référence = 100 % pour l'utilisateur). Le réglage
// utilisateur (0..1) multiplie ces bases.
const SFX_BASE = 0.11
const MUSIC_BASE = 0.8

type Prefs = { volume: number; muted: boolean; sfx: number; music: number }
function loadPrefs(): Prefs {
    const def: Prefs = { volume: 0.7, muted: false, sfx: 1, music: 1 }
    if (typeof window === 'undefined') return def
    try {
        const raw = localStorage.getItem(LS_KEY)
        if (raw) return { ...def, ...JSON.parse(raw) }
    } catch { /* ignore */ }
    return def
}

class AudioManager {
    private ctx: AudioContext | null = null
    private master: GainNode | null = null
    private sfxBus: GainNode | null = null
    private musicBus: GainNode | null = null
    private buffers = new Map<string, AudioBuffer>()
    private prefs: Prefs = loadPrefs()
    private started = false
    private musicSrc: AudioBufferSourceNode | null = null
    private musicKey: MusicKey | null = null
    private listeners = new Set<() => void>()

    /** Crée le contexte et lance le chargement des SFX. Idempotent. Appelé au
     *  1er geste utilisateur (les navigateurs bloquent l'audio avant). */
    init() {
        if (this.started || typeof window === 'undefined') return
        this.started = true
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (!Ctx) return
        this.ctx = new Ctx()
        this.master = this.ctx.createGain()
        this.master.gain.value = this.prefs.muted ? 0 : this.prefs.volume
        this.master.connect(this.ctx.destination)
        // Deux bus séparés sous le maître : les SFX sont mixés PLUS BAS que la
        // musique (sinon ils la couvrent). Ajuste SFX_BUS / MUSIC_BUS pour le mix.
        this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = SFX_BASE * this.prefs.sfx
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = MUSIC_BASE * this.prefs.music
        this.sfxBus.connect(this.master)
        this.musicBus.connect(this.master)
        SFX_LIST.forEach((n) => this.fetchBuffer(`/sounds/${n}.mp3`, n))
    }

    /** Reprend le contexte s'il est suspendu (après un geste). */
    resume() {
        this.init()
        if (this.ctx?.state === 'suspended') this.ctx.resume().catch(() => {})
    }

    private async fetchBuffer(url: string, key: string): Promise<AudioBuffer | null> {
        if (!this.ctx) return null
        if (this.buffers.has(key)) return this.buffers.get(key)!
        try {
            const res = await fetch(url)
            if (!res.ok) return null
            const arr = await res.arrayBuffer()
            const buf = await this.ctx.decodeAudioData(arr)
            this.buffers.set(key, buf)
            return buf
        } catch {
            return null // fichier absent (ex. musique non fournie) → silencieux
        }
    }

    /** Joue un bruitage (chevauchement autorisé). `volume` relatif 0..1,
     *  `rate` = pitch/vitesse (1 = normal). */
    play(name: Sfx, opts: { volume?: number; rate?: number } = {}) {
        if (!this.ctx || !this.sfxBus || this.prefs.muted) return
        const buf = this.buffers.get(name)
        if (!buf) return
        const src = this.ctx.createBufferSource()
        src.buffer = buf
        src.playbackRate.value = opts.rate ?? 1
        const g = this.ctx.createGain()
        g.gain.value = opts.volume ?? 1
        src.connect(g).connect(this.sfxBus)
        src.start()
    }

    /** Lance une musique en boucle (coupe la précédente). No-op si le fichier
     *  n'est pas fourni. */
    async music(key: MusicKey | null) {
        this.resume()
        if (this.musicKey === key) return
        this.musicKey = key
        if (this.musicSrc) { try { this.musicSrc.stop() } catch { /* */ } this.musicSrc = null }
        if (!key || !this.ctx || !this.musicBus) return
        const buf = await this.fetchBuffer(MUSIC[key], `music_${key}`)
        if (!buf || this.musicKey !== key) return
        const src = this.ctx.createBufferSource()
        src.buffer = buf; src.loop = true
        src.connect(this.musicBus)
        src.start()
        this.musicSrc = src
    }

    getVolume() { return this.prefs.volume }
    isMuted() { return this.prefs.muted }
    setVolume(v: number) {
        this.prefs.volume = Math.max(0, Math.min(1, v))
        if (this.master && !this.prefs.muted) this.master.gain.value = this.prefs.volume
        this.persist()
    }
    setMuted(m: boolean) {
        this.prefs.muted = m
        if (this.master) this.master.gain.value = m ? 0 : this.prefs.volume
        this.persist()
    }
    toggleMute() { this.setMuted(!this.prefs.muted) }

    // Réglages par canal (0..1) — multiplient le gain de base du bus. Persistés.
    getSfx() { return this.prefs.sfx }
    getMusic() { return this.prefs.music }
    setSfxVolume(v: number) {
        this.prefs.sfx = Math.max(0, Math.min(1, v))
        if (this.sfxBus) this.sfxBus.gain.value = SFX_BASE * this.prefs.sfx
        this.persist()
    }
    setMusicVolume(v: number) {
        this.prefs.music = Math.max(0, Math.min(1, v))
        if (this.musicBus) this.musicBus.gain.value = MUSIC_BASE * this.prefs.music
        this.persist()
    }

    subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
    private persist() {
        if (typeof window !== 'undefined')
            try { localStorage.setItem(LS_KEY, JSON.stringify(this.prefs)) } catch { /* */ }
        this.listeners.forEach((f) => f())
    }
}

export const audio = new AudioManager()
