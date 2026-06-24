'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useGame } from '@/hooks/useGame'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { TowerData } from '@/components/game/GameScene'

const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
    ssr: false,
    loading: () => (
        <div className="w-[800px] h-[600px] bg-slate-900 flex items-center justify-center">
            <p className="text-slate-400">Chargement du jeu...</p>
        </div>
    ),
})

type TowerType = 'ARCHER' | 'MAGE' | 'CATAPULT'

const TOWER_INFO: Record<TowerType, { label: string; cost: number; color: string }> = {
    ARCHER:   { label: 'Archer',    cost: 50,  color: 'bg-green-600' },
    MAGE:     { label: 'Mage',      cost: 100, color: 'bg-purple-600' },
    CATAPULT: { label: 'Catapulte', cost: 150, color: 'bg-orange-600' },
}

export default function GamePage() {
    const router = useRouter()
    const { player, isAuthenticated } = useAuthStore()
    const { handleLogout } = useAuth()
    const { gameId, map, waveNumber, gold, createGame, placeTower, startWave } = useGame()

    const [selectedTower, setSelectedTower] = useState<TowerType>('ARCHER')
    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    useEffect(() => {
        if (!isAuthenticated) router.push('/')
    }, [isAuthenticated, router])

    useEffect(() => {
        if (isAuthenticated && !gameId) {
            createGame().catch(() => setMessage('Erreur lors de la création de la partie'))
        }
    }, [isAuthenticated, gameId])

    async function handleCellClick(x: number, y: number) {
        try {
            await placeTower(selectedTower, x, y)
            setMessage(`Tour ${selectedTower} placée en (${x}, ${y})`)
        } catch {
            setMessage('Impossible de placer la tour ici')
        }
    }

    async function handleStartWave() {
        try {
            setLoading(true)
            const data = await startWave()
            setMessage(`Vague ${data.number} lancée — ${data.enemyCount} ennemis !`)
        } catch {
            setMessage('Erreur lors du lancement de la vague')
        } finally {
            setLoading(false)
        }
    }

    const towers: TowerData[] = map?.towers ?? []

    if (loading && !gameId) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <p className="text-white text-xl">Création de la partie...</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-900 text-white p-4">
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-bold">KCD Formes v2</h1>
                <div className="flex items-center gap-4">
                    <span className="text-yellow-400 font-bold">⚔ Vague {waveNumber}</span>
                    <span className="text-yellow-300 font-bold">💰 {gold} or</span>
                    <span className="text-slate-400">{player?.username}</span>
                    <Button variant="outline" size="sm" onClick={handleLogout}>
                        Déconnexion
                    </Button>
                </div>
            </div>

            <div className="flex gap-4">
                <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <GameCanvas towers={towers} onCellClick={handleCellClick} />
                </div>

                <div className="flex flex-col gap-4 w-48">
                    <Card className="bg-slate-800 border-slate-700">
                        <CardContent className="p-4">
                            <h3 className="text-sm font-semibold mb-3 text-slate-300">Tours</h3>
                            <div className="flex flex-col gap-2">
                                {(Object.entries(TOWER_INFO) as [TowerType, typeof TOWER_INFO[TowerType]][]).map(
                                    ([type, info]) => (
                                        <button
                                            key={type}
                                            onClick={() => setSelectedTower(type)}
                                            className={`p-2 rounded text-sm font-medium transition-all ${
                                                selectedTower === type
                                                    ? `${info.color} text-white ring-2 ring-white`
                                                    : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                            }`}
                                        >
                                            {info.label}
                                            <span className="block text-xs opacity-75">{info.cost} or</span>
                                        </button>
                                    )
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Button
                        onClick={handleStartWave}
                        disabled={loading}
                        className="bg-red-600 hover:bg-red-500 text-white"
                    >
                        ⚔ Lancer vague
                    </Button>

                    {message && (
                        <Card className="bg-slate-800 border-slate-700">
                            <CardContent className="p-3">
                                <p className="text-xs text-slate-300">{message}</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}