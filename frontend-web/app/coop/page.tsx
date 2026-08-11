'use client'

// Page multijoueur COOP : lobby (créer / rejoindre par code / prêt / démarrer)
// puis partie en direct partagée à deux (or commun, boucle autoritaire serveur).
// UX : plateau plein écran (flex-1) + barre d'action en bas (Tours color-codées) →
// tout tient sans scroll. Voir docs/MULTIPLAYER.md.
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useCoop } from '@/hooks/useCoop'
import type { CoopCanvasHandle } from '@/components/coop/CoopCanvas'
import { TowerIcon } from '@/components/game/UnitIcon'
import { UnitChip } from '@/components/game/UnitChip'
import { ChatPanel, type ChatMessage } from '@/components/game/ChatPanel'
import { useHasGutter } from '@/components/game/useHasGutter'
import { isCorridorCell, TOP_RESERVED_ROWS } from '@/components/game/constants'
import { audio } from '@/lib/audio'

const CoopCanvas = dynamic(() => import('@/components/coop/CoopCanvas'), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full bg-slate-900 flex items-center justify-center">
            <p className="text-slate-400">Chargement du plateau…</p>
        </div>
    ),
})

type TowerType = 'ARCHER' | 'MAGE' | 'CATAPULT' | 'BALLISTA' | 'WALL'
// color = couleur du type (légende) reprise du rendu de jeu.
const TOWERS: { type: TowerType; label: string; cost: number; color: string }[] = [
    { type: 'ARCHER', label: 'Archer', cost: 50, color: '#5bbd3a' },
    { type: 'MAGE', label: 'Mage', cost: 100, color: '#9a6ce0' },
    { type: 'CATAPULT', label: 'Catapulte', cost: 150, color: '#e08a3a' },
    { type: 'BALLISTA', label: 'Baliste', cost: 200, color: '#c7cdd4' },
    { type: 'WALL', label: 'Mur', cost: 35, color: '#9a8560' },
]

const BONUSES: { type: string; label: string }[] = [
    { type: 'GOLD_INJECTION', label: '💰 Or' },
    { type: 'CASTLE_REPAIR', label: '🏰 Château' },
    { type: 'TOWER_REPAIR', label: '🔧 Tours' },
]

// Tuto guidé coop : le Héraut parle dans le chat, chaque phrase surligne sa zone.
// Coop = défense partagée (or commun, château commun), pas d'envois à l'adversaire.
const TUTO_STEPS: { target: string; text: string }[] = [
    { target: 'board', text: "Bienvenue ! Défendez ensemble votre château contre les vagues." },
    { target: 'towers', text: "Posez vos tours depuis cette barre, sur les cases hors du chemin." },
    { target: 'board', text: "L'or est commun : concertez-vous avant de dépenser. Chaque vague est plus rude." },
    { target: 'chat', text: "Coordonnez-vous ici, dans le chat. Bonne défense, seigneurs !" },
]

