'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { login, register } from '@/lib/auth'
import { useAuthStore } from '@/store/authStore'

type Mode = 'login' | 'register'

export default function AuthForm() {
    const router = useRouter()
    const { setAuth } = useAuthStore()

    const [mode, setMode] = useState<Mode>('login')
    const [username, setUsername] = useState('')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        setError(null)
        setLoading(true)

        try {
            const data =
                mode === 'login'
                    ? await login(username, password)
                    : await register(username, email, password)

            setAuth(data.token, {
                playerId: data.playerId,
                username: data.username,
            })

            router.push('/game')
        } catch (err: unknown) {
            const message =
                err instanceof Error ? err.message : 'Une erreur est survenue'
            setError(message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader>
                <CardTitle className="text-2xl text-center">
                    {mode === 'login' ? 'Connexion' : 'Inscription'}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="username">Nom d&apos;utilisateur</Label>
                        <Input
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="kim"
                            required
                        />
                    </div>

                    {mode === 'register' && (
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="kim@kcdformes.com"
                                required
                            />
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label htmlFor="password">Mot de passe</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && (
                        <p className="text-sm text-red-500">{error}</p>
                    )}

                    <Button type="submit" className="w-full" disabled={loading}>
                        {loading
                            ? 'Chargement...'
                            : mode === 'login'
                                ? 'Se connecter'
                                : "S'inscrire"}
                    </Button>

                    <p className="text-sm text-center text-muted-foreground">
                        {mode === 'login' ? (
                            <>
                                Pas de compte ?{' '}
                                <button
                                    type="button"
                                    className="underline"
                                    onClick={() => setMode('register')}
                                >
                                    S&apos;inscrire
                                </button>
                            </>
                        ) : (
                            <>
                                Déjà un compte ?{' '}
                                <button
                                    type="button"
                                    className="underline"
                                    onClick={() => setMode('login')}
                                >
                                    Se connecter
                                </button>
                            </>
                        )}
                    </p>
                </form>
            </CardContent>
        </Card>
    )
}