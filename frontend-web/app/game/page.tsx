'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useGame } from '@/hooks/useGame'
import { useAuth } from '@/hooks/useAuth'
import type { TowerData } from '@/components/game/GameScene'
import { TOP_RESERVED_ROWS } from '@/components/game/constants'
import { getMapDef, mapIsCorridor, mapIsBuildable } from '@/components/game/maps'
import type { GameCanvasHandle } from '@/components/game/GameCanvas'
import MapSelector from '@/components/game/MapSelector'
import ConfirmDialog from '@/components/game/ConfirmDialog'
import TutorialBubble from '@/components/game/TutorialBubble'
import AudioControls from '@/components/game/AudioControls'
import { UnitChip } from '@/components/game/UnitChip'
import { TowerIcon } from '@/components/game/UnitIcon'
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

// Cap d'amélioration (miroir de Tower.MAX_LEVEL côté backend) et coût du prochain
// niveau (miroir de Tower.getUpgradeCost = baseCost × level × 2).
const MAX_TOWER_LEVEL = 3
const upgradeCost = (type: TowerType, level: number) => TOWER_INFO[type].cost * level * 2
// Pastilles de niveau (repère de palier) : ✦ pleins = niveau atteint sur MAX.
const levelStars = (level: number) => '✦'.repeat(level) + '·'.repeat(Math.max(0, MAX_TOWER_LEVEL - level))

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

// Rôle de chaque tour (panneau d'évolution) : phrase courte de présentation.
const TOWER_ROLE: Record<TowerType, string> = {
    ARCHER: 'Tir rapide monocible, polyvalent.',
    MAGE: 'Dégâts magiques, ignore l’armure.',
    CATAPULT: 'Dégâts de zone sur les groupes.',
    BALLISTA: 'Longue portée, priorise les grosses cibles.',
    WALL: 'Barrage sur le couloir : bloque les ennemis.',
}

