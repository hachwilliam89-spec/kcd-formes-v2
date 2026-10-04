'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { audio } from '@/lib/audio'

type Mode = 'login' | 'register'

// Durée du déroulé de l'étendard (même valeur que .ws-standard-body dans globals.css).
const UNFURL_MS = 450

// Extrait un message lisible depuis une erreur axios (le backend renvoie
// { error: "..." }) et traduit les cas connus en français.
function readError(err: unknown): string {
    const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string; code?: string }
    if (e?.code === 'ERR_NETWORK') return 'Serveur injoignable : réessaie dans un instant.'
    const raw = e?.response?.data?.error
    if (raw) {
        if (/already taken/i.test(raw)) return 'Ce nom d’utilisateur est déjà pris — choisis-en un autre.'
        if (/password/i.test(raw)) return 'Mot de passe invalide (8 caractères minimum).'
        if (/email/i.test(raw)) return 'Adresse email invalide.'
        if (/username/i.test(raw)) return 'Nom d’utilisateur invalide (3 caractères minimum).'
        return raw
    }
    if (e?.response?.status === 401) return 'Identifiants incorrects.'
    return e?.message ?? 'Une erreur est survenue'
}

/**
 * Connexion / inscription sur un étendard : roulé, il ne montre que les deux
 * choix ; il se déroule sur le formulaire demandé. Changer de choix l'enroule
 * puis le déroule sur l'autre formulaire ; recliquer sur le choix déroulé valide.
 */
export default function AuthForm() {
    const { handleLogin, handleRegister } = useAuth()

    const [mode, setMode] = useState<Mode>('login')
    const [open, setOpen] = useState(false)
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)
    const timer = useRef<number | undefined>(undefined)
    const firstField = useRef<HTMLInputElement>(null)
    const form = useRef<HTMLFormElement>(null)

    // Musique du menu : démarrée au 1er geste de l'utilisateur (les navigateurs
    // bloquent l'audio avant une interaction). La page de jeu bascule ensuite sur
    // la musique de combat. No-op si le fichier n'est pas présent.
    useEffect(() => {
        audio.music('menu') // si le contexte est déjà débloqué (retour depuis le jeu)
        const start = () => { audio.resume(); audio.music('menu') } // 1er chargement : au 1er geste
        window.addEventListener('pointerdown', start, { once: true })
        return () => window.removeEventListener('pointerdown', start)
    }, [])

    useEffect(() => () => window.clearTimeout(timer.current), [])

    // Une fois déroulé, le curseur va dans le premier champ.
    useEffect(() => {
        if (!open) return
        const t = window.setTimeout(() => firstField.current?.focus(), UNFURL_MS)
        return () => window.clearTimeout(t)
    }, [open, mode])

    function choose(next: Mode) {
        audio.play('ui_click', { volume: 0.5 })
        // Déjà déroulé sur ce choix : le bouton valide le formulaire.
        if (open && next === mode) { form.current?.requestSubmit(); return }
        window.clearTimeout(timer.current)
        setError(null)
        if (!open) { setMode(next); setOpen(true); return }
        setOpen(false)
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        timer.current = window.setTimeout(() => { setMode(next); setOpen(true) }, reduced ? 0 : UNFURL_MS)
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            if (mode === 'login') {
                await handleLogin(username, password)
            } else {
                await handleRegister(username, email, password)
            }
        } catch (err: unknown) {
            setError(readError(err))
        } finally {
            setLoading(false)
        }
    }

    const choice = (m: Mode, label: string) => (
        <button
            type="button"
            onClick={() => choose(m)}
            aria-expanded={open && mode === m}
            aria-controls="auth-form"
            disabled={loading}
            className={`kcd-btn ${(open ? mode === m : m === 'login') ? 'kcd-btn--primary' : ''} ws-standard-choice ${open && mode === m ? 'is-active' : ''}`}
        >
            {label}
        </button>
    )

    return (
        <div className={`ws-standard font-pixel ${open ? 'is-open' : ''}`}>
            <div className="ws-standard-pole" aria-hidden="true" />
            <div className="ws-standard-cloth">
                <div className="ws-standard-choices">
                    {choice('login', 'Se connecter')}
                    {choice('register', 'S’inscrire')}
                </div>

                <div className="ws-standard-body">
                    <form ref={form} id="auth-form" onSubmit={handleSubmit} inert={!open} className="ws-standard-form">
                        <div>
                            <label htmlFor="username" className="ws-standard-label">Nom d&apos;utilisateur</label>
                            <input
                                ref={firstField}
                                id="username"
                                autoComplete="username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="kim"
                                required
                                minLength={mode === 'register' ? 3 : undefined}
                                className="war-input w-full"
                            />
                            {mode === 'register' && <p className="ws-standard-hint">3 caractères min., unique.</p>}
                        </div>

                        {mode === 'register' && (
                            <div>
                                <label htmlFor="email" className="ws-standard-label">Email</label>
                                <input
                                    id="email"
                                    autoComplete="email"
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="joueur@exemple.fr"
                                    required
                                    className="war-input w-full"
                                />
                                <p className="ws-standard-hint">Non vérifié pour l&apos;instant : un email fictif au bon format suffit.</p>
                            </div>
                        )}

                        <div>
                            <label htmlFor="password" className="ws-standard-label">Mot de passe</label>
                            <input
                                id="password"
                                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                                minLength={mode === 'register' ? 8 : undefined}
                                className="war-input w-full"
                            />
                            {mode === 'register' && <p className="ws-standard-hint">8 caractères minimum.</p>}
                        </div>

                        {error && <p role="alert" className="ws-standard-error">{error}</p>}

                        <button type="submit" disabled={loading} className="kcd-btn kcd-btn--primary ws-standard-submit">
                            {loading ? 'Chargement…' : mode === 'login' ? 'Entrer dans le royaume' : 'Créer mon compte'}
                        </button>
                    </form>
                </div>
            </div>
            <div className="ws-standard-tail" aria-hidden="true" />
        </div>
    )
}
