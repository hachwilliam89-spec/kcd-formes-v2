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
    const { player, isAuthenticated, hasHydrated: authHydrated } = useAuthStore()
    const { handleLogout } = useAuth()
    const {
        gameId, map, waveNumber, gold, castleHp, castleMaxHp, status,
        awaitingBonusChoice, availableBonuses, hasHydrated: gameHydrated,
        createGame, placeTower, upgradeTower, startWave, chooseBonus, refreshGame, resumeGame, resetGame,
    } = useGame()

    const canvasRef = useRef<GameCanvasHandle>(null)

    const [selectedTower, setSelectedTower] = useState<TowerType>('ARCHER')
    const [loading, setLoading] = useState(false)
    const [combatRunning, setCombatRunning] = useState(false)
    const [liveCastleHp, setLiveCastleHp] = useState(castleHp)
    const [message, setMessage] = useState<string | null>(null)
    const [bestWave, setBestWave] = useState(0)
    const [isGameOver, setIsGameOver] = useState(false)
    const [bonusChoiceLoading, setBonusChoiceLoading] = useState(false)

    // Redirection vers la connexion : UNIQUEMENT une fois le store relu depuis
    // localStorage (authHydrated). La réhydratation de persist est asynchrone —
    // au premier rendu après un F5, isAuthenticated est encore à sa valeur
    // initiale (false) même pour un utilisateur connecté : rediriger à ce
    // moment-là éjectait systématiquement vers l'écran de connexion à chaque
    // rechargement de page.
    useEffect(() => {
        if (authHydrated && !isAuthenticated) router.push('/')
    }, [authHydrated, isAuthenticated, router])

    // Reprise de la partie persistée après un rechargement : seul gameId survit
    // (voir gameStore.partialize), l'état complet est refetché ici. Couvre aussi
    // la reprise d'une partie déjà perdue (bandeau + blocage immédiats, pas
    // d'animation à attendre). Ne dépend volontairement que du chargement de la
    // partie, pas de status/map à chaque mise à jour : sinon le bandeau
    // "Château détruit" apparaîtrait dès la réponse de l'API de la vague, avant
    // la fin de l'animation de combat (c'est finishWave qui gère ce cas-là).
    useEffect(() => {
        if (!isAuthenticated || !gameId) return
        if (status === 'DEFEAT') {
            setIsGameOver(true)
            return
        }
        if (!map) {
            resumeGame().then((data) => {
                if (data?.status === 'DEFEAT') setIsGameOver(true)
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, gameId])

    async function refreshBestWave() {
        try {
            const { data } = await api.get('/api/v1/players/me')
            setBestWave(data.bestWave)
        } catch {
            // best-effort : un échec ne doit pas bloquer le jeu, juste retarder l'affichage du déblocage.
        }
    }

    useEffect(() => {
        if (!isAuthenticated) return
        refreshBestWave()
    }, [isAuthenticated])

    // gameHydrated : sans cette garde, l'effet partait AVANT la relecture du
    // gameId persisté (réhydratation asynchrone) et créait une nouvelle partie
    // à chaque F5, orphelinant silencieusement la partie en cours.
    useEffect(() => {
        if (isAuthenticated && gameHydrated && !gameId) {
            createGame().catch(() => setMessage('Erreur lors de la création de la partie'))
        }
    }, [isAuthenticated, gameHydrated, gameId])

    useEffect(() => {
        setLiveCastleHp(castleHp)
    }, [castleHp])

    async function handleCellClick(x: number, y: number) {
        if (isGameOver || combatRunning) return

        // Cliquer sur une case déjà occupée améliore la tour en place plutôt que
        // d'essayer (en vain) d'en poser une nouvelle par-dessus — c'est ce qui
        // donne au joueur le choix permanent entre poser une tour neuve (faible)
        // ailleurs ou investir dans une tour existante pour la renforcer.
        const existingTower = (map?.towers ?? []).find((t) => t.x === x && t.y === y)
        if (existingTower) {
            const cost = TOWER_INFO[existingTower.type].cost * existingTower.level
            try {
                await upgradeTower(existingTower.id, cost)
                setMessage(`${TOWER_INFO[existingTower.type].label} améliorée au niveau ${existingTower.level + 1} (-${cost} or)`)
            } catch {
                setMessage("Impossible d'améliorer cette tour (or insuffisant)")
            }
            return
        }

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

            // Clôture de vague : TOUJOURS exécutée, avec ou sans animation. La
            // vague est déjà entièrement résolue côté serveur — l'animation n'est
            // qu'un rejeu visuel. Si elle ne peut pas se jouer (canvas remonté à
            // chaud en dev, refs obsolètes...), on applique quand même le
            // résultat : sans ça, combatRunning restait verrouillé à true et
            // l'écran de défaite ne s'affichait jamais.
            const finishWave = () => {
                setCombatRunning(false)
                setLoading(false)
                refreshBestWave()
                // Un Sapeur peut avoir détruit une tour pendant la vague (case libérée
                // côté backend) : on recharge la map pour que l'affichage des tours et
                // de leurs PV reflète l'état réel après combat.
                refreshGame().catch(() => {
                    // best-effort : un échec n'empêche pas d'afficher le résultat de la vague.
                })
                if (data.gameStatus === 'DEFEAT') {
                    setIsGameOver(true)
                    setMessage(`Le château est tombé à la vague ${data.number}. Partie terminée.`)
                } else if (data.status === 'VICTORY') {
                    setMessage(`Vague ${data.number} repoussée — +${data.goldEarned} or !`)
                } else {
                    setMessage(`Vague ${data.number} : des ennemis ont atteint le château (-${data.castleDamageTaken} PV). +${data.goldEarned} or.`)
                }
            }

            if (canvasRef.current) {
                canvasRef.current.playWave(
                    data.ticks,
                    (tickCastleHp: number) => setLiveCastleHp(tickCastleHp),
                    finishWave
                )
            } else {
                finishWave()
            }
        } catch {
            setMessage('Erreur lors du lancement de la vague')
            setCombatRunning(false)
            setLoading(false)
        }
    }

    async function handleChooseBonus(bonusType: string) {
        try {
            setBonusChoiceLoading(true)
            await chooseBonus(bonusType)
            setMessage('Bonus appliqué — la prochaine vague peut être lancée.')
        } catch {
            setMessage("Erreur lors de l'application du bonus")
        } finally {
            setBonusChoiceLoading(false)
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
                        disabled={loading || isGameOver || combatRunning || awaitingBonusChoice}
                        className="bg-red-600 hover:bg-red-500 text-white disabled:opacity-40"
                    >
                        {awaitingBonusChoice ? '⚔ Choisissez un bonus' : '⚔ Lancer vague'}
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

            {/* Palier de bonus (toutes les 5 vagues) : bloque le jeu jusqu'à un choix
                du joueur parmi plusieurs options (voir backend BonusType).
                !combatRunning : la vague est entièrement résolue côté serveur dès la
                réponse HTTP, donc awaitingBonusChoice est vrai dès le DÉBUT de
                l'animation — sans ce garde, la modale s'affichait par-dessus le
                combat en cours, et choisir un bonus déclenchait le refetch de
                l'état de FIN de vague (voir useGame.chooseBonus) : les tours que
                les Sapeurs détruisaient plus tard dans l'animation semblaient
                "supprimées par le bonus". */}
            {awaitingBonusChoice && !isGameOver && !combatRunning && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
                    <Card className="bg-slate-800 border-slate-600 w-96">
                        <CardContent className="p-5 flex flex-col gap-3">
                            <h2 className="text-lg font-bold text-yellow-400">
                                🏆 Vague {waveNumber} repoussée — choisissez un bonus
                            </h2>
                            <p className="text-xs text-slate-400">
                                Un seul bonus par palier. Choisissez celui qui vous aide le plus en ce moment.
                            </p>
                            <div className="flex flex-col gap-2 mt-1">
                                {availableBonuses.map((bonus) => (
                                    <button
                                        key={bonus.type}
                                        onClick={() => handleChooseBonus(bonus.type)}
                                        disabled={bonusChoiceLoading}
                                        className="text-left p-3 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition-all"
                                    >
                                        <span className="block font-semibold text-sm text-white">{bonus.label}</span>
                                        <span className="block text-xs text-slate-300 mt-1">{bonus.description}</span>
                                    </button>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    )
}
