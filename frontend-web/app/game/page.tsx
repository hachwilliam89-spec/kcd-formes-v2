'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useGame } from '@/hooks/useGame'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { TowerData } from '@/components/game/GameScene'
import type { GameCanvasHandle } from '@/components/game/GameCanvas'
import api from '@/lib/api'

const GameCanvas = dynamic(() => import('@/components/game/GameCanvas'), {
    ssr: false,
    loading: () => (
        <div className="w-[800px] h-[600px] bg-slate-900 flex items-center justify-center">
            <p className="text-slate-400">Chargement du jeu...</p>
        </div>
    ),
})

type TowerType = 'ARCHER' | 'MAGE' | 'CATAPULT' | 'BALLISTA'

const TOWER_INFO: Record<TowerType, { label: string; cost: number; color: string; unlockWave: number }> = {
    ARCHER:   { label: 'Archer',    cost: 50,  color: 'bg-green-600',  unlockWave: 0 },
    MAGE:     { label: 'Mage',      cost: 100, color: 'bg-purple-600', unlockWave: 0 },
    CATAPULT: { label: 'Catapulte', cost: 150, color: 'bg-orange-600', unlockWave: 0 },
    // Débloquée par la progression de compte (meilleure vague atteinte), pas par l'or.
    BALLISTA: { label: 'Baliste',   cost: 200, color: 'bg-slate-400',  unlockWave: 10 },
}

export default function GamePage() {
    const router = useRouter()
    const { player, isAuthenticated } = useAuthStore()
    const { handleLogout } = useAuth()
    const {
        gameId, map, waveNumber, gold, castleHp, castleMaxHp, status,
        createGame, placeTower, startWave, resetGame,
    } = useGame()

    const canvasRef = useRef<GameCanvasHandle>(null)

    const [selectedTower, setSelectedTower] = useState<TowerType>('ARCHER')
    const [loading, setLoading] = useState(false)
    const [combatRunning, setCombatRunning] = useState(false)
    const [liveCastleHp, setLiveCastleHp] = useState(castleHp)
    const [message, setMessage] = useState<string | null>(null)
    const [bestWave, setBestWave] = useState(0)

    const isGameOver = status === 'DEFEAT'

    useEffect(() => {
        if (!isAuthenticated) router.push('/')
    }, [isAuthenticated, router])

    useEffect(() => {
        if (!isAuthenticated) return
        api.get('/api/v1/players/me')
            .then(({ data }) => setBestWave(data.bestWave))
            .catch(() => {})
    }, [isAuthenticated])

    useEffect(() => {
        if (isAuthenticated && !gameId) {
            createGame().catch(() => setMessage('Erreur lors de la création de la partie'))
        }
    }, [isAuthenticated, gameId])

    useEffect(() => {
        setLiveCastleHp(castleHp)
    }, [castleHp])

    async function handleCellClick(x: number, y: number) {
        if (isGameOver || combatRunning) return
        const cost = TOWER_INFO[selectedTower].cost
        try {
            await placeTower(selectedTower, x, y, cost)
            setMessage(`Tour ${TOWER_INFO[selectedTower].label} placée en (${x}, ${y})`)
        } catch {
            setMessage('Impossible de placer la tour ici (or insuffisant ou chemin bloqué)')
        }
    }

    async function handleStartWave() {
        try {
            setLoading(true)
            setCombatRunning(true)
            const data = await startWave()
            setMessage(`Vague ${data.number} en cours...`)

            canvasRef.current?.playWave(
                data.ticks,
                (tickCastleHp: number) => setLiveCastleHp(tickCastleHp),
                () => {
                    setCombatRunning(false)
                    setLoading(false)
                    if (data.gameStatus === 'DEFEAT') {
                        setMessage(`Le château est tombé à la vague ${data.number}. Partie terminée.`)
                    } else if (data.status === 'VICTORY') {
                        setMessage(`Vague ${data.number} repoussée — +${data.goldEarned} or !`)
                    } else {
                        setMessage(`Vague ${data.number} : des ennemis ont atteint le château (-${data.castleDamageTaken} PV). +${data.goldEarned} or.`)
                    }
                }
            )
        } catch {
            setMessage('Erreur lors du lancement de la vague')
            setCombatRunning(false)
            setLoading(false)
        }
    }

    const towers: TowerData[] = map?.towers ?? []
    const hpRatio = castleMaxHp > 0 ? Math.max(0, Math.min(1, liveCastleHp / castleMaxHp)) : 0

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
                    <div className="flex items-center gap-2">
                        <span className="text-red-400 text-sm">🏰</span>
                        <div className="w-28 h-3 bg-slate-700 rounded overflow-hidden">
                            <div
                                className={`h-full transition-all ${hpRatio > 0.3 ? 'bg-green-500' : 'bg-red-500'}`}
                                style={{ width: `${hpRatio * 100}%` }}
                            />
                        </div>
                        <span className="text-xs text-slate-400">{liveCastleHp}/{castleMaxHp}</span>
                    </div>
                    <span className="text-slate-400">{player?.username}</span>
                    <Button variant="outline" size="sm" onClick={handleLogout}>
                        Déconnexion
                    </Button>
                </div>
            </div>

            <div className="flex gap-4">
                <div className="border border-slate-700 rounded-lg overflow-hidden">
                    <GameCanvas ref={canvasRef} towers={towers} onCellClick={handleCellClick} />
                </div>

                <div className="flex flex-col gap-4 w-48">
                    <Card className="bg-slate-800 border-slate-700">
                        <CardContent className="p-4">
                            <h3 className="text-sm font-semibold mb-3 text-slate-300">Tours</h3>
                            <div className="flex flex-col gap-2">
                                {(Object.entries(TOWER_INFO) as [TowerType, typeof TOWER_INFO[TowerType]][]).map(
                                    ([type, info]) => {
                                        const locked = bestWave < info.unlockWave
                                        return (
                                            <button
                                                key={type}
                                                onClick={() => !locked && setSelectedTower(type)}
                                                disabled={isGameOver || combatRunning || locked}
                                                className={`p-2 rounded text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                                                    selectedTower === type
                                                        ? `${info.color} text-white ring-2 ring-white`
                                                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                                }`}
                                            >
                                                {locked ? `🔒 ${info.label}` : info.label}
                                                <span className="block text-xs opacity-75">
                                                    {locked ? `Vague ${info.unlockWave} requise` : `${info.cost} or`}
                                                </span>
                                            </button>
                                        )
                                    }
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Button
                        onClick={handleStartWave}
                        disabled={loading || isGameOver || combatRunning}
                        className="bg-red-600 hover:bg-red-500 text-white disabled:opacity-40"
                    >
                        ⚔ Lancer vague
                    </Button>

                    {isGameOver && (
                        <Card className="bg-red-950 border-red-800">
                            <CardContent className="p-3 flex flex-col gap-2">
                                <p className="text-sm font-semibold text-red-300">💀 Château détruit</p>
                                <Button size="sm" onClick={resetGame} className="bg-slate-700 hover:bg-slate-600">
                                    Nouvelle partie
                                </Button>
                            </CardContent>
                        </Card>
                    )}

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
