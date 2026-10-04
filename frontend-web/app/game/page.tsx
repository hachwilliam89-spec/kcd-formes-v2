'use client'

import Brand from '@/components/brand/Brand'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useGame, type WavePreview } from '@/hooks/useGame'
import { useAuth } from '@/hooks/useAuth'
import type { TowerData, PlacementVerdict } from '@/components/game/GameScene'
import { TOP_RESERVED_ROWS, TOWER_BASE_RANGE, MAX_WALLS, towerRangeAt } from '@/components/game/constants'
import { getMapDef, mapIsCorridor, mapIsBuildable, GAME_MAPS } from '@/components/game/maps'
import type { GameCanvasHandle } from '@/components/game/GameCanvas'
import MapSelector from '@/components/game/MapSelector'
import ConfirmDialog from '@/components/game/ConfirmDialog'
import TutorialBubble from '@/components/game/TutorialBubble'
import AudioControls from '@/components/game/AudioControls'
import { UnitChip } from '@/components/game/UnitChip'
import { TowerIcon, EnemyIcon } from '@/components/game/UnitIcon'
import { audio } from '@/lib/audio'
import {
    ENEMY_TUTORIAL, TOWER_TUTORIAL, FEATURE_TUTORIAL, getSeenTutorials, markTutorialSeen,
    isTutorialEnabled, setTutorialEnabled,
    type TutorialEntry, type TutorialKind,
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

// Stats de base des tours (miroir de TowerType côté backend : baseDamage ; la
// portée vient de constants.ts, partagée avec les cercles de portée du plateau).
// cadence = descripteur de vitesse de tir (miroir qualitatif de attackSpeed :
// ARCHER 0.6, CATAPULT 0.1, BALLISTA 0.12 ; MAGE applique ses dégâts en continu).
// hp = PV de structure au niveau 1 (miroir de Tower.getMaxHp : structureHp sinon baseCost×3).
const TOWER_STATS: Record<TowerType, { damage: number; range: number; kind: string; cadence: string; hp: number }> = {
    ARCHER:   { damage: 12,  range: TOWER_BASE_RANGE.ARCHER, kind: 'Monocible',            cadence: 'Rapide',   hp: 150 },
    MAGE:     { damage: 11,  range: TOWER_BASE_RANGE.MAGE, kind: 'Continu · magique',    cadence: 'Continue', hp: 300 },
    CATAPULT: { damage: 40,  range: TOWER_BASE_RANGE.CATAPULT, kind: 'Zone (AoE)',           cadence: 'Lente',    hp: 450 },
    BALLISTA: { damage: 110, range: TOWER_BASE_RANGE.BALLISTA, kind: 'Monocible · anti-gros', cadence: 'Lente',   hp: 600 },
    WALL:     { damage: 0,   range: TOWER_BASE_RANGE.WALL, kind: 'Barrage',              cadence: '—',        hp: 450 },
}
// Montée en puissance par niveau (miroir de Tower.getDamage/getRange/getMaxHp).
const dmgMult = (lvl: number) => (lvl >= 3 ? 2.6 : 1 + (lvl - 1) * 0.6)   // 1.0 / 1.6 / 2.6
const hpMult = (lvl: number) => (lvl >= 3 ? 2.2 : 1 + (lvl - 1) * 0.5)    // 1.0 / 1.5 / 2.2
const towerDamage = (type: TowerType, lvl: number) => Math.floor(TOWER_STATS[type].damage * dmgMult(lvl))
const towerRange = (type: TowerType, lvl: number) => Math.round(towerRangeAt(type, lvl) * 10) / 10
const towerHp = (type: TowerType, lvl: number) => Math.round(TOWER_STATS[type].hp * hpMult(lvl))

// Modes de ciblage (voir backend TargetingMode) : libellés courts + explication.
const TARGETING_MODES: { mode: 'CLOSEST' | 'FIRST' | 'STRONGEST'; label: string; hint: string }[] = [
    { mode: 'CLOSEST', label: 'Le plus proche', hint: "Vise l'ennemi le plus près de la tour (défaut)" },
    { mode: 'FIRST', label: 'Le plus avancé', hint: "Vise celui le plus près du château — stoppe les fuyards" },
    { mode: 'STRONGEST', label: 'Le plus solide', hint: "Vise le plus de PV — concentre le feu sur les élites" },
]

// Repère de sélection : les mêmes coins dorés que sur le plateau (voir
// GameScene.drawSelectionCorners) → la carte se relie à SA tour d'un coup d'œil.
function SelectionCorners() {
    const corner = 'pointer-events-none absolute w-2 h-2 border-[#c9971c]'
    return (
        <>
            <span className={`${corner} top-0 left-0 border-t-2 border-l-2`} />
            <span className={`${corner} top-0 right-0 border-t-2 border-r-2`} />
            <span className={`${corner} bottom-0 left-0 border-b-2 border-l-2`} />
            <span className={`${corner} bottom-0 right-0 border-b-2 border-r-2`} />
        </>
    )
}

export default function GamePage() {
    const router = useRouter()
    const { player, isAuthenticated, hasHydrated: authHydrated } = useAuthStore()
    const { handleLogout } = useAuth()
    const {
        gameId, map, mapId, waveNumber, gold, castleHp, castleMaxHp, status,
        awaitingBonusChoice, availableBonuses, hasHydrated: gameHydrated,
        createGame, placeTower, upgradeTower, setTargetingMode, startWave, getNextWavePreview, chooseBonus,
        refreshGame, resumeGame, newGame,
    } = useGame()

    const canvasRef = useRef<GameCanvasHandle>(null)

    // Type de tour à poser. null = hors mode de pose (Échap) : un clic sur le
    // terrain ne construit rien.
    const [selectedTower, setSelectedTower] = useState<TowerType | null>('ARCHER')
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
    // PV des tours en direct pendant une vague (siège, destructions), remontés par
    // la scène : la carte de tour reste juste en combat. null = le store fait foi.
    const [liveTowerHp, setLiveTowerHp] = useState<Record<string, number | null> | null>(null)
    // Aperçu de la prochaine vague (types + nouveautés / Boss). null = indisponible
    // (backend pas encore à jour, erreur réseau) → simplement masqué.
    const [wavePreview, setWavePreview] = useState<WavePreview | null>(null)
    const [leaderboard, setLeaderboard] = useState<{
        top: { rank: number; username: string; bestWave: number }[]
        me: { rank: number; username: string; bestWave: number } | null
    } | null>(null)
    // Classement affiché en modale (info non vitale) plutôt que dans le HUD.
    const [showLeaderboard, setShowLeaderboard] = useState(false)
    // Onglet de classement affiché : 'global' (toutes cartes) ou un id de carte.
    const [lbTab, setLbTab] = useState<string>('global')
    // Bulles de tuto en attente, affichées une par une (une astuce et un nouvel
    // ennemi peuvent tomber en même temps). En tête = bulle visible ; enemy =>
    // la vague est en pause tant qu'elle est ouverte.
    const [tutorialQueue, setTutorialQueue] = useState<{ entry: TutorialEntry; kind: TutorialKind }[]>([])
    const tutorial = tutorialQueue[0] ?? null
    // Bulles de conseils activées (réglage par compte, voir tutorial.ts). Relu
    // après le montage : localStorage n'existe pas au rendu serveur.
    const [tutorialOn, setTutorialOn] = useState(true)

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
            const q = lbTab === 'global' ? '' : `&mapId=${lbTab}`
            const { data } = await api.get(`/api/v1/leaderboard?limit=5${q}`)
            setLeaderboard(data)
        } catch {
            // best-effort également : sans réponse, la carte affiche l'état précédent.
        }
    }

    // Change d'onglet de classement (Global / carte) et recharge la liste.
    async function selectLeaderboardTab(tab: string) {
        setLbTab(tab)
        try {
            const q = tab === 'global' ? '' : `&mapId=${tab}`
            const { data } = await api.get(`/api/v1/leaderboard?limit=5${q}`)
            setLeaderboard(data)
        } catch {
            // best-effort : on garde l'affichage précédent.
        }
    }

    // À la connexion seulement : refreshBestWave est recréée à chaque rendu, la
    // mettre en dépendance relancerait les deux requêtes en boucle.
    useEffect(() => {
        if (!isAuthenticated) return
        refreshBestWave()
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
    function maybeShowTutorial(kind: TutorialKind, type: string): boolean {
        const username = player?.username ?? ''
        if (!isTutorialEnabled(username)) return false
        const key = `${kind}:${type}`
        if (getSeenTutorials(username).has(key)) return false
        const entry = kind === 'enemy' ? ENEMY_TUTORIAL[type]
            : kind === 'tower' ? TOWER_TUTORIAL[type]
            : FEATURE_TUTORIAL[type]
        if (!entry) return false
        markTutorialSeen(username, key)
        setTutorialQueue((queue) => [...queue, { entry, kind }])
        return true
    }

    // Ferme la bulle visible (ou toutes, si le joueur coupe les conseils). Une
    // bulle d'ennemi tenait la vague en pause : on la relance en la fermant.
    function closeTutorial(disableAll = false) {
        const enemyWasPending = disableAll
            ? tutorialQueue.some((t) => t.kind === 'enemy')
            : tutorial?.kind === 'enemy'
        if (disableAll) {
            setTutorialEnabled(player?.username ?? '', false)
            setTutorialOn(false)
            setTutorialQueue([])
            setMessage('Conseils désactivés — réactivables avec le bouton « Tuto ».')
        } else {
            setTutorialQueue((queue) => queue.slice(1))
        }
        if (enemyWasPending) canvasRef.current?.resumeWave?.()
    }

    function toggleTutorial() {
        const next = !tutorialOn
        setTutorialEnabled(player?.username ?? '', next)
        setTutorialOn(next)
        if (!next) setTutorialQueue([])
        setMessage(next ? 'Conseils réactivés.' : 'Conseils désactivés — réactivables avec le bouton « Tuto ».')
    }

    // Réglage relu une fois le pseudo connu (localStorage, côté client uniquement).
    useEffect(() => {
        setTutorialOn(isTutorialEnabled(player?.username ?? ''))
    }, [player?.username])

    // Aperçu rechargé à chaque nouveau numéro de vague (il passe à N+1 dès que la
    // vague N est lancée : le serveur l'a déjà résolue).
    useEffect(() => {
        if (!gameId || isGameOver) return
        let cancelled = false
        getNextWavePreview()
            .then((preview) => { if (!cancelled) setWavePreview(preview) })
            .catch(() => { if (!cancelled) setWavePreview(null) })
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameId, waveNumber, isGameOver])

    // Astuce « Construire » à l'arrivée sur le plateau (une seule fois par compte),
    // puis la règle de la carte saisonnière s'il y a lieu.
    useEffect(() => {
        if (!gameId || !map || isGameOver) return
        maybeShowTutorial('tip', 'build')
        if (mapId === 'spring' || mapId === 'autumn') maybeShowTutorial('tip', mapId)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameId, Boolean(map), mapId])

    // 1re crue / 1re grêle annoncées : bulle de conseil (rien si les conseils sont coupés).
    useEffect(() => {
        const terrain = wavePreview?.terrain
        if (!terrain || terrain.type !== 'SPRING' || isGameOver || combatRunning) return
        if (terrain.flooded) maybeShowTutorial('tip', 'flood')
        if (terrain.hail) maybeShowTutorial('tip', 'hail')
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [wavePreview, combatRunning])

    /**
     * Règles de pose côté client (le backend reste l'arbitre final), filtrées ici
     * pour un retour immédiat au lieu d'un aller-retour réseau voué au rejet.
     * Une seule source pour l'aperçu du plateau (raison courte) et le message
     * après un clic (raison détaillée).
     */
    function checkPlacement(type: TowerType, x: number, y: number):
        { ok: true; cost: number } | { ok: false; cost: number; short: string; long: string } {
        const cost = TOWER_INFO[type].cost
        const fail = (short: string, long: string) => ({ ok: false as const, cost, short, long })
        const placed = map?.towers ?? []
        if (placed.some((t) => t.x === x && t.y === y)) return fail('Case occupée', 'Cette case est déjà occupée.')
        // Rangée du haut réservée (tampon d'affichage des tours) : non constructible.
        if (y < TOP_RESERVED_ROWS) return fail('Rangée réservée', 'Rangée du haut réservée (affichage).')
        // Règle du couloir, INVERSÉE selon le type : le mur-barrage se pose
        // uniquement SUR le couloir des ennemis, les tours uniquement en dehors.
        const mapDef = getMapDef(mapId)
        const inCorridor = mapIsCorridor(mapDef, x, y)
        if (type === 'WALL' && !inCorridor) {
            return fail('Mur : sur le couloir', 'Le mur se pose sur le couloir des ennemis (pour leur barrer la route)')
        }
        // MAX_WALLS = PlaceTowerService.MAX_WALLS côté backend (anti-donjon : paver
        // le couloir de murs entassait toute la vague sous le feu de la défense
        // entière, victoire garantie).
        if (type === 'WALL' && placed.filter((t) => t.type === 'WALL').length >= MAX_WALLS) {
            return fail(`Limite de ${MAX_WALLS} murs`, `Limite de ${MAX_WALLS} murs atteinte — le mur est un point de blocage, pas une forteresse`)
        }
        if (type !== 'WALL' && inCorridor) {
            return fail('Pas sur le couloir', 'Impossible de construire une tour sur le couloir des ennemis')
        }
        // Bande constructible : les tours ne se posent qu'au bord des routes. Le reste
        // (décor, arbres, eau…) : « Impossible », qui couvre tous les cas.
        if (type !== 'WALL' && !mapIsBuildable(mapDef, x, y)) {
            return fail('Impossible', 'Impossible de construire ici')
        }
        if (gold < cost) return fail(`Or insuffisant (${cost})`, `Or insuffisant : il faut ${cost} or (tu en as ${gold}).`)
        return { ok: true, cost }
    }

    // Même règles pour l'aperçu du plateau : coût si OK, sinon raison courte.
    function placementValidator(type: string, x: number, y: number): PlacementVerdict {
        const verdict = checkPlacement(type as TowerType, x, y)
        return verdict.ok
            ? { ok: true, cost: verdict.cost }
            : { ok: false, cost: verdict.cost, reason: verdict.short }
    }

    async function handleCellClick(x: number, y: number) {
        if (isGameOver) return

        // Cliquer sur une tour existante la SÉLECTIONNE (carte d'info : amélioration
        // + mode de ciblage) au lieu de l'améliorer directement — un clic ne doit
        // plus dépenser de l'or par surprise. Un mur n'a ni amélioration utile ni
        // ciblage : cliquer dessus ne sélectionne rien.
        const existingTower = (map?.towers ?? []).find((t) => t.x === x && t.y === y)
        const inspectable = existingTower && existingTower.type !== 'WALL' ? existingTower : null
        // Pendant la vague : consultation seulement. Cliquer une tour l'inspecte
        // (carte en lecture seule), cliquer ailleurs referme l'inspection.
        if (combatRunning || existingTower) {
            setSelectedTowerId(inspectable?.id ?? null)
            if (inspectable && !combatRunning) maybeShowTutorial('tip', 'upgrade')
            return
        }
        // Hors mode de pose (Échap) : un clic sur le terrain referme juste la carte.
        if (!selectedTower) { setSelectedTowerId(null); return }

        const verdict = checkPlacement(selectedTower, x, y)
        if (!verdict.ok) { setMessage(verdict.long); return }

        const cost = verdict.cost
        try {
            await placeTower(selectedTower, x, y, cost)
            audio.play('tower_place')
            setMessage(`${TOWER_INFO[selectedTower].label} placé(e) en (${x}, ${y})`)
            maybeShowTutorial('tip', 'inspect')
        } catch {
            audio.play('error', { volume: 0.6 })
            setMessage('Impossible de placer ici (or insuffisant ou case invalide)')
        }
    }

    // Choix du type à poser (clic sur la barre ou touche 1–5).
    function selectTowerType(type: TowerType) {
        audio.play('ui_click', { volume: 0.5 })
        setSelectedTower(type)
        maybeShowTutorial('tower', type)
    }

    // Raccourcis clavier : 1–5 = type de tour (ordre de la barre), Échap = referme
    // la carte de tour, puis sort du mode de pose. Touches physiques (e.code) :
    // sur AZERTY, la rangée du haut donne « & é " ' ( » sans Maj. Réabonné à
    // chaque rendu pour toujours lire l'état courant (or, combat, déblocages).
    useEffect(() => {
        function onKeyDown(e: KeyboardEvent) {
            if (e.ctrlKey || e.metaKey || e.altKey) return
            const target = e.target as HTMLElement | null
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
            if (e.key === 'Escape') {
                if (tutorial) closeTutorial()
                else if (showLeaderboard) setShowLeaderboard(false)
                else if (selectedTowerId) setSelectedTowerId(null)
                else setSelectedTower(null)
                return
            }
            const digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code)
            // (pas canAct : déclaré plus bas dans le rendu)
            if (!digit || isGameOver || combatRunning || tutorial || confirmNewGame || showLeaderboard) return
            const type = (Object.keys(TOWER_INFO) as TowerType[])[Number(digit[1]) - 1]
            if (!type) return
            e.preventDefault()
            if (bestWave < TOWER_INFO[type].unlockWave) {
                setMessage(`${TOWER_INFO[type].label} — débloquée à la vague ${TOWER_INFO[type].unlockWave}`)
                return
            }
            selectTowerType(type)
        }
        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    })

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
            setLiveTowerHp(null)
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
                }).finally(() => setLiveTowerHp(null)) // le store refetché refait foi
                if (data.gameStatus === 'DEFEAT') {
                    audio.music(null)
                    audio.play('defeat')
                    setIsGameOver(true)
                    setMessage(`Le château est tombé à la vague ${data.number}. Partie terminée.`)
                    return
                }
                if (data.status === 'VICTORY') {
                    audio.play('victory')
                    setMessage(`Vague ${data.number} repoussée — +${data.goldEarned} or !`)
                } else {
                    setMessage(`Vague ${data.number} : des ennemis ont atteint le château (-${data.castleDamageTaken} PV). +${data.goldEarned} or.`)
                }
                // Après la 1re vague survécue : astuce sur l'inspection en combat.
                maybeShowTutorial('tip', 'combat')
            }

            if (canvasRef.current) {
                // Tuto ennemis : la scène met la vague en pause à la 1re apparition
                // d'un type non encore vu et appelle onNeedTutorial → bulle. La
                // reprise se fait au clic « Compris » (voir rendu de TutorialBubble).
                const username = player?.username ?? ''
                const seen = getSeenTutorials(username)
                const unseenEnemyTypes = new Set(
                    isTutorialEnabled(username)
                        ? Object.keys(ENEMY_TUTORIAL).filter((t) => !seen.has(`enemy:${t}`))
                        : [],
                )
                canvasRef.current.playWave(
                    data.ticks,
                    (tickCastleHp: number) => setLiveCastleHp(tickCastleHp),
                    finishWave,
                    unseenEnemyTypes,
                    // La scène s'est mise en pause : si la bulle ne s'ouvre pas
                    // (conseils coupés entre-temps), on relance aussitôt.
                    (type: string) => { if (!maybeShowTutorial('enemy', type)) canvasRef.current?.resumeWave() },
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
    const selectedTowerStored = selectedTowerId
        ? towers.find((t) => t.id === selectedTowerId) ?? null
        : null
    // En combat, PV en direct (siège) ; une tour détruite pendant la vague
    // disparaît des PV live → sa carte se referme aussitôt.
    const destroyedLive = !!(selectedTowerStored && liveTowerHp && !(selectedTowerStored.id in liveTowerHp))
    const selectedTowerObj: TowerData | null = selectedTowerStored && !destroyedLive
        ? { ...selectedTowerStored, hp: liveTowerHp?.[selectedTowerStored.id] ?? selectedTowerStored.hp }
        : null
    const hpRatio = castleMaxHp > 0 ? Math.max(0, Math.min(1, liveCastleHp / castleMaxHp)) : 0

    // Stats de partie (panneau latéral) dérivées de la map.
    const towerCounts = towers.reduce<Record<string, number>>((a, t) => { a[t.type] = (a[t.type] ?? 0) + 1; return a }, {})
    const wallCount = towerCounts.WALL ?? 0
    const totalTowers = towers.filter((t) => t.type !== 'WALL').length
    const canAct = !isGameOver && !combatRunning
    // Inspection des tours : aussi pendant la vague (lecture seule), pas après la défaite.
    const canInspect = !isGameOver

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
                className="relative min-h-screen flex items-center justify-center p-4 text-[#f0e2c4] font-pixel"
                style={{ backgroundImage: "url('/home/war-map.webp')", backgroundSize: 'cover', backgroundPosition: 'center', imageRendering: 'pixelated' }}
                onPointerDown={() => { audio.resume(); audio.music('menu') }}
            >
                <div className="absolute inset-0 bg-[#160f08]/75" />
                <div className="relative z-10 kcd-panel-wood w-full max-w-2xl lg:max-w-6xl p-4 md:p-6 flex flex-col gap-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-4"><Brand mode="Solo" /><h1 className="font-med text-2xl text-[#ebce8b]">Choisis ton royaume</h1></div>
                        <button onClick={() => router.push('/')} className="kcd-btn kcd-btn--nav text-xs py-1 px-2">← Menu</button>
                    </div>
                    <MapSelector value={pendingMapId} onChange={setPendingMapId} disabled={loading} />
                    <button
                        onClick={startGame}
                        disabled={loading}
                        className="kcd-btn kcd-btn--primary font-med text-lg py-2 px-10 self-center min-w-[280px] disabled:opacity-50"
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
                backgroundImage: "url('/home/war-map.webp')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
            }}
        >
            {/* Voile sombre : le décor reste visible en fond mais ne concurrence pas
                la lisibilité du plateau et du HUD. */}
            <div className="absolute inset-0 bg-[#160f08]/70" />

            {/* HUD : 3 zones (ressources gauche · vague centre · menu droite) */}
            <div className="relative z-30 kcd-panel-wood ws-game-header flex flex-wrap justify-between items-center gap-x-4 gap-y-1 mb-1.5 shrink-0 py-0.5">
                {/* Gauche : titre + ressources */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 min-w-0">
                    <h1 className="ws-game-brand"><Brand mode="Solo" /></h1>
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
                    <button onClick={() => router.push('/coop')} className="kcd-btn kcd-btn--nav text-xs py-1 px-2" title="Coop" aria-label="Coop">🤝<span className="hidden xl:inline"> Coop</span></button>
                    <button onClick={() => router.push('/versus')} className="kcd-btn kcd-btn--nav text-xs py-1 px-2" title="Versus" aria-label="Versus">⚔<span className="hidden xl:inline"> Versus</span></button>
                    <AudioControls />
                    <button onClick={handleLogout} className="kcd-btn kcd-btn--danger text-xs py-1 px-2" title="Déconnexion" aria-label="Déconnexion">⏻<span className="hidden xl:inline"> Déconnexion</span></button>
                </div>
            </div>

            <div className="relative z-10 flex-1 min-h-0 flex flex-col lg:flex-row gap-2 lg:gap-3">
                {/* Colonne principale : plateau prioritaire + barre d'action JUSTE dessous.
                    Fenêtre étroite (flex-col) → tours sous la grille (jouabilité) puis stats.
                    Grand écran → panneau stats/évolution à droite. */}
                <div className="flex-1 min-h-0 flex flex-col gap-1.5 min-w-0">
                    <div className="relative w-full flex-1 min-w-0 min-h-0 rounded-lg overflow-hidden" style={{ border: '2px solid #2f1c0d' }}>
                        <GameCanvas
                            key={mapId} mapId={mapId} ref={canvasRef} towers={towers} onCellClick={handleCellClick}
                            terrainForecast={wavePreview?.terrain}
                            selectedTower={canAct ? selectedTower : null}
                            // Même visibilité que la carte de tour (lecture seule en combat).
                            selectedTowerId={canInspect ? selectedTowerId : null}
                            inspectEnabled={canInspect}
                            placementValidator={placementValidator}
                            onTowersLive={(live) => setLiveTowerHp(Object.fromEntries(live.map((t) => [t.id, t.hp ?? null])))}
                        />
                    </div>


                    {/* Barre d'action : tours en tuiles + actions (JUSTE sous la grille en étroit).
                        Sur une seule ligne dès que possible : chaque ligne en plus est prise
                        sur la hauteur du plateau. Les actions secondaires sont en icônes
                        (libellé affiché sur très grand écran, infobulle sinon). */}
                    <div className="kcd-panel-wood shrink-0 flex items-center gap-x-3 gap-y-1.5 flex-wrap py-1">
                        <span className="font-med text-sm text-[#e9d9b0] shrink-0 hidden 2xl:inline">Tours</span>
                        <div className="flex flex-wrap gap-1">
                            {(Object.entries(TOWER_INFO) as [TowerType, typeof TOWER_INFO[TowerType]][]).map(([type, info], i) => {
                                const locked = bestWave < info.unlockWave
                                return (
                                    <UnitChip
                                        key={type}
                                        hotkey={String(i + 1)}
                                        icon={<TowerIcon type={type} size={32} />}
                                        label={info.label}
                                        cost={info.cost}
                                        badge={locked ? `🔒V${info.unlockWave}` : undefined}
                                        selected={selectedTower === type}
                                        affordable={gold >= info.cost}
                                        disabled={!canAct || locked}
                                        onClick={() => selectTowerType(type)}
                                        title={locked ? `${info.label} — débloquée vague ${info.unlockWave}` : `${info.label} — ${info.cost} or (touche ${i + 1})`}
                                    />
                                )
                            })}
                        </div>
                        <div className="ml-auto flex items-center gap-1.5">
                            {leaderboard && leaderboard.top.length > 0 && (
                                <button onClick={() => setShowLeaderboard(true)} className="kcd-btn kcd-btn--info text-xs py-1 px-2 flex items-center gap-1" title="Classement" aria-label="Classement">
                                    <img src="/sprites/ui/icon_trophy.png" alt="" className="kcd-icon" style={{ height: 14 }} />
                                    <span className="hidden 2xl:inline">Classement</span>
                                </button>
                            )}
                            {/* Tuto : active / coupe les bulles de conseils (grisé quand coupé). */}
                            <button
                                onClick={toggleTutorial}
                                className="kcd-btn kcd-btn--info text-xs py-1 px-2"
                                title={tutorialOn ? 'Couper les bulles de conseils' : 'Réactiver les bulles de conseils'}
                                aria-pressed={tutorialOn}
                                style={tutorialOn ? undefined : { filter: 'grayscale(1)', opacity: 0.75 }}
                            >
                                💡 Tuto
                            </button>
                            {!isGameOver && (
                                <button
                                    onClick={() => setConfirmNewGame(true)}
                                    disabled={combatRunning || loading}
                                    className="kcd-btn kcd-btn--danger text-xs py-1 px-2 disabled:opacity-50"
                                >
                                    ⟲ New Game
                                </button>
                            )}
                            {wavePreview && !isGameOver && (
                                /* Prochaine vague : types présents (pas les effectifs), nouveautés
                                   cerclées d'or (nom dans l'infobulle, en clair sur très grand
                                   écran) et alerte Boss. Le numéro est sur le bouton de lancement. */
                                <div
                                    className="flex items-center gap-1 px-1.5 py-0.5 rounded"
                                    style={{ background: 'rgba(0,0,0,.35)', border: '1px solid #6b4a24' }}
                                    aria-label={`Prochaine vague (${wavePreview.waveNumber}) : ${wavePreview.enemyTypes.map((t) => ENEMY_TUTORIAL[t]?.title ?? t).join(', ')}`}
                                >
                                    {wavePreview.enemyTypes.map((type) => {
                                        // Vague 1 : tout est « nouveau », le signaler n'apprend rien.
                                        const isNew = wavePreview.waveNumber > 1 && wavePreview.newEnemyTypes.includes(type)
                                        const name = ENEMY_TUTORIAL[type]?.title ?? type
                                        return (
                                            <span
                                                key={type}
                                                title={isNew ? `${name} — nouveau !` : name}
                                                className="rounded-full p-px"
                                                style={{ boxShadow: isNew ? '0 0 0 2px #f2c94c' : undefined }}
                                            >
                                                <EnemyIcon type={type} size={type === 'BOSS_WARLORD' ? 32 : 26} />
                                            </span>
                                        )
                                    })}
                                    {wavePreview.bossWave ? (
                                        <span className="font-read text-[11px] font-bold px-1.5 py-0.5 rounded-sm text-white" style={{ background: '#b91c1c' }}>
                                            ☠ Boss
                                        </span>
                                    ) : wavePreview.newEnemyTypes.length > 0 && wavePreview.waveNumber > 1 && (
                                        <span className="hidden 2xl:inline font-read text-[11px] font-bold px-1.5 py-0.5 rounded-sm text-[#3a2a10]" style={{ background: '#f2c94c' }}>
                                            Nouveau : {wavePreview.newEnemyTypes.map((t) => ENEMY_TUTORIAL[t]?.title ?? t).join(', ')}
                                        </span>
                                    )}
                                </div>
                            )}
                            <button
                                onClick={handleStartWave}
                                disabled={loading || isGameOver || combatRunning || awaitingBonusChoice}
                                className="kcd-btn kcd-btn--primary font-med text-base py-2 px-3 disabled:opacity-50 whitespace-nowrap"
                                aria-label={awaitingBonusChoice ? 'Choisis un bonus' : `Lancer la vague ${wavePreview?.waveNumber ?? waveNumber + 1}`}
                            >
                                {/* Libellé court entre 1024 et 1280 px : la barre tient sur une ligne. */}
                                {awaitingBonusChoice ? (
                                    <>★ <span className="hidden xl:inline">Choisis un </span>bonus</>
                                ) : (
                                    <>⚔ <span className="hidden xl:inline">Lancer la </span>vague {wavePreview?.waveNumber ?? waveNumber + 1}</>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                    {/* En fenêtre étroite : le panneau stats/évolution est masqué (le plateau
                        garderait sinon une taille minuscule). La carte d'amélioration, elle,
                        reste visible même en petit car on en a besoin pour améliorer une tour. */}
                    <aside className={`w-full lg:w-56 xl:w-64 shrink-0 min-h-0 overflow-y-auto max-h-[38vh] lg:max-h-none flex-col gap-3 ${selectedTowerObj && canInspect ? 'flex' : 'hidden lg:flex'}`}>
                        {selectedTowerObj && canInspect && (
                            /* Carte d'évolution de la tour cliquée : niveau, amélioration,
                               aperçu du prochain niveau, priorité de tir. Pendant une vague :
                               consultable (PV en direct), actions désactivées. */
                            <div className="kcd-panel flex flex-col gap-3">
                                <div className="flex justify-between items-center">
                                    <span className="flex items-center gap-2 font-med text-base text-[#43310f]">
                                        <span className="relative inline-flex p-1">
                                            <TowerIcon type={selectedTowerObj.type} size={22} />
                                            <SelectionCorners />
                                        </span>
                                        {TOWER_INFO[selectedTowerObj.type].label}
                                    </span>
                                    <button onClick={() => setSelectedTowerId(null)} aria-label="Fermer">
                                        <img src="/sprites/ui/icon_close.png" alt="Fermer" className="kcd-icon" style={{ height: 16 }} />
                                    </button>
                                </div>

                                <div className="flex items-center gap-2 -mt-1">
                                    <span className="text-yellow-600 tracking-widest text-sm" title={`Niveau ${selectedTowerObj.level ?? 1} / ${MAX_TOWER_LEVEL}`}>{levelStars(selectedTowerObj.level ?? 1)}</span>
                                    <span className="font-read text-xs text-[#8a6a2c]">niv. {selectedTowerObj.level ?? 1}/{MAX_TOWER_LEVEL}</span>
                                </div>

                                {combatRunning && (
                                    <p className="font-read text-xs text-[#5a3d16] rounded px-2 py-1" style={{ background: 'rgba(255, 236, 200, .08)', borderLeft: '3px solid #8a6a2c' }}>
                                        Vague en cours : consultation seulement. Amélioration et ciblage reviennent après le combat.
                                    </p>
                                )}

                                <p className="font-read text-xs text-[#8a6a2c]">{TOWER_ROLE[selectedTowerObj.type]}</p>

                                {/* Stats : valeur au niveau courant → au niveau suivant (si pas au max). */}
                                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-read">
                                    <span className="text-[#8a6a2c]">Dégâts</span>
                                    <span className="text-right font-semibold text-[#43310f]">
                                        {towerDamage(selectedTowerObj.type, selectedTowerObj.level ?? 1)}
                                        {(selectedTowerObj.level ?? 1) < MAX_TOWER_LEVEL && <span className="text-[#3a7a12]"> → {towerDamage(selectedTowerObj.type, (selectedTowerObj.level ?? 1) + 1)}</span>}
                                    </span>
                                    <span className="text-[#8a6a2c]">Portée</span>
                                    <span className="text-right font-semibold text-[#43310f]">
                                        {towerRange(selectedTowerObj.type, selectedTowerObj.level ?? 1)}
                                        {(selectedTowerObj.level ?? 1) < MAX_TOWER_LEVEL && <span className="text-[#3a7a12]"> → {towerRange(selectedTowerObj.type, (selectedTowerObj.level ?? 1) + 1)}</span>}
                                    </span>
                                    <span className="text-[#8a6a2c]">PV (solidité)</span>
                                    <span className="text-right font-semibold text-[#43310f]">
                                        {selectedTowerObj.hp ?? towerHp(selectedTowerObj.type, selectedTowerObj.level ?? 1)}/{selectedTowerObj.maxHp ?? towerHp(selectedTowerObj.type, selectedTowerObj.level ?? 1)}
                                        {(selectedTowerObj.level ?? 1) < MAX_TOWER_LEVEL && <span className="text-[#3a7a12]"> → {towerHp(selectedTowerObj.type, (selectedTowerObj.level ?? 1) + 1)}</span>}
                                    </span>
                                    <span className="text-[#8a6a2c]">Cadence</span>
                                    <span className="text-right text-[#43310f]">{TOWER_STATS[selectedTowerObj.type].cadence}</span>
                                    <span className="text-[#8a6a2c]">Type</span>
                                    <span className="text-right text-[#43310f]">{TOWER_STATS[selectedTowerObj.type].kind}</span>
                                </div>

                                {(selectedTowerObj.level ?? 1) >= MAX_TOWER_LEVEL ? (
                                    <div className="rounded px-2 py-1.5 font-read text-xs text-[#3a6a12] text-center font-semibold" style={{ background: 'rgba(120, 190, 80, .14)', border: '1px solid #6f9e46' }}>
                                        ✦ Niveau maximum atteint
                                    </div>
                                ) : (
                                    <>
                                        <div className="rounded px-2 py-1.5 font-read text-xs text-[#5a3d16]" style={{ background: 'rgba(255, 236, 200, .08)', borderLeft: '3px solid #b08a3c' }}>
                                            {(selectedTowerObj.level ?? 1) + 1 >= MAX_TOWER_LEVEL
                                                ? `Niveau ${selectedTowerObj.level ?? 1} → ${MAX_TOWER_LEVEL} : bond décisif de dégâts, portée et solidité.`
                                                : `Niveau ${selectedTowerObj.level ?? 1} → ${(selectedTowerObj.level ?? 1) + 1} : dégâts, portée et solidité renforcés.`}
                                        </div>
                                        <button onClick={() => handleUpgradeSelected(selectedTowerObj)}
                                                disabled={combatRunning || gold < upgradeCost(selectedTowerObj.type, selectedTowerObj.level ?? 1)}
                                                className="kcd-btn text-sm py-1.5 flex items-center justify-center gap-1 disabled:opacity-50">
                                            ⬆ Améliorer
                                            <img src="/sprites/ui/icon_gold.png" alt="" aria-hidden className="kcd-icon" style={{ height: 13 }} />
                                            -{upgradeCost(selectedTowerObj.type, selectedTowerObj.level ?? 1)}
                                        </button>
                                    </>
                                )}

                                <div>
                                    <p className="text-xs font-semibold text-[#5a3d16]">Priorité de tir</p>
                                    <p className="font-read text-xs text-[#8a6a2c] mb-2">Sur quel ennemi cette tour vise en premier.</p>
                                    <div className="flex flex-col gap-1">
                                        {TARGETING_MODES.map((m) => {
                                            const active = (selectedTowerObj.targetingMode ?? 'CLOSEST') === m.mode
                                            return (
                                                <button key={m.mode} onClick={() => handleSetTargeting(selectedTowerObj.id, m.mode)}
                                                        disabled={combatRunning}
                                                        className={`text-left px-2 py-1 rounded transition-all disabled:cursor-not-allowed ${active ? 'bg-[#7a5a2c] text-[#f5e8c6]' : 'bg-[#cdb987] text-[#5a441c] enabled:hover:bg-[#d8c79a] disabled:opacity-60'}`}>
                                                    <span className="block text-xs font-semibold">{active ? '✓ ' : ''}{m.label}</span>
                                                    <span className="block font-read text-xs opacity-80">{m.hint}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                    {selectedTowerObj.type === 'BALLISTA' && (
                                        <p className="font-read text-xs text-[#8a3d12] mt-2">
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
                                        <div className="flex justify-between"><span className="text-[#8a6a2c]">Meilleure vague</span><span className="font-read font-semibold">{bestWave}</span></div>
                                        <div className="flex justify-between"><span className="text-[#8a6a2c]">Tours posées</span><span className="font-read font-semibold">{totalTowers}</span></div>
                                        <div className="flex justify-between"><span className="text-[#8a6a2c]">Murs</span><span className="font-read font-semibold">{wallCount}/{MAX_WALLS}</span></div>
                                    </div>
                                </div>

                                {/* Évolution des tours : rôle + nombre posé par type. */}
                                <div className="kcd-panel-titled">
                                    <h3 className="kcd-title font-med text-center text-base mb-2">Évolution des tours</h3>
                                    <p className="font-read text-xs text-[#8a6a2c] mb-2 text-center">Clique une tour posée pour l’améliorer (niveau ↑ = dégâts et portée ↑). Touches 1–5 : choisir une tour, Échap : annuler.</p>
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
                                                                <span className="font-read text-xs text-[#7a5320]">×{towerCounts[type] ?? 0}</span>
                                                            </div>
                                                            <p className="font-read text-xs text-[#8a6a2c] leading-snug">{locked ? `Débloquée vague ${TOWER_INFO[type].unlockWave}` : TOWER_ROLE[type]}</p>
                                                            {!locked && (
                                                                <p className="font-read text-[11px] text-[#7a5320] leading-snug">Dégâts {TOWER_STATS[type].damage} · Portée {TOWER_STATS[type].range} · {TOWER_STATS[type].hp} PV · Cadence {TOWER_STATS[type].cadence}</p>
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
                        <div className="relative mb-3">
                            <h2 className="kcd-title font-med text-lg flex items-center gap-2">
                                <img src="/sprites/ui/icon_trophy.png" alt="" className="kcd-icon" style={{ height: 20 }} />
                                Classement
                            </h2>
                            <button onClick={() => setShowLeaderboard(false)} aria-label="Fermer" className="absolute right-0 top-1/2 -translate-y-1/2">
                                <img src="/sprites/ui/icon_close.png" alt="Fermer" className="kcd-icon" style={{ height: 18 }} />
                            </button>
                        </div>

                        {/* Onglets : Global (toutes cartes) + un par carte. */}
                        <div className="flex flex-wrap gap-1 mb-2">
                            {[{ id: 'global', name: 'Global' }, ...GAME_MAPS.map((m) => ({ id: m.id, name: m.name }))].map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => selectLeaderboardTab(t.id)}
                                    className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                                        lbTab === t.id ? 'bg-[#7a5a2c] text-[#f5e8c6]' : 'bg-[#cdb987] text-[#5a441c] hover:bg-[#d8c79a]'
                                    }`}
                                >
                                    {t.name}
                                </button>
                            ))}
                        </div>

                        <div className="flex flex-col gap-1 text-sm text-[#43310f]">
                            {leaderboard.top.length === 0 && (
                                <p className="text-center text-[#8a6a2c] py-2">Aucun score sur cette carte pour l&apos;instant.</p>
                            )}
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
                        <h2 className="kcd-title font-med text-2xl">Château tombé</h2>
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

            {/* Bulle de tutoriel (nouvel ennemi, nouvelle tour, astuce d'interface).
                Pour un ennemi, la vague reste en pause tant qu'elle est ouverte. */}
            {tutorial && (
                <TutorialBubble
                    entry={tutorial.entry}
                    kind={tutorial.kind}
                    onClose={() => closeTutorial()}
                    onDisable={() => closeTutorial(true)}
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
