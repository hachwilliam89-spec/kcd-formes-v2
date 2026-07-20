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
import { CORRIDOR_MIN_Y, CORRIDOR_MAX_Y } from '@/components/game/constants'
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

type TowerType = 'ARCHER' | 'MAGE' | 'CATAPULT' | 'BALLISTA' | 'WALL'

const TOWER_INFO: Record<TowerType, { label: string; cost: number; color: string; unlockWave: number }> = {
    ARCHER:   { label: 'Archer',    cost: 50,  color: 'bg-green-600',  unlockWave: 0 },
    MAGE:     { label: 'Mage',      cost: 100, color: 'bg-purple-600', unlockWave: 0 },
    CATAPULT: { label: 'Catapulte', cost: 150, color: 'bg-orange-600', unlockWave: 0 },
    // Débloquée par la progression de compte (meilleure vague atteinte), pas par l'or.
    BALLISTA: { label: 'Baliste',   cost: 200, color: 'bg-slate-400',  unlockWave: 10 },
    // Mur-barrage : seule structure posable SUR le couloir (règle inverse des
    // tours, voir handleCellClick) — bloque les ennemis qui doivent le casser.
    WALL:     { label: 'Mur',       cost: 35,  color: 'bg-stone-500',  unlockWave: 6 },
}

// Modes de ciblage (voir backend TargetingMode) : libellés courts + explication.
const TARGETING_MODES: { mode: 'CLOSEST' | 'FIRST' | 'STRONGEST'; label: string; hint: string }[] = [
    { mode: 'CLOSEST', label: 'Le plus proche', hint: "Vise l'ennemi le plus près de la tour (défaut)" },
    { mode: 'FIRST', label: 'Le plus avancé', hint: "Vise celui le plus près du château — stoppe les fuyards" },
    { mode: 'STRONGEST', label: 'Le plus solide', hint: "Vise le plus de PV — concentre le feu sur les élites" },
]