export default function CoopPage() {
    const router = useRouter()
    const { player, isAuthenticated, hasHydrated } = useAuthStore()
    const { connected, error, match, hud, chat, actions } = useCoop()

    const [code, setCode] = useState('')
    const [selectedTower, setSelectedTower] = useState<TowerType>('ARCHER')
    const [notice, setNotice] = useState<string | null>(null)
    const canvasRef = useRef<CoopCanvasHandle>(null)
    const { ref: boardRef, gutter } = useHasGutter()
    const showChat = gutter >= 340

    // Tuto guidé (mêmes mécaniques que le versus) : phrases dévoilées + surlignage,
    // désactivable et retenu (clé partagée avec le versus).
    const [tutoStep, setTutoStep] = useState(-1)
    const [tutoOff, setTutoOff] = useState(false)
    useEffect(() => { try { if (localStorage.getItem('kcd_tuto_off') === '1') setTutoOff(true) } catch { /* ignore */ } }, [])
    const skipTuto = () => { setTutoStep(-1); setTutoOff(true); try { localStorage.setItem('kcd_tuto_off', '1') } catch { /* ignore */ } }

    useEffect(() => {
        actions.setSnapshotHandler((snap) => canvasRef.current?.pushSnapshot(snap))
        return () => actions.setSnapshotHandler(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (hasHydrated && !isAuthenticated) router.push('/')
    }, [hasHydrated, isAuthenticated, router])

    useEffect(() => {
        if (isAuthenticated) actions.connect()
        return () => actions.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated])

    useEffect(() => {
        if (match?.status === 'RUNNING') audio.music('game')
    }, [match?.status])

    useEffect(() => {
        if (!notice && !error) return
        const t = setTimeout(() => { setNotice(null); actions.clearError() }, 3000)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notice, error])

    const running = match?.status === 'RUNNING'
    const isHost = useMemo(() => match?.players[0]?.playerId === player?.playerId, [match, player])
    const me = match?.players.find((p) => p.playerId === player?.playerId)

    // Démarre / rejoue le tuto à chaque partie (sauf s'il est désactivé).
    // Avancement manuel (bouton « Suivant ») pour apprendre à son rythme.
    useEffect(() => {
        setTutoStep(!running || tutoOff ? -1 : 0)
    }, [running, tutoOff])
    const nextTuto = () => setTutoStep((s) => (s >= TUTO_STEPS.length - 1 ? -1 : s + 1))

    const hlTarget = tutoStep >= 0 ? TUTO_STEPS[tutoStep].target : null
    const tutoMsgs: ChatMessage[] = tutoStep < 0
        ? []
        : TUTO_STEPS.slice(0, tutoStep + 1).map((s, i) => ({ senderId: 'guide', username: 'Le Héraut', text: s.text, ts: i }))

    function place(x: number, y: number) {
        if (!running) return
        setNotice(null)
        if (y < TOP_RESERVED_ROWS) { setNotice('Rangée du haut réservée.'); return }
        const inCorridor = isCorridorCell(x, y)
        if (selectedTower === 'WALL' && !inCorridor) { setNotice('Le mur se pose sur le couloir des ennemis.'); return }
        if (selectedTower !== 'WALL' && inCorridor) { setNotice('Impossible de poser une tour sur le couloir.'); return }
        actions.placeTower(selectedTower, x, y)
    }

    if (!hasHydrated || !isAuthenticated) return null

    const gold = hud?.gold ?? 0
    const castleRatio = hud && hud.castleMaxHp > 0 ? Math.max(0, hud.castleHp / hud.castleMaxHp) : 1

    return (
        <div
            className="relative h-screen flex flex-col overflow-hidden text-[#f0e2c4] font-pixel p-2 md:p-3"
            onPointerDown={() => audio.resume()}
            style={{ backgroundImage: "url('/home-bg-alt.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
            <div className="absolute inset-0 bg-[#160f08]/85" />

            {/* ---- HUD : 3 zones (ressources · vague · équipe + menu) ---- */}
            <div className="relative z-10 kcd-panel-wood flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-2 shrink-0 py-1">
                {/* Gauche : titre + ressources */}
                <div className="flex items-center gap-3">
                    <h1 className="font-med text-xl md:text-2xl text-yellow-400" style={{ textShadow: '2px 2px 0 #2f1c0d' }}>Coop</h1>
                    {running && hud && (
                        <>
                            <span className="flex items-center gap-1 text-yellow-300 font-med text-xl">
                                <img src="/sprites/ui/icon_gold.png" alt="or" className="kcd-icon" /> {gold}
                            </span>
                            <span className="flex items-center gap-2">
                                <img src="/sprites/ui/icon_heart.png" alt="PV" className="kcd-icon" style={{ height: 18 }} />
                                <span className="w-28 h-4 overflow-hidden inline-block align-middle" style={{ background: '#2a1810', border: '2px solid #120a06' }}>
                                    <span className="h-full block transition-all" style={{ width: `${castleRatio * 100}%`, background: castleRatio > 0.3 ? '#5bbd3a' : '#d64545' }} />
                                </span>
                                <span className="font-med text-sm">{hud.castleHp}/{hud.castleMaxHp}</span>
                            </span>
                        </>
                    )}
                </div>

                {/* Centre : vague */}
                {running && hud && (
                    <span className="font-med text-yellow-300 text-2xl">Vague {hud.wave}</span>
                )}

                {/* Droite : équipe + menu */}
                <div className="flex items-center gap-3">
                    {running && match && (
                        <span className="text-[#d8c193] text-xs hidden md:inline">Équipe : {match.players.map((p) => p.username).join(', ')}</span>
                    )}
                    {!connected && <span className="text-[#e9d9b0] text-xs">Connexion…</span>}
                    <span className="text-[#d8c193] text-sm hidden lg:inline">{player?.username}</span>
                    <button onClick={() => { actions.leave(); router.push('/game') }} className="kcd-btn text-xs py-1 px-3">← Solo</button>
                </div>
            </div>

            {/* ---- LOBBY ---- */}
            {!running && (
                <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center overflow-y-auto">
                    <div className="kcd-panel-titled w-[440px] max-w-[94vw]">
                        <h2 className="kcd-title font-med text-center text-xl mb-4">Jouer à deux</h2>

                        {!match && (
                            <div className="flex flex-col gap-3">
                                <p className="text-xs text-[#8a6a2c] text-center">
                                    Défendez le même château, or partagé. Créez une partie et donnez le code
                                    à un ami — ou rejoignez la sienne.
                                </p>
                                {error && <p className="text-xs text-[#8a3d12] text-center">⚠ {error}</p>}
                                <button onClick={actions.create} disabled={!connected} className="kcd-btn font-med text-lg py-2 disabled:opacity-50">
                                    Créer une partie
                                </button>
                                <div className="flex items-center gap-2 text-[#8a6a2c] text-xs">
                                    <span className="flex-1 border-t border-[#c9ae76]" /> ou <span className="flex-1 border-t border-[#c9ae76]" />
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                                        placeholder="CODE"
                                        maxLength={6}
                                        className="flex-1 px-3 py-2 rounded bg-[#f5e8c6] text-[#43310f] text-center tracking-widest font-med uppercase"
                                    />
                                    <button onClick={() => actions.join(code)} disabled={!connected || code.length < 4} className="kcd-btn px-4 disabled:opacity-50">
                                        Rejoindre
                                    </button>
                                </div>
                            </div>
                        )}

                        {match && (
                            <div className="flex flex-col gap-4">
                                <div className="text-center">
                                    <p className="text-xs text-[#8a6a2c]">Code de la partie</p>
                                    <p className="font-med text-3xl text-[#43310f] tracking-[0.3em]">{match.code}</p>
                                    <p className="text-[11px] text-[#8a6a2c]">Partage-le pour qu&apos;un ami rejoigne.</p>
                                </div>
                                <div className="flex flex-col gap-2">
                                    {match.players.map((p, i) => (
                                        <div key={p.playerId} className="flex items-center justify-between px-3 py-2 rounded bg-[#cdb987] text-[#4a361a]">
                                            <span className="font-semibold text-sm">
                                                {i === 0 ? '👑 ' : ''}{p.username}{p.playerId === player?.playerId ? ' (toi)' : ''}
                                            </span>
                                            <span className={`text-xs font-med ${p.ready ? 'text-green-800' : 'text-[#8a3d12]'}`}>
                                                {p.ready ? '✓ Prêt' : 'En attente'}
                                            </span>
                                        </div>
                                    ))}
                                    {match.players.length < match.maxPlayers && (
                                        <div className="px-3 py-2 rounded bg-[#cdb987]/50 text-[#8a6a2c] text-xs text-center italic">
                                            En attente d&apos;un second joueur…
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => actions.setReady(!me?.ready)} className={`kcd-btn flex-1 py-2 ${me?.ready ? 'ring-2 ring-green-500' : ''}`}>
                                        {me?.ready ? '✓ Prêt' : 'Je suis prêt'}
                                    </button>
                                    {isHost && (
                                        <button onClick={actions.start} disabled={!match.canStart} className="kcd-btn flex-1 py-2 font-med disabled:opacity-40">
                                            Démarrer
                                        </button>
                                    )}
                                </div>
                                {isHost && !match.canStart && (
                                    <p className="text-[11px] text-[#8a6a2c] text-center">Il faut deux joueurs prêts pour démarrer.</p>
                                )}
                                <button onClick={actions.leave} className="kcd-btn text-xs py-1 opacity-90">Quitter le lobby</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ---- PARTIE EN COURS : plateau plein écran + barre d'action ---- */}
            {running && (
                <div className="relative z-10 flex-1 min-h-0 flex flex-col gap-2">
                    <div ref={boardRef} className="flex-1 min-h-0 flex gap-2 justify-center">
                    <div className={`relative min-h-0 rounded-lg overflow-hidden ${showChat ? 'h-full aspect-[5/4] shrink-0' : 'flex-1'} ${hlTarget === 'board' ? 'ring-4 ring-inset ring-yellow-400' : ''}`} style={{ border: '2px solid #2f1c0d' }}>
                        <CoopCanvas ref={canvasRef} onCellClick={place} selectedTower={selectedTower} />
                        {(notice || error) && (
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-20 kcd-panel text-xs px-3 py-1 whitespace-nowrap">
                                {notice ?? `⚠ ${error}`}
                            </div>
                        )}
                        {hud && hud.pendingBonuses > 0 && (
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-lg ring-2 ring-yellow-400" style={{ background: 'rgba(58,44,20,.95)' }}>
                                <span className="font-med text-sm text-yellow-300">Bonus{hud.pendingBonuses > 1 ? ` x${hud.pendingBonuses}` : ''} !</span>
                                {BONUSES.map((b) => (
                                    <button key={b.type} onClick={() => actions.chooseBonus(b.type)}
                                            className="px-2 py-1 rounded border text-[#43310f] bg-[#e8d9b0] border-[#8a6a2c] text-xs">
                                        {b.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {showChat && (
                        <ChatPanel messages={[...tutoMsgs, ...chat]} myId={player?.playerId} onSend={actions.sendChat}
                                   onSkipTuto={tutoStep >= 0 ? skipTuto : undefined}
                                   onNextTuto={tutoStep >= 0 ? nextTuto : undefined}
                                   tutoLast={tutoStep === TUTO_STEPS.length - 1}
                                   className={`w-[320px] shrink-0 min-h-0 ${hlTarget === 'chat' ? 'ring-4 ring-yellow-400 rounded-lg' : ''}`} />
                    )}
                    </div>

                    <div className={`kcd-panel-wood shrink-0 flex items-center gap-3 flex-wrap py-1.5 ${hlTarget === 'towers' ? 'ring-2 ring-inset ring-yellow-400' : ''}`}>
                        <span className="font-med text-sm text-[#e9d9b0] w-20 shrink-0">Tours</span>
                        <div className="flex flex-wrap gap-1.5">
                            {TOWERS.map((t) => (
                                <UnitChip
                                    key={t.type}
                                    icon={<TowerIcon type={t.type} size={32} />}
                                    label={t.label}
                                    cost={t.cost}
                                    selected={selectedTower === t.type}
                                    affordable={gold >= t.cost}
                                    onClick={() => { audio.play('ui_click', { volume: 0.5 }); setSelectedTower(t.type) }}
                                    title={`${t.label} — ${t.cost} or`}
                                />
                            ))}
                        </div>
                        <span className="text-[#8a6a2c] text-xs hidden lg:inline ml-2">Clique la grille pour poser · or partagé</span>
                    </div>
                </div>
            )}
        </div>
    )
}
