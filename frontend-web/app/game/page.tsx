'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useGame } from '@/hooks/useGame'
import { useAuth } from '@/hooks/useAuth'
import type { TowerData } from '@/components/game/GameScene'
import { isCorridorCell } from '@/components/game/constants'
import type { GameCanvasHandle } from '@/components/game/GameCanvas'
import TutorialBubble from '@/components/game/TutorialBubble'
import AudioControls from '@/components/game/AudioControls'
import { audio } from '@/lib/audio'
import {
    ENEMY_TUTORIAL, TOWER_TUTORIAL, getSeenTutorials, markTutorialSeen, resetTutorial,
    type TutorialEntry,
} from '@/components/game/tutorial'
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
    // Classement affiché en modale (info non vitale) plutôt que dans le HUD.
    const [showLeaderboard, setShowLeaderboard] = useState(false)
    // Bulle de tuto en cours (null = aucune). enemy => la vague est en pause.
    const [tutorial, setTutorial] = useState<{ entry: TutorialEntry; kind: 'enemy' | 'tower' } | null>(null)

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

    // Bascule sur la musique de combat dès l'entrée dans le jeu (le contexte
    // audio est déjà débloqué par l'interaction de connexion) — sinon la musique
    // du menu continuait tant qu'on n'avait pas cliqué sur la page de jeu.
    useEffect(() => {
        audio.music('game')
    }, [])

    // Affiche la bulle de tuto pour ce type (ennemi/tour) si le compte ne l'a
    // pas encore vue. Renvoie true si une bulle a été ouverte (utile pour mettre
    // la vague en pause côté ennemis).
    function maybeShowTutorial(kind: 'enemy' | 'tower', type: string): boolean {
        const username = player?.username ?? ''
        const key = `${kind}:${type}`
        if (getSeenTutorials(username).has(key)) return false
        const entry = kind === 'enemy' ? ENEMY_TUTORIAL[type] : TOWER_TUTORIAL[type]
        if (!entry) return false
        markTutorialSeen(username, key)
        setTutorial({ entry, kind })
        return true
    }

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
        const inCorridor = isCorridorCell(x, y)
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
        const placedType = selectedTower
        try {
            await placeTower(selectedTower, x, y, cost)
            audio.play('tower_place')
            setMessage(`${TOWER_INFO[selectedTower].label} placé(e) en (${x}, ${y})`)
            maybeShowTutorial('tower', placedType)
        } catch {
            audio.play('error', { volume: 0.6 })
            setMessage('Impossible de placer ici (or insuffisant ou case invalide)')
        }
    }

    async function handleUpgradeSelected(tower: TowerData) {
        const level = tower.level ?? 1
        const cost = TOWER_INFO[tower.type].cost * level
        try {
            await upgradeTower(tower.id, cost)
            setMessage(`${TOWER_INFO[tower.type].label} améliorée au niveau ${level + 1} (-${cost} or)`)
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
            audio.resume()
            audio.play('wave_start')
            audio.music('game') // no-op tant que la musique n'est pas fournie
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
                    audio.music(null)
                    audio.play('defeat')
                    setIsGameOver(true)
                    setMessage(`Le château est tombé à la vague ${data.number}. Partie terminée.`)
                } else if (data.status === 'VICTORY') {
                    audio.play('victory')
                    setMessage(`Vague ${data.number} repoussée — +${data.goldEarned} or !`)
                } else {
                    setMessage(`Vague ${data.number} : des ennemis ont atteint le château (-${data.castleDamageTaken} PV). +${data.goldEarned} or.`)
                }
            }

            if (canvasRef.current) {
                // Tuto ennemis : la scène met la vague en pause à la 1re apparition
                // d'un type non encore vu et appelle onNeedTutorial → bulle. La
                // reprise se fait au clic « Compris » (voir rendu de TutorialBubble).
                const seen = getSeenTutorials(player?.username ?? '')
                const unseenEnemyTypes = new Set(
                    Object.keys(ENEMY_TUTORIAL).filter((t) => !seen.has(`enemy:${t}`)),
                )
                canvasRef.current.playWave(
                    data.ticks,
                    (tickCastleHp: number) => setLiveCastleHp(tickCastleHp),
                    finishWave,
                    unseenEnemyTypes,
                    (type: string) => maybeShowTutorial('enemy', type),
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
        <div
            className="relative min-h-screen lg:h-screen flex flex-col lg:overflow-hidden text-[#f0e2c4] font-pixel p-3 md:p-4"
            onPointerDown={() => { audio.resume(); audio.music('game') }} // débloque l'audio + musique de fond au 1er geste
            style={{
                backgroundImage: "url('/home-bg-alt.jpg')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
        >
            {/* Voile sombre : le décor reste visible en fond mais ne concurrence pas
                la lisibilité du plateau et du HUD. */}
            <div className="absolute inset-0 bg-[#160f08]/80" />

            <div className="relative z-10 kcd-panel-wood flex flex-wrap justify-between items-center gap-y-2 mb-3 md:mb-4 shrink-0">
                <h1 className="text-2xl md:text-3xl font-med text-yellow-400" style={{ textShadow: '2px 2px 0 #2f1c0d' }}>KCD Formes v2</h1>
                <div className="flex flex-wrap items-center gap-3 md:gap-4">
                    <span className="font-med text-yellow-300 text-lg">Vague {waveNumber}</span>
                    <span className="flex items-center gap-1 text-yellow-300 font-med text-xl">
                        <img src="/sprites/ui/icon_gold.png" alt="or" className="kcd-icon" /> {gold}
                    </span>
                    <div className="flex items-center gap-2">
                        <img src="/sprites/ui/icon_heart.png" alt="PV" className="kcd-icon" style={{ height: 18 }} />
                        <div
                            className="w-32 h-4 overflow-hidden"
                            style={{ background: '#2a1810', border: '2px solid #120a06', boxShadow: 'inset 0 2px 0 rgba(0,0,0,.4)' }}
                        >
                            <div
                                className="h-full transition-all"
                                style={{
                                    width: `${hpRatio * 100}%`,
                                    background: hpRatio > 0.3 ? '#5bbd3a' : '#d64545',
                                    boxShadow: hpRatio > 0.3 ? 'inset 0 2px 0 #8fe06a' : 'inset 0 2px 0 #e88',
                                }}
                            />
                        </div>
                        <span className="font-med text-sm text-[#f0e2c4]">{liveCastleHp}/{castleMaxHp}</span>
                    </div>
                    <span className="text-[#d8c193]">{player?.username}</span>
                    <button onClick={handleLogout} className="kcd-btn text-xs py-1 px-3">
                        Déconnexion
                    </button>
                </div>
            </div>

            <div className="relative z-10 flex flex-col lg:flex-row gap-4 lg:flex-1 lg:min-h-0">
                <div className="w-full aspect-[4/3] lg:aspect-auto lg:flex-1 min-w-0 lg:min-h-0 rounded-lg overflow-hidden" style={{ border: '2px solid #2f1c0d' }}>
                    <GameCanvas ref={canvasRef} towers={towers} onCellClick={handleCellClick} />
                </div>

                <div className="flex flex-col gap-3 w-full lg:w-56 shrink-0 lg:overflow-y-auto">
                    {/* Carte de la tour sélectionnée (clic) : remontée en TÊTE du
                        panneau pour être associée sans ambiguïté à la tour cliquée.
                        Chaque mode est décrit en toutes lettres (le libellé seul
                        est muet), avec le mode actif surligné. Cachée en combat et
                        pour les murs (non sélectionnables). */}
                    {selectedTowerObj && !combatRunning && !isGameOver && (
                        <div className="kcd-panel flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                                <span className="font-med text-base text-[#43310f]">
                                    {TOWER_INFO[selectedTowerObj.type].label} · niv. {selectedTowerObj.level ?? 1}
                                </span>
                                <button
                                    onClick={() => setSelectedTowerId(null)}
                                    aria-label="Fermer"
                                >
                                    <img src="/sprites/ui/icon_close.png" alt="Fermer" className="kcd-icon" style={{ height: 16 }} />
                                </button>
                            </div>

                            <button
                                onClick={() => handleUpgradeSelected(selectedTowerObj)}
                                className="kcd-btn text-sm py-1"
                            >
                                ⬆ Améliorer (-{TOWER_INFO[selectedTowerObj.type].cost * (selectedTowerObj.level ?? 1)} or)
                            </button>

                            <div>
                                <p className="text-xs font-semibold text-[#5a3d16]">Priorité de tir</p>
                                <p className="text-[11px] text-[#8a6a2c] mb-2">
                                    Sur quel ennemi cette tour vise en premier.
                                </p>
                                <div className="flex flex-col gap-1">
                                    {TARGETING_MODES.map((m) => {
                                        const active = (selectedTowerObj.targetingMode ?? 'CLOSEST') === m.mode
                                        return (
                                            <button
                                                key={m.mode}
                                                onClick={() => handleSetTargeting(selectedTowerObj.id, m.mode)}
                                                className={`text-left px-2 py-1 rounded transition-all ${
                                                    active
                                                        ? 'bg-[#7a5a2c] text-[#f5e8c6]'
                                                        : 'bg-[#cdb987] text-[#5a441c] hover:bg-[#d8c79a]'
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
                                    <p className="text-[11px] text-[#8a3d12] mt-2">
                                        ⚔ La Baliste vise toujours les grosses cibles (Troll, Démon de givre, Chevalier, Boss) en priorité — le réglage départage seulement quand plusieurs sont à portée.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="kcd-panel-titled">
                        <h3 className="font-med text-center text-base mb-3 -mt-4 text-[#43310f]">Tours</h3>
                        <div className="flex flex-col gap-2">
                            {(Object.entries(TOWER_INFO) as [TowerType, typeof TOWER_INFO[TowerType]][]).map(
                                ([type, info]) => {
                                    const locked = bestWave < info.unlockWave
                                    return (
                                        <button
                                            key={type}
                                            onClick={() => { if (!locked) { audio.play('ui_click', { volume: 0.5 }); setSelectedTower(type) } }}
                                            disabled={isGameOver || combatRunning || locked}
                                            className={`kcd-btn text-sm flex justify-between items-center disabled:opacity-50 ${
                                                selectedTower === type ? 'ring-2 ring-yellow-400' : ''
                                            }`}
                                        >
                                            <span>{locked ? `🔒 ${info.label}` : info.label}</span>
                                            <span className="font-med text-base">
                                                {locked ? `V${info.unlockWave}` : `${info.cost}`}
                                            </span>
                                        </button>
                                    )
                                }
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleStartWave}
                        disabled={loading || isGameOver || combatRunning || awaitingBonusChoice}
                        className="kcd-btn font-med text-lg py-2 disabled:opacity-50"
                    >
                        {awaitingBonusChoice ? 'Choisissez un bonus' : 'Lancer la vague'}
                    </button>

                    {/* Toujours disponible (hors combat) : abandonner et repartir sur
                        une partie neuve — auparavant possible uniquement après une
                        défaite, impossible de relancer une partie mal engagée. */}
                    {!isGameOver && (
                        <button
                            onClick={() => {
                                if (window.confirm('Abandonner cette partie et en commencer une nouvelle ?')) {
                                    setIsGameOver(false)
                                    setMessage(null)
                                    newGame()
                                }
                            }}
                            disabled={combatRunning || loading}
                            className="kcd-btn text-sm py-1 disabled:opacity-50"
                        >
                            ↻ Nouvelle partie
                        </button>
                    )}

                    {message && (
                        <div className="kcd-panel text-xs text-center">{message}</div>
                    )}

                    {/* Classement : simple bouton, le détail s'ouvre en modale (info
                        non vitale, on n'encombre pas le HUD). */}
                    {leaderboard && leaderboard.top.length > 0 && (
                        <button
                            onClick={() => setShowLeaderboard(true)}
                            className="kcd-btn text-sm py-1 flex items-center justify-center gap-2"
                        >
                            <img src="/sprites/ui/icon_trophy.png" alt="" className="kcd-icon" style={{ height: 16 }} />
                            Classement
                        </button>
                    )}

                    <button
                        onClick={() => {
                            resetTutorial(player?.username ?? '')
                            setMessage('Tuto réinitialisé — les conseils réapparaîtront.')
                        }}
                        className="kcd-btn text-xs py-1 opacity-90"
                    >
                        ↻ Revoir le tuto
                    </button>

                    {/* Contrôle du son : mute + volume (persistés). */}
                    <AudioControls />
                </div>
            </div>

            {/* Modale Classement (voir backend LeaderboardService). La ligne "toi"
                n'est ajoutée que si le joueur est hors du top affiché. */}
            {showLeaderboard && leaderboard && (
                <div
                    className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
                    onClick={() => setShowLeaderboard(false)}
                >
                    <div
                        className="kcd-panel-titled font-pixel w-80 max-w-[90vw]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between -mt-4 mb-2">
                            <h2 className="font-med text-lg flex items-center gap-2 text-[#43310f]">
                                <img src="/sprites/ui/icon_trophy.png" alt="" className="kcd-icon" style={{ height: 20 }} />
                                Classement
                            </h2>
                            <button onClick={() => setShowLeaderboard(false)} aria-label="Fermer">
                                <img src="/sprites/ui/icon_close.png" alt="Fermer" className="kcd-icon" style={{ height: 18 }} />
                            </button>
                        </div>
                        <div className="flex flex-col gap-1 text-sm text-[#43310f]">
                            {leaderboard.top.map((entry) => (
                                <p
                                    key={entry.rank + entry.username}
                                    className={`flex justify-between px-1 py-0.5 rounded ${
                                        entry.username === player?.username ? 'bg-[#e0b83c]/40 font-semibold' : ''
                                    }`}
                                >
                                    <span>#{entry.rank} {entry.username}</span>
                                    <span>vague {entry.bestWave}</span>
                                </p>
                            ))}
                            {leaderboard.me &&
                                !leaderboard.top.some((e) => e.username === leaderboard.me!.username) && (
                                <p className="flex justify-between font-semibold border-t-2 border-[#c9ae76] pt-1 mt-1">
                                    <span>#{leaderboard.me.rank} {leaderboard.me.username}</span>
                                    <span>vague {leaderboard.me.bestWave}</span>
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}

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
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 font-pixel p-4">
                    <div className="kcd-panel-titled w-96 max-w-[92vw]">
                        <h2 className="font-med text-lg text-[#43310f] -mt-4 mb-1 flex items-center gap-2">
                            <img src="/sprites/ui/icon_trophy.png" alt="" className="kcd-icon" style={{ height: 20 }} />
                            Vague {waveNumber} repoussée
                        </h2>
                        <p className="text-xs text-[#8a6a2c] mb-3">
                            Choisis un bonus (un seul par palier) — celui qui t&apos;aide le plus maintenant.
                        </p>
                        <div className="flex flex-col gap-2">
                            {availableBonuses.map((bonus) => (
                                <button
                                    key={bonus.type}
                                    onClick={() => handleChooseBonus(bonus.type)}
                                    disabled={bonusChoiceLoading}
                                    className="text-left px-3 py-2 rounded bg-[#cdb987] hover:bg-[#d8c79a] text-[#4a361a] disabled:opacity-40 transition-all"
                                >
                                    <span className="block font-semibold text-sm">{bonus.label}</span>
                                    <span className="block text-xs opacity-80 mt-0.5">{bonus.description}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Écran de défaite (château tombé) — le jeu est en survie infinie,
                donc pas d'écran de victoire : on célèbre la vague atteinte. */}
            {isGameOver && (
                <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center font-pixel p-4">
                    <div className="kcd-panel w-[360px] max-w-[92vw] text-center flex flex-col items-center gap-3">
                        <img src="/sprites/ui/icon_defeat.png" alt="" className="kcd-icon" style={{ height: 64 }} />
                        <h2 className="font-med text-2xl text-[#8a3d12]">Château tombé</h2>
                        <p className="text-sm text-[#4a361a]">
                            Tu as tenu jusqu&apos;à la <b>vague {waveNumber}</b>.
                        </p>
                        <p className="text-sm text-[#5a3d16] flex items-center gap-2">
                            <img src="/sprites/ui/icon_star_gold.png" alt="" className="kcd-icon" style={{ height: 18 }} />
                            Meilleure vague : <b>{bestWave}</b>
                        </p>
                        <button
                            onClick={() => {
                                setIsGameOver(false)
                                setMessage(null)
                                newGame()
                            }}
                            className="kcd-btn font-med text-lg py-2 w-full mt-1"
                        >
                            Nouvelle partie
                        </button>
                        <button
                            onClick={() => setShowLeaderboard(true)}
                            className="kcd-btn text-sm py-1 w-full flex items-center justify-center gap-2"
                        >
                            <img src="/sprites/ui/icon_trophy.png" alt="" className="kcd-icon" style={{ height: 16 }} />
                            Classement
                        </button>
                    </div>
                </div>
            )}

            {/* Bulle de tutoriel (1re apparition d'un ennemi / 1re pose d'une tour).
                Pour un ennemi, la vague reste en pause tant qu'elle est ouverte. */}
            {tutorial && (
                <TutorialBubble
                    entry={tutorial.entry}
                    kind={tutorial.kind}
                    onClose={() => {
                        const wasEnemy = tutorial.kind === 'enemy'
                        setTutorial(null)
                        if (wasEnemy) canvasRef.current?.resumeWave?.()
                    }}
                />
            )}
        </div>
    )
}
