'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { audio } from '@/lib/audio'

type Mode = 'login' | 'register'

// Extrait un message lisible depuis une erreur axios (le backend renvoie
// { error: "..." }) et traduit les cas connus en français.
function readError(err: unknown): string {
    const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string }
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

export default function AuthForm() {
    const { handleLogin, handleRegister } = useAuth()

    const [mode, setMode] = useState<Mode>('login')
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    // Musique du menu : démarrée au 1er geste de l'utilisateur (les navigateurs
    // bloquent l'audio avant une interaction). La page de jeu bascule ensuite sur
    // la musique de combat. No-op si le fichier n'est pas présent.
    useEffect(() => {
        audio.music('menu') // si le contexte est déjà débloqué (retour depuis le jeu)
        const start = () => { audio.resume(); audio.music('menu') } // 1er chargement : au 1er geste
        window.addEventListener('pointerdown', start, { once: true })
        return () => window.removeEventListener('pointerdown', start)
    }, [])

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

    const tab = (m: Mode, label: string) => (
        <button
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 py-1.5 text-sm rounded transition-colors ${
                mode === m
                    ? 'bg-[#7a5a2c] text-[#f5e8c6]'
                    : 'bg-[#cdb987] text-[#5a441c] hover:bg-[#d8c79a]'
            }`}
        >
            {label}
        </button>
    )

    return (
        <div className="kcd-panel font-pixel w-[340px] max-w-[92vw]">
            <div className="flex gap-2 mb-4">
                {tab('login', 'Connexion')}
                {tab('register', 'Inscription')}
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div>
                    <label htmlFor="username" className="block text-xs text-[#6a5024] mb-1">
                        <i /> Nom d&apos;utilisateur
                    </label>
                    <input
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="kim"
                        required
                        minLength={mode === 'register' ? 3 : undefined}
                        className="w-full px-2.5 py-2 text-sm text-[#3a2a12] rounded border-[3px] border-[#b9975a] bg-[#fbf3dd] outline-none focus:border-[#7a5a2c]"
                    />
                    {mode === 'register' && (
                        <p className="text-[11px] text-[#8a6a2c] mt-1">3 caractères min., unique.</p>
                    )}
                </div>

                {mode === 'register' && (
                    <div>
                        <label htmlFor="email" className="block text-xs text-[#6a5024] mb-1">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="kim@kcdformes.com"
                            required
                            className="w-full px-2.5 py-2 text-sm text-[#3a2a12] rounded border-[3px] border-[#b9975a] bg-[#fbf3dd] outline-none focus:border-[#7a5a2c]"
                        />
                    </div>
                )}

                <div>
                    <label htmlFor="password" className="block text-xs text-[#6a5024] mb-1">Mot de passe</label>
                    <input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={mode === 'register' ? 8 : undefined}
                        className="w-full px-2.5 py-2 text-sm text-[#3a2a12] rounded border-[3px] border-[#b9975a] bg-[#fbf3dd] outline-none focus:border-[#7a5a2c]"
                    />
                    {mode === 'register' && (
                        <p className="text-[11px] text-[#8a6a2c] mt-1">8 caractères minimum.</p>
                    )}
                </div>

                {error && <p className="text-sm text-[#8a3d12]">{error}</p>}

                <button type="submit" disabled={loading} className="kcd-btn font-med text-lg py-2.5 mt-1 disabled:opacity-50">
                    {loading ? 'Chargement…' : mode === 'login' ? 'Jouer' : "S'inscrire"}
                </button>

                <p className="text-xs text-center text-[#6a5024]">
                    {mode === 'login' ? (
                        <>
                            Pas de compte ?{' '}
                            <button type="button" className="underline font-semibold" onClick={() => setMode('register')}>
                                Crée-en un
                            </button>
                        </>
                    ) : (
                        <>
                            Déjà un compte ?{' '}
                            <button type="button" className="underline font-semibold" onClick={() => setMode('login')}>
                                Connecte-toi
                            </button>
                        </>
                    )}
                </p>
            </form>
        </div>
    )
}