// Stats de base des tours (miroir de TowerType côté backend : baseDamage, baseRange).
// cadence = descripteur de vitesse de tir (miroir qualitatif de attackSpeed :
// ARCHER 0.6, CATAPULT 0.1, BALLISTA 0.12 ; MAGE applique ses dégâts en continu).
// hp = PV de structure au niveau 1 (miroir de Tower.getMaxHp : structureHp sinon baseCost×3).
const TOWER_STATS: Record<TowerType, { damage: number; range: number; kind: string; cadence: string; hp: number }> = {
    ARCHER:   { damage: 12,  range: 3.0, kind: 'Monocible',            cadence: 'Rapide',   hp: 150 },
    MAGE:     { damage: 11,  range: 2.5, kind: 'Continu · magique',    cadence: 'Continue', hp: 300 },
    CATAPULT: { damage: 40,  range: 4.0, kind: 'Zone (AoE)',           cadence: 'Lente',    hp: 450 },
    BALLISTA: { damage: 110, range: 5.0, kind: 'Monocible · anti-gros', cadence: 'Lente',   hp: 600 },
    WALL:     { damage: 0,   range: 0,   kind: 'Barrage',              cadence: '—',        hp: 450 },
}
// Montée en puissance par niveau (miroir de Tower.getDamage/getRange/getMaxHp).
const dmgMult = (lvl: number) => (lvl >= 3 ? 2.6 : 1 + (lvl - 1) * 0.6)   // 1.0 / 1.6 / 2.6
const rangeBonus = (lvl: number) => (lvl >= 3 ? 0.9 : (lvl - 1) * 0.35)   // +0 / +0.35 / +0.9
const hpMult = (lvl: number) => (lvl >= 3 ? 2.2 : 1 + (lvl - 1) * 0.5)    // 1.0 / 1.5 / 2.2
const towerDamage = (type: TowerType, lvl: number) => Math.floor(TOWER_STATS[type].damage * dmgMult(lvl))
const towerRange = (type: TowerType, lvl: number) => Math.round((TOWER_STATS[type].range + rangeBonus(lvl)) * 10) / 10
const towerHp = (type: TowerType, lvl: number) => Math.round(TOWER_STATS[type].hp * hpMult(lvl))

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
        gameId, map, mapId, waveNumber, gold, castleHp, castleMaxHp, status,
        awaitingBonusChoice, availableBonuses, hasHydrated: gameHydrated,
        createGame, placeTower, upgradeTower, setTargetingMode, startWave, chooseBonus, refreshGame, resumeGame, newGame,
    } = useGame()

    const canvasRef = useRef<GameCanvasHandle>(null)

    const [selectedTower, setSelectedTower] = useState<TowerType>('ARCHER')
    // Map choisie sur l'écran de départ (avant création de la partie).
    const [pendingMapId, setPendingMapId] = useState<string>('desert')
    // Modale de confirmation « nouvelle partie » (remplace window.confirm).
    const [confirmNewGame, setConfirmNewGame] = useState(false)
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

    // Plus d'auto-création : quand il n'y a pas de partie en cours, on affiche
    // l'écran de choix de map (voir plus bas). La partie démarre au clic sur
    // « Commencer », avec la map sélectionnée. gameHydrated garde le rendu de
    // l'écran de choix jusqu'à ce que le gameId persisté soit relu (évite un
    // flash de sélection à chaque F5 sur une partie en cours).

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

        // Rangée du haut réservée (tampon d'affichage des tours) : non constructible.
        if (y < TOP_RESERVED_ROWS) { setMessage('Rangée du haut réservée (affichage).'); return }

        // Règle du couloir, INVERSÉE selon le type (le backend reste l'arbitre
        // final) : le mur-barrage se pose uniquement SUR le couloir des ennemis,
        // les tours uniquement en dehors. Filtré ici pour un retour immédiat au
        // lieu d'un aller-retour réseau voué au rejet.
        const mapDef = getMapDef(mapId)
        const inCorridor = mapIsCorridor(mapDef, x, y)
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
        // Bande constructible : les tours ne se posent qu'au bord des routes. Loin
        // des routes = zone morte (décor). Le backend reste l'arbitre final.
        if (selectedTower !== 'WALL' && !inCorridor && !mapIsBuildable(mapDef, x, y)) {
            setMessage('Trop loin des routes — construis en bordure (le reste est du décor)')
            return
        }

        const cost = TOWER_INFO[selectedTower].cost
        try {
            await placeTower(selectedTower, x, y, cost)
            audio.play('tower_place')
            setMessage(`${TOWER_INFO[selectedTower].label} placé(e) en (${x}, ${y})`)
        } catch {
            audio.play('error', { volume: 0.6 })
            setMessage('Impossible de placer ici (or insuffisant ou case invalide)')
        }
    }

    async function handleUpgradeSelected(tower: TowerData) {
        const level = tower.level ?? 1
        if (level >= MAX_TOWER_LEVEL) { setMessage('Cette tour est déjà au niveau maximum (3).'); return }
        const cost = upgradeCost(tower.type, level)
        try {
            await upgradeTower(tower.id, cost)
            const next = level + 1
            setMessage(next >= MAX_TOWER_LEVEL
                ? `${TOWER_INFO[tower.type].label} portée au niveau MAX — un vrai pilier ! (-${cost} or)`
                : `${TOWER_INFO[tower.type].label} améliorée au niveau ${next} (-${cost} or)`)
        } catch {
            setMessage("Impossible d'améliorer cette tour (or insuffisant ou niveau max)")
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

    // Stats de partie (panneau latéral) dérivées de la map.
    const towerCounts = towers.reduce<Record<string, number>>((a, t) => { a[t.type] = (a[t.type] ?? 0) + 1; return a }, {})
    const wallCount = towerCounts.WALL ?? 0
    const totalTowers = towers.filter((t) => t.type !== 'WALL').length
    const canAct = !isGameOver && !combatRunning

    // Écran de départ : pas de partie en cours (et rien à reprendre) → choix de la
    // map avant de lancer. On attend gameHydrated pour ne pas afficher ce menu
    // par-dessus une partie persistée en cours de relecture.
    if (!gameId && gameHydrated) {
        async function startGame() {
            setLoading(true)
            try {
                await createGame(pendingMapId)
            } catch {
                setMessage('Erreur lors de la création de la partie')
            } finally {
                setLoading(false)
            }
        }
        return (
            <div
                className="min-h-screen flex items-center justify-center p-4 text-[#f0e2c4] font-pixel"
                style={{ backgroundImage: "url('/home-bg-alt.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
                onPointerDown={() => { audio.resume(); audio.music('menu') }}
            >
                <div className="absolute inset-0 bg-[#160f08]/85" />
                <div className="relative z-10 kcd-panel-wood max-w-2xl w-full p-5 md:p-6 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3">
                        <h1 className="text-2xl md:text-3xl font-med text-yellow-400" style={{ textShadow: '2px 2px 0 #2f1c0d' }}>
                            Choisis ta carte
                        </h1>
                        <button onClick={() => router.push('/')} className="kcd-btn kcd-btn--nav text-xs py-1 px-2">← Menu</button>
                    </div>
                    <p className="text-sm text-[#e9d9b0]">Chaque carte a son propre tracé — adapte ta défense au chemin.</p>
                    <MapSelector value={pendingMapId} onChange={setPendingMapId} disabled={loading} />
                    <button
                        onClick={startGame}
                        disabled={loading}
                        className="kcd-btn font-med text-lg py-2 disabled:opacity-50"
                    >
                        {loading ? 'Création…' : '⚔ Commencer la partie'}
                    </button>
                    {message && <p className="text-red-300 text-sm text-center">{message}</p>}
                </div>
            </div>
        )
    }

    if (loading && !gameId) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <p className="text-white text-xl">Création de la partie...</p>
            </div>
        )
    }

    return (
        <div
            className="relative h-screen flex flex-col overflow-hidden text-[#f0e2c4] font-pixel p-1.5 md:p-2"
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

            {/* HUD : 3 zones (ressources gauche · vague centre · menu droite) */}
            <div className="relative z-30 kcd-panel-wood flex flex-wrap justify-between items-center gap-x-4 gap-y-1 mb-1.5 shrink-0 py-0.5">
                {/* Gauche : titre + ressources */}
                <div className="flex items-center gap-3">
                    <h1 className="text-lg md:text-2xl font-med text-yellow-400" style={{ textShadow: '2px 2px 0 #2f1c0d' }}>KCD Formes v2</h1>
                    <span className="flex items-center gap-1 text-yellow-300 font-med text-xl">
                        <img src="/sprites/ui/icon_gold.png" alt="or" className="kcd-icon" /> {gold}
                    </span>
                    <span className="flex items-center gap-2">
                        <img src="/sprites/ui/icon_heart.png" alt="PV" className="kcd-icon" style={{ height: 18 }} />
                        <span className="w-28 h-4 overflow-hidden inline-block align-middle" style={{ background: '#2a1810', border: '2px solid #120a06' }}>
                            <span className="h-full block transition-all" style={{ width: `${hpRatio * 100}%`, background: hpRatio > 0.3 ? '#5bbd3a' : '#d64545' }} />
                        </span>
                        <span className="font-med text-sm text-[#f0e2c4]">{liveCastleHp}/{castleMaxHp}</span>
                    </span>
                </div>

                {/* Centre : vague */}
                <span className="font-med text-yellow-300 text-2xl">Vague {waveNumber}</span>

                {/* Droite : identité + menu */}
                <div className="flex items-center gap-2">
                    <span className="hidden lg:inline-flex items-center gap-1 px-2 py-0.5 rounded text-sm text-[#e9d9b0]" style={{ background: '#3a2a17', border: '1px solid #6b4a24' }}>
                        <img src="/sprites/ui/icon_star_gold.png" alt="" aria-hidden className="kcd-icon" style={{ height: 14 }} />
                        {player?.username}
                    </span>
                    <button onClick={() => router.push('/coop')} className="kcd-btn kcd-btn--nav text-xs py-1 px-2">🤝 Coop</button>
                    <button onClick={() => router.push('/versus')} className="kcd-btn kcd-btn--nav text-xs py-1 px-2">⚔ Versus</button>
                    <AudioControls />
                    <button onClick={handleLogout} className="kcd-btn kcd-btn--danger text-xs py-1 px-2">⏻ Déconnexion</button>
                </div>
            </div>

            <div className="relative z-10 flex-1 min-h-0 flex flex-col lg:flex-row gap-2 lg:gap-3">
                {/* Colonne principale : plateau prioritaire + barre d'action JUSTE dessous.
                    Fenêtre étroite (flex-col) → tours sous la grille (jouabilité) puis stats.
                    Grand écran → panneau stats/évolution à droite. */}
                <div className="flex-1 min-h-0 flex flex-col gap-1.5 min-w-0">
                    <div className="relative w-full flex-1 min-w-0 min-h-0 rounded-lg overflow-hidden" style={{ border: '2px solid #2f1c0d' }}>
                        <GameCanvas key={mapId} mapId={mapId} ref={canvasRef} towers={towers} onCellClick={handleCellClick} selectedTower={canAct ? selectedTower : null} />
                    </div>

                    {/* Barre d'action : tours en tuiles + actions (JUSTE sous la grille en étroit) */}
                    <div className="kcd-panel-wood shrink-0 flex items-center gap-3 flex-wrap py-1">
                        <span className="font-med text-sm text-[#e9d9b0] w-16 shrink-0">Tours</span>
                        <div className="flex flex-wrap gap-1.5">
                            {(Object.entries(TOWER_INFO) as [TowerType, typeof TOWER_INFO[TowerType]][]).map(([type, info]) => {
                                const locked = bestWave < info.unlockWave
                                return (
                                    <UnitChip
                                        key={type}
                                        icon={<TowerIcon type={type} size={32} />}
                                        label={info.label}
                                        cost={info.cost}
                                        badge={locked ? `🔒V${info.unlockWave}` : undefined}
                                        selected={selectedTower === type}
                                        affordable={gold >= info.cost}
                                        disabled={!canAct || locked}
                                        onClick={() => { audio.play('ui_click', { volume: 0.5 }); setSelectedTower(type); maybeShowTutorial('tower', type) }}
                                        title={locked ? `${info.label} — débloquée vague ${info.unlockWave}` : `${info.label} — ${info.cost} or`}
                                    />
                                )
                            })}
                        </div>
                        <div className="ml-auto flex items-center gap-2">
                            {leaderboard && leaderboard.top.length > 0 && (
                                <button onClick={() => setShowLeaderboard(true)} className="kcd-btn kcd-btn--info text-xs py-1 px-2 flex items-center gap-1">
                                    <img src="/sprites/ui/icon_trophy.png" alt="" className="kcd-icon" style={{ height: 14 }} /> Classement
                                </button>
                            )}
                            <button
                                onClick={() => { resetTutorial(player?.username ?? ''); setMessage('Tuto réinitialisé — les conseils réapparaîtront.') }}
                                className="kcd-btn kcd-btn--info text-xs py-1 px-2"
                            >
                                ↻ Tuto
                            </button>
                            {!isGameOver && (
                                <button
                                    onClick={() => setConfirmNewGame(true)}
                                    disabled={combatRunning || loading}
                                    className="kcd-btn kcd-btn--danger text-xs py-1 px-2 disabled:opacity-50"
                                >
                                    ↻ Nouvelle partie
                                </button>
                            )}
                            <button
                                onClick={handleStartWave}
                                disabled={loading || isGameOver || combatRunning || awaitingBonusChoice}
                                className="kcd-btn kcd-btn--primary font-med text-base py-2 px-5 disabled:opacity-50"
                            >
                                {awaitingBonusChoice ? '★ Choisis un bonus' : '⚔ Lancer la vague'}
                            </button>
                        </div>
                    </div>
                </div>

                    {/* En fenêtre étroite : le panneau stats/évolution est masqué (le plateau
                        garderait sinon une taille minuscule). La carte d'amélioration, elle,
                        reste visible même en petit car on en a besoin pour améliorer une tour. */}
                    <aside className={`w-full lg:w-64 shrink-0 min-h-0 overflow-y-auto max-h-[38vh] lg:max-h-none flex-col gap-3 ${selectedTowerObj && canAct ? 'flex' : 'hidden lg:flex'}`}>
                        {selectedTowerObj && canAct && (
                            /* Carte d'évolution de la tour cliquée : niveau, amélioration,
                               aperçu du prochain niveau, priorité de tir. */
                            <div className="kcd-panel flex flex-col gap-3">
                                <div className="flex justify-between items-center">
                                    <span className="flex items-center gap-2 font-med text-base text-[#43310f]">
                                        <TowerIcon type={selectedTowerObj.type} size={22} />
                                        {TOWER_INFO[selectedTowerObj.type].label}
                                    </span>
                                    <button onClick={() => setSelectedTowerId(null)} aria-label="Fermer">
                                        <img src="/sprites/ui/icon_close.png" alt="Fermer" className="kcd-icon" style={{ height: 16 }} />
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 -mt-1">
                                    <span className="text-yellow-600 tracking-widest text-sm" title={`Niveau ${selectedTowerObj.level ?? 1} / ${MAX_TOWER_LEVEL}`}>{levelStars(selectedTowerObj.level ?? 1)}</span>
                                    <span className="text-[11px] text-[#8a6a2c]">niv. {selectedTowerObj.level ?? 1}/{MAX_TOWER_LEVEL}</span>
                                </div>

                                <p className="text-[11px] text-[#8a6a2c]">{TOWER_ROLE[selectedTowerObj.type]}</p>

                                {/* Stats : valeur au niveau courant → au niveau suivant (si pas au max). */}
                                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px]">
                                    <span className="text-[#8a6a2c]">Dégâts</span>
                                    <span className="text-right font-med text-[#43310f]">
                                        {towerDamage(selectedTowerObj.type, selectedTowerObj.level ?? 1)}
                                        {(selectedTowerObj.level ?? 1) < MAX_TOWER_LEVEL && <span className="text-[#3a7a12]"> → {towerDamage(selectedTowerObj.type, (selectedTowerObj.level ?? 1) + 1)}</span>}
                                    </span>
                                    <span className="text-[#8a6a2c]">Portée</span>
                                    <span className="text-right font-med text-[#43310f]">
                                        {towerRange(selectedTowerObj.type, selectedTowerObj.level ?? 1)}
                                        {(selectedTowerObj.level ?? 1) < MAX_TOWER_LEVEL && <span className="text-[#3a7a12]"> → {towerRange(selectedTowerObj.type, (selectedTowerObj.level ?? 1) + 1)}</span>}
                                    </span>
                                    <span className="text-[#8a6a2c]">PV (solidité)</span>
                                    <span className="text-right font-med text-[#43310f]">
                                        {selectedTowerObj.hp ?? towerHp(selectedTowerObj.type, selectedTowerObj.level ?? 1)}/{selectedTowerObj.maxHp ?? towerHp(selectedTowerObj.type, selectedTowerObj.level ?? 1)}
                                        {(selectedTowerObj.level ?? 1) < MAX_TOWER_LEVEL && <span className="text-[#3a7a12]"> → {towerHp(selectedTowerObj.type, (selectedTowerObj.level ?? 1) + 1)}</span>}
                                    </span>
                                    <span className="text-[#8a6a2c]">Cadence</span>
                                    <span className="text-right text-[#43310f]">{TOWER_STATS[selectedTowerObj.type].cadence}</span>
                                    <span className="text-[#8a6a2c]">Type</span>
                                    <span className="text-right text-[#43310f]">{TOWER_STATS[selectedTowerObj.type].kind}</span>
                                </div>

                                {(selectedTowerObj.level ?? 1) >= MAX_TOWER_LEVEL ? (
                                    <div className="rounded px-2 py-1.5 text-[11px] text-[#3a6a12] text-center font-semibold" style={{ background: '#dff0c8', border: '1px solid #8bbf5a' }}>
                                        ✦ Niveau maximum atteint
                                    </div>
                                ) : (
                                    <>
                                        <div className="rounded px-2 py-1.5 text-[11px] text-[#5a3d16]" style={{ background: '#e6d6ab', borderLeft: '3px solid #b08a3c' }}>
                                            {(selectedTowerObj.level ?? 1) + 1 >= MAX_TOWER_LEVEL
                                                ? `Niveau ${selectedTowerObj.level ?? 1} → ${MAX_TOWER_LEVEL} : bond décisif de dégâts, portée et solidité.`
                                                : `Niveau ${selectedTowerObj.level ?? 1} → ${(selectedTowerObj.level ?? 1) + 1} : dégâts, portée et solidité renforcés.`}
                                        </div>
                                        <button onClick={() => handleUpgradeSelected(selectedTowerObj)}
                                                disabled={gold < upgradeCost(selectedTowerObj.type, selectedTowerObj.level ?? 1)}
                                                className="kcd-btn text-sm py-1.5 flex items-center justify-center gap-1 disabled:opacity-50">
                                            ⬆ Améliorer
                                            <img src="/sprites/ui/icon_gold.png" alt="" aria-hidden className="kcd-icon" style={{ height: 13 }} />
                                            -{upgradeCost(selectedTowerObj.type, selectedTowerObj.level ?? 1)}
                                        </button>
                                    </>
                                )}

                                <div>
                                    <p className="text-xs font-semibold text-[#5a3d16]">Priorité de tir</p>
                                    <p className="text-[11px] text-[#8a6a2c] mb-2">Sur quel ennemi cette tour vise en premier.</p>
                                    <div className="flex flex-col gap-1">
                                        {TARGETING_MODES.map((m) => {
                                            const active = (selectedTowerObj.targetingMode ?? 'CLOSEST') === m.mode
                                            return (
                                                <button key={m.mode} onClick={() => handleSetTargeting(selectedTowerObj.id, m.mode)}
                                                        className={`text-left px-2 py-1 rounded transition-all ${active ? 'bg-[#7a5a2c] text-[#f5e8c6]' : 'bg-[#cdb987] text-[#5a441c] hover:bg-[#d8c79a]'}`}>
                                                    <span className="block text-xs font-semibold">{active ? '✓ ' : ''}{m.label}</span>
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
                        {/* Stats + évolution : sous la carte, uniquement en grand écran
                            (masqués en fenêtre étroite pour garder le plateau grand). */}
                        <div className="hidden lg:flex lg:flex-col gap-3">
                                {/* Statistiques de la partie (complètent le HUD sans le répéter). */}
                                <div className="kcd-panel-titled">
                                    <h3 className="kcd-title font-med text-center text-base mb-2">Statistiques</h3>
                                    <div className="flex flex-col gap-1 text-sm text-[#43310f]">
                                        <div className="flex justify-between"><span className="text-[#8a6a2c]">Meilleure vague</span><span className="font-med">{bestWave}</span></div>
                                        <div className="flex justify-between"><span className="text-[#8a6a2c]">Tours posées</span><span className="font-med">{totalTowers}</span></div>
                                        <div className="flex justify-between"><span className="text-[#8a6a2c]">Murs</span><span className="font-med">{wallCount}/6</span></div>
                                    </div>
                                </div>

                                {/* Évolution des tours : rôle + nombre posé par type. */}
                                <div className="kcd-panel-titled">
                                    <h3 className="kcd-title font-med text-center text-base mb-2">Évolution des tours</h3>
                                    <p className="text-[11px] text-[#8a6a2c] mb-2 text-center">Clique une tour posée pour l’améliorer (niveau ↑ = dégâts et portée ↑).</p>
                                    <div className="flex flex-col gap-2">
                                        {(Object.entries(TOWER_INFO) as [TowerType, typeof TOWER_INFO[TowerType]][])
                                            .filter(([type]) => type !== 'WALL')
                                            .map(([type]) => {
                                                const locked = bestWave < TOWER_INFO[type].unlockWave
                                                return (
                                                    <div key={type} className={`flex items-center gap-2 ${locked ? 'opacity-50' : ''}`}>
                                                        <TowerIcon type={type} size={26} />
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center justify-between">
                                                                <span className="text-sm font-med text-[#43310f]">{locked ? `🔒 ${TOWER_INFO[type].label}` : TOWER_INFO[type].label}</span>
                                                                <span className="text-[11px] text-[#7a5320]">×{towerCounts[type] ?? 0}</span>
                                                            </div>
                                                            <p className="text-[11px] text-[#8a6a2c] leading-tight">{locked ? `Débloquée vague ${TOWER_INFO[type].unlockWave}` : TOWER_ROLE[type]}</p>
                                                            {!locked && (
                                                                <p className="text-[10px] text-[#7a5320] leading-tight">Dégâts {TOWER_STATS[type].damage} · Portée {TOWER_STATS[type].range} · {TOWER_STATS[type].hp} PV · Cadence {TOWER_STATS[type].cadence}</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                    </div>
                                </div>
                        </div>
                    </aside>
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
                        <div className="kcd-title flex items-center justify-between mb-3">
                            <h2 className="font-med text-lg flex items-center gap-2">
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
                        <h2 className="kcd-title font-med text-lg mb-3 flex items-center gap-2">
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

            <ConfirmDialog
                open={confirmNewGame}
                title="Nouvelle partie"
                message="Abandonner cette partie en cours et en commencer une nouvelle ?"
                confirmLabel="Abandonner"
                cancelLabel="Continuer"
                danger
                onConfirm={() => { setConfirmNewGame(false); setIsGameOver(false); setMessage(null); newGame() }}
                onCancel={() => setConfirmNewGame(false)}
            />
        </div>
    )
}