export default function GamePage() {
    const router = useRouter()
    const { player, isAuthenticated, hasHydrated: authHydrated } = useAuthStore()
    const { handleLogout } = useAuth()
    const {
        gameId, map, waveNumber, gold, castleHp, castleMaxHp, status,
        awaitingBonusChoice, availableBonuses, hasHydrated: gameHydrated,
        createGame, placeTower, upgradeTower, setTargetingMode, startWave, chooseBonus, refreshGame, resumeGame, newGame,
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
    // Tour sélectionnée (clic) : ouvre la carte d'info (amélioration + ciblage).
    const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null)
    const [leaderboard, setLeaderboard] = useState<{
        top: { rank: number; username: string; bestWave: number }[]
        me: { rank: number; username: string; bestWave: number } | null
    } | null>(null)

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
        // Classement rafraîchi aux mêmes moments que le bestWave (montage + fin
        // de vague) : c'est précisément quand le rang peut avoir changé.
        try {
            const { data } = await api.get('/api/v1/leaderboard?limit=5')
            setLeaderboard(data)
        } catch {
            // best-effort également : sans réponse, la carte affiche l'état précédent.
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

        // Cliquer sur une tour existante la SÉLECTIONNE (carte d'info : amélioration
        // + mode de ciblage) au lieu de l'améliorer directement — un clic ne doit
        // plus dépenser de l'or par surprise. Un mur n'a ni amélioration utile ni
        // ciblage : cliquer dessus ne sélectionne rien.
        const existingTower = (map?.towers ?? []).find((t) => t.x === x && t.y === y)
        if (existingTower) {
            setSelectedTowerId(existingTower.type === 'WALL' ? null : existingTower.id)
            return
        }

        // Règle du couloir, INVERSÉE selon le type (le backend reste l'arbitre
        // final) : le mur-barrage se pose uniquement SUR le couloir des ennemis,
        // les tours uniquement en dehors. Filtré ici pour un retour immédiat au
        // lieu d'un aller-retour réseau voué au rejet.
        const inCorridor = y >= CORRIDOR_MIN_Y && y <= CORRIDOR_MAX_Y
        if (selectedTower === 'WALL' && !inCorridor) {
            setMessage('Le mur se pose sur le couloir des ennemis (pour leur barrer la route)')
            return
        }
        // 6 = PlaceTowerService.MAX_WALLS côté backend (anti-donjon : paver le
        // couloir de murs entassait toute la vague sous le feu de la défense
        // entière, victoire garantie). Le backend rejette de toute façon.
        if (selectedTower === 'WALL' &&
            (map?.towers ?? []).filter((t) => t.type === 'WALL').length >= 6) {
            setMessage('Limite de 6 murs atteinte — le mur est un point de blocage, pas une forteresse')
            return
        }
        if (selectedTower !== 'WALL' && inCorridor) {
            setMessage('Impossible de construire une tour sur le couloir des ennemis')
            return
        }

        const cost = TOWER_INFO[selectedTower].cost
        try {
            await placeTower(selectedTower, x, y, cost)
            setMessage(`${TOWER_INFO[selectedTower].label} placé(e) en (${x}, ${y})`)
        } catch {
            setMessage('Impossible de placer ici (or insuffisant ou case invalide)')
        }
    }

    async function handleUpgradeSelected(tower: TowerData) {
        const cost = TOWER_INFO[tower.type].cost * tower.level
        try {
            await upgradeTower(tower.id, cost)
            setMessage(`${TOWER_INFO[tower.type].label} améliorée au niveau ${tower.level + 1} (-${cost} or)`)
        } catch {
            setMessage("Impossible d'améliorer cette tour (or insuffisant)")
        }
    }

    async function handleSetTargeting(towerId: string, mode: string) {
        try {
            await setTargetingMode(towerId, mode)
        } catch {
            setMessage('Impossible de changer le mode de ciblage')
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
    // Tour sélectionnée (objet) : recalculée depuis la map à chaque rendu (le
    // store est la source de vérité) — null si sa case a été libérée (détruite
    // en combat). Distinct de `selectedTower` (state du TYPE à poser).
    const selectedTowerObj = selectedTowerId
        ? towers.find((t) => t.id === selectedTowerId) ?? null
        : null
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
                    {/* Carte de la tour sélectionnée (clic) : remontée en TÊTE du
                        panneau pour être associée sans ambiguïté à la tour cliquée.
                        Chaque mode est décrit en toutes lettres (le libellé seul
                        est muet), avec le mode actif surligné. Cachée en combat et
                        pour les murs (non sélectionnables). */}
                    {selectedTowerObj && !combatRunning && !isGameOver && (
                        <Card className="bg-slate-800 border-blue-500">
                            <CardContent className="p-4 flex flex-col gap-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-semibold text-white">
                                        {TOWER_INFO[selectedTowerObj.type].label} · niveau {selectedTowerObj.level}
                                    </span>
                                    <button
                                        onClick={() => setSelectedTowerId(null)}
                                        className="text-slate-400 hover:text-white"
                                    >
                                        ✕
                                    </button>
                                </div>

                                <Button
                                    size="sm"
                                    onClick={() => handleUpgradeSelected(selectedTowerObj)}
                                    className="bg-emerald-700 hover:bg-emerald-600 text-white"
                                >
                                    ⬆ Améliorer (-{TOWER_INFO[selectedTowerObj.type].cost * selectedTowerObj.level} or)
                                </Button>

                                <div>
                                    <p className="text-xs font-semibold text-slate-300">Priorité de tir</p>
                                    <p className="text-[11px] text-slate-500 mb-2">
                                        Sur quel ennemi cette tour vise en premier.
                                    </p>
                                    <div className="flex flex-col gap-1">
                                        {TARGETING_MODES.map((m) => {
                                            const active = (selectedTowerObj.targetingMode ?? 'CLOSEST') === m.mode
                                            return (
                                                <button
                                                    key={m.mode}
                                                    onClick={() => handleSetTargeting(selectedTowerObj.id, m.mode)}
                                                    className={`text-left p-2 rounded transition-all ${
                                                        active
                                                            ? 'bg-blue-600 text-white ring-1 ring-white'
                                                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                                    }`}
                                                >
                                                    <span className="block text-xs font-semibold">
                                                        {active ? '✓ ' : ''}{m.label}
                                                    </span>
                                                    <span className="block text-[11px] opacity-80">{m.hint}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                    {selectedTowerObj.type === 'BALLISTA' && (
                                        <p className="text-[11px] text-amber-400/90 mt-2">
                                            ⚔ La Baliste vise toujours les grosses cibles (Troll, Chariot, Chevalier, Boss) en priorité — le réglage ci-dessus départage seulement quand plusieurs sont à portée.
                                        </p>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

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

                    {/* Toujours disponible (hors combat) : abandonner et repartir sur
                        une partie neuve — auparavant possible uniquement après une
                        défaite, impossible de relancer une partie mal engagée. */}
                    {!isGameOver && (
                        <Button
                            size="sm"
                            onClick={() => {
                                if (window.confirm('Abandonner cette partie et en commencer une nouvelle ?')) {
                                    setIsGameOver(false)
                                    setMessage(null)
                                    newGame()
                                }
                            }}
                            disabled={combatRunning || loading}
                            className="bg-slate-700 hover:bg-slate-600 text-slate-200 disabled:opacity-40"
                        >
                            ↻ Nouvelle partie
                        </Button>
                    )}

                    {isGameOver && (
                        <Card className="bg-red-950 border-red-800">
                            <CardContent className="p-3 flex flex-col gap-2">
                                <p className="text-sm font-semibold text-red-300">💀 Château détruit</p>
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        // newGame plutôt que resetGame : on reste sur la page de jeu
                                        // (l'effet de création relance aussitôt une partie) au lieu
                                        // d'être renvoyé à l'écran d'accueil.
                                        setIsGameOver(false)
                                        setMessage(null)
                                        newGame()
                                    }}
                                    className="bg-slate-700 hover:bg-slate-600"
                                >
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

                    {/* Classement par meilleure vague (voir backend LeaderboardService).
                        La ligne "toi" n'est ajoutée que si le joueur est hors du top
                        affiché — sinon sa ligne du top est simplement surlignée. */}
                    {leaderboard && leaderboard.top.length > 0 && (
                        <Card className="bg-slate-800 border-slate-700">
                            <CardContent className="p-3 flex flex-col gap-1">
                                <p className="text-sm font-semibold text-yellow-400 mb-1">🏆 Classement</p>
                                {leaderboard.top.map((entry) => (
                                    <p
                                        key={entry.rank + entry.username}
                                        className={`text-xs flex justify-between ${
                                            entry.username === player?.username
                                                ? 'text-yellow-300 font-semibold'
                                                : 'text-slate-300'
                                        }`}
                                    >
                                        <span>#{entry.rank} {entry.username}</span>
                                        <span>vague {entry.bestWave}</span>
                                    </p>
                                ))}
                                {leaderboard.me &&
                                    !leaderboard.top.some((e) => e.username === leaderboard.me!.username) && (
                                    <p className="text-xs flex justify-between text-yellow-300 font-semibold border-t border-slate-700 pt-1 mt-1">
                                        <span>#{leaderboard.me.rank} {leaderboard.me.username}</span>
                                        <span>vague {leaderboard.me.bestWave}</span>
                                    </p>
                                )}
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
