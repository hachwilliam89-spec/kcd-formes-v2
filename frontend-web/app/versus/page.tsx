'use client'

// Page multi VERSUS (rush) : lobby puis duel. Chacun défend SON château ; tu
// dépenses de l'or pour envoyer des ennemis chez l'adversaire (ce qui augmente
// ton revenu passif). Dernier château debout gagne. Voir docs/MULTIPLAYER.md.
//
// UX : plateau plein écran (flex-1) + barre d'action en bas (Tours + Envois en
// pastilles color-codées) → tout tient sans scroll, se réagence en fenêtre étroite.
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useVersus } from '@/hooks/useVersus'
import type { CoopCanvasHandle } from '@/components/coop/CoopCanvas'
import { TowerIcon, EnemyIcon } from '@/components/game/UnitIcon'
import { UnitChip } from '@/components/game/UnitChip'
import { ChatPanel, type ChatMessage } from '@/components/game/ChatPanel'
import { MiniBoard, TOWER_COLOR, TOWER_LABEL } from '@/components/game/MiniBoard'
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

// Bonus gagnés au nombre de kills (mêmes que le solo, voir BonusType).
const BONUSES: { type: string; label: string }[] = [
    { type: 'GOLD_INJECTION', label: '💰 Or' },
    { type: 'CASTLE_REPAIR', label: '🏰 Château' },
    { type: 'TOWER_REPAIR', label: '🔧 Tours' },
]

// Tuto guidé : le Héraut parle dans le chat, et chaque phrase surligne la zone
// (target) qu'elle décrit — plateau, barre des tours, envois, panneau, adversaire.
const TUTO_STEPS: { target: string; text: string }[] = [
    { target: 'board', text: "Bienvenue, seigneur ! Voici ton champ de bataille — protège ton château." },
    { target: 'towers', text: "Pose tes tours depuis cette barre, sur les cases hors du chemin." },
    { target: 'sends', text: "Dépense ton or ici pour envoyer des créatures chez l'adversaire — ton revenu grimpe." },
    { target: 'bonus', text: "Tous les 50 ennemis tués, un bonus t'attend dans ce panneau." },
    { target: 'opponent', text: "Garde un œil sur l'adversaire ici. Le dernier château debout l'emporte !" },
]

// Catalogue d'envois (miroir de SendCatalog côté backend) : coût / revenu / couleur.
const SENDS: { type: string; label: string; cost: number; income: number; color: string }[] = [
    { type: 'GOBLIN', label: 'Gobelin', cost: 70, income: 2, color: '#84cc16' },
    { type: 'ORC', label: 'Orc', cost: 150, income: 4, color: '#c2792e' },
    { type: 'TROLL', label: 'Troll', cost: 280, income: 7, color: '#9aa3b0' },
    { type: 'SAPEUR', label: 'Sapeur', cost: 320, income: 8, color: '#e0483f' },
    { type: 'DARK_KNIGHT', label: 'Chevalier noir', cost: 360, income: 9, color: '#6b5bd8' },
    { type: 'CHARIOT', label: 'Démon de givre', cost: 460, income: 11, color: '#3bb0e0' },
    { type: 'BOSS_WARLORD', label: 'Seigneur de guerre', cost: 850, income: 20, color: '#eab308' },
]

export default function VersusPage() {
    const router = useRouter()
    const { player, isAuthenticated, hasHydrated } = useAuthStore()
    const { connected, error, match, myHud, oppHud, winnerId, chat, actions } = useVersus(player?.playerId)

    const [code, setCode] = useState('')
    const [selectedTower, setSelectedTower] = useState<TowerType>('ARCHER')
    const [notice, setNotice] = useState<string | null>(null)
    const canvasRef = useRef<CoopCanvasHandle>(null)
    // Marge dispo à côté du plateau 4:3 → on n'affiche les panneaux latéraux que
    // s'il y a la place, sans jamais rogner la grille (prioritaire).
    const { ref: boardRef, gutter } = useHasGutter()
    const showChat = gutter >= 340            // chat collé à droite du plateau
    const showOpp = gutter >= 660             // + aperçu adversaire à gauche (grand écran)

    // Tuto guidé : au lancement, on dévoile une phrase du Héraut toutes les 5 s ;
    // la zone correspondante est surlignée le temps de son étape. Désactivable (retenu).
    const [tutoStep, setTutoStep] = useState(-1)
    const [tutoOff, setTutoOff] = useState(false)
    useEffect(() => { try { if (localStorage.getItem('kcd_tuto_off') === '1') setTutoOff(true) } catch { /* ignore */ } }, [])
    const skipTuto = () => { setTutoStep(-1); setTutoOff(true); try { localStorage.setItem('kcd_tuto_off', '1') } catch { /* ignore */ } }

    useEffect(() => {
        if (hasHydrated && !isAuthenticated) router.push('/')
    }, [hasHydrated, isAuthenticated, router])

    useEffect(() => {
        if (isAuthenticated) actions.connect()
        return () => actions.disconnect()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated])

    useEffect(() => {
        actions.setSnapshotHandler((snap) => canvasRef.current?.pushSnapshot(snap))
        return () => actions.setSnapshotHandler(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        if (match?.status === 'RUNNING') audio.music('game')
    }, [match?.status])

    // Auto-effacement des messages (notice de pose + erreurs serveur qui traînaient).
    useEffect(() => {
        if (!notice && !error) return
        const t = setTimeout(() => { setNotice(null); actions.clearError() }, 3000)
        return () => clearTimeout(t)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [notice, error])

    const running = match?.status === 'RUNNING'
    const finished = match?.status === 'FINISHED' || !!winnerId
    const isHost = useMemo(() => match?.players[0]?.playerId === player?.playerId, [match, player])
    const me = match?.players.find((p) => p.playerId === player?.playerId)
    const iWon = winnerId != null && winnerId === player?.playerId

    // Démarre / rejoue le tuto à chaque nouvelle partie (sauf s'il est désactivé).
    // L'avancement est manuel (bouton « Suivant ») pour laisser apprendre à son rythme.
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
        if (selectedTower === 'WALL' && !inCorridor) { setNotice('Le mur se pose sur le couloir.'); return }
        if (selectedTower !== 'WALL' && inCorridor) { setNotice('Pas de tour sur le couloir.'); return }
        actions.placeTower(selectedTower, x, y)
    }

    if (!hasHydrated || !isAuthenticated) return null

    const gold = myHud?.gold ?? 0
    const myRatio = myHud && myHud.castleMaxHp > 0 ? Math.max(0, myHud.castleHp / myHud.castleMaxHp) : 1
    const oppRatio = oppHud && oppHud.castleMaxHp > 0 ? Math.max(0, oppHud.castleHp / oppHud.castleMaxHp) : 1

    return (
        <div
            className="relative h-screen flex flex-col overflow-hidden text-[#f0e2c4] font-pixel p-2 md:p-3"
            onPointerDown={() => audio.resume()}
            style={{ backgroundImage: "url('/home-bg-alt.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
            <div className="absolute inset-0 bg-[#160f08]/85" />

            {/* ---- HUD : 3 zones (tes ressources · vague · adversaire + menu) ---- */}
            <div className="relative z-10 kcd-panel-wood flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-2 shrink-0 py-1">
                {/* Gauche : titre + tes ressources */}
                <div className="flex items-center gap-3">
                    <h1 className="font-med text-xl md:text-2xl text-yellow-400" style={{ textShadow: '2px 2px 0 #2f1c0d' }}>Versus</h1>
                    {running && myHud && (
                        <>
                            <span className="flex items-center gap-1 text-yellow-300 font-med text-xl">
                                <img src="/sprites/ui/icon_gold.png" alt="or" className="kcd-icon" /> {gold}
                                <span className="text-green-300 text-xs ml-1">+{myHud.income}/vague</span>
                            </span>
                            <span className="flex items-center gap-2">
                                <img src="/sprites/ui/icon_heart.png" alt="PV" className="kcd-icon" style={{ height: 18 }} />
                                <span className="w-24 h-4 overflow-hidden inline-block align-middle" style={{ background: '#2a1810', border: '2px solid #120a06' }}>
                                    <span className="h-full block transition-all" style={{ width: `${myRatio * 100}%`, background: myRatio > 0.3 ? '#5bbd3a' : '#d64545' }} />
                                </span>
                                <span className="font-med text-sm">{myHud.castleHp}</span>
                            </span>
                            <span className="font-med text-sm text-[#d8c193]" title="Tes ennemis tués">{myHud.score} 💀</span>
                        </>
                    )}
                </div>

                {/* Centre : vague */}
                {running && myHud && (
                    <span className="font-med text-yellow-300 text-2xl">Vague {myHud.wave}</span>
                )}

                {/* Droite : adversaire + menu */}
                <div className="flex items-center gap-3">
                    {running && oppHud && !showOpp && (
                        <div className="flex items-center gap-2 pr-3 border-r-2 border-[#4a3418]">
                            <span className="font-med text-xs text-[#d8c193]">{oppHud.score}💀 · V{oppHud.wave} · {oppHud.castleHp}</span>
                            <div className="w-20 h-4 overflow-hidden" style={{ background: '#2a1810', border: '2px solid #120a06' }}>
                                <div className="h-full transition-all" style={{ width: `${oppRatio * 100}%`, background: oppRatio > 0.3 ? '#5bbd3a' : '#d64545' }} />
                            </div>
                            <span className="text-[#e6b3a0] text-sm">⚔ {oppHud.username}{oppHud.defeated && ' 💀'}</span>
                        </div>
                    )}
                    {!connected && <span className="text-[#e9d9b0] text-xs">Connexion…</span>}
                    <span className="text-[#d8c193] text-sm hidden lg:inline">{player?.username}</span>
                    <button onClick={() => { actions.leave(); router.push('/game') }} className="kcd-btn text-xs py-1 px-3">← Solo</button>
                </div>
            </div>

            {/* ---- LOBBY ---- */}
            {!running && !finished && (
                <div className="relative z-10 flex-1 min-h-0 flex items-center justify-center overflow-y-auto">
                    <div className="kcd-panel-titled w-[440px] max-w-[94vw]">
                        <h2 className="kcd-title font-med text-center text-xl mb-4">Duel 1 contre 1</h2>

                        {!match && (
                            <div className="flex flex-col gap-3">
                                <p className="text-xs text-[#8a6a2c] text-center">
                                    Chacun défend son château. Dépense ton or pour envoyer des ennemis chez
                                    l&apos;adversaire (ça augmente ton revenu). Dernier debout gagne.
                                </p>
                                {error && <p className="text-xs text-[#8a3d12] text-center">⚠ {error}</p>}
                                <button onClick={actions.create} disabled={!connected} className="kcd-btn font-med text-lg py-2 disabled:opacity-50">
                                    Créer un duel
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
                                    <p className="text-xs text-[#8a6a2c]">Code du duel</p>
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
                                            En attente d&apos;un adversaire…
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
                                <button onClick={actions.leave} className="kcd-btn text-xs py-1 opacity-90">Quitter le lobby</button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ---- DUEL EN COURS : plateau plein écran + barre d'action ---- */}
            {running && (
                <div className="relative z-10 flex-1 min-h-0 flex flex-col gap-2">
                    {/* Adversaire (gauche) · plateau (centre, prioritaire) · chat (droite) */}
                    <div ref={boardRef} className="flex-1 min-h-0 flex gap-2 justify-center">
                    {showOpp && (
                        <div className={`w-[300px] shrink-0 min-h-0 flex flex-col gap-2 rounded-lg ${hlTarget === 'bonus' ? 'ring-4 ring-yellow-400' : ''}`}>
                        {/* Bonus : dans le panneau plutôt qu'en surimpression du plateau */}
                        {myHud && myHud.pendingBonuses > 0 && (
                            <div className="kcd-panel-titled ring-2 ring-yellow-400 shrink-0">
                                <h3 className="kcd-title font-med text-center text-lg text-yellow-700">
                                    Bonus{myHud.pendingBonuses > 1 ? ` x${myHud.pendingBonuses}` : ''} !
                                </h3>
                                <div className="flex flex-col gap-2 mt-2">
                                    {BONUSES.map((b) => (
                                        <button key={b.type} onClick={() => actions.chooseBonus(b.type)} className="kcd-btn text-sm py-2">
                                            {b.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {oppHud && (
                        <aside className={`kcd-panel-titled flex-1 min-h-0 flex flex-col gap-3 overflow-hidden ${hlTarget === 'opponent' ? 'ring-4 ring-yellow-400' : ''}`}>
                            <h3 className="kcd-title font-med text-center text-lg truncate">⚔ {oppHud.username}{oppHud.defeated && ' 💀'}</h3>
                            <div>
                                <div className="flex justify-between text-xs text-[#8a6a2c] mb-1"><span>Château</span><span>{oppHud.castleHp}</span></div>
                                <div className="h-4 overflow-hidden" style={{ background: '#2a1810', border: '2px solid #120a06' }}>
                                    <div className="h-full transition-all" style={{ width: `${oppRatio * 100}%`, background: oppRatio > 0.3 ? '#5bbd3a' : '#d64545' }} />
                                </div>
                            </div>
                            <div className="text-center text-xs text-[#8a6a2c]">Vague {oppHud.wave} · {oppHud.score} tués</div>
                            {/* Aperçu live de sa grille (mini-map) : château coloré selon PV,
                                ennemis par type, tours par type. */}
                            <div className="flex-1 min-h-0 flex items-center justify-center">
                                <MiniBoard enemies={oppHud.enemies} towers={oppHud.towers} castleRatio={oppRatio} className="w-full h-full" />
                            </div>
                            {/* Légende des tours présentes chez l'adversaire → savoir quoi lui envoyer. */}
                            {(() => {
                                const types = [...new Set((oppHud.towers ?? []).map((t) => t.type))]
                                return (
                                    <div className="flex flex-wrap gap-x-2 gap-y-0.5 justify-center">
                                        {types.length === 0 ? (
                                            <span className="text-[10px] text-[#8a6a2c] italic">Aucune tour posée</span>
                                        ) : types.map((t) => (
                                            <span key={t} className="inline-flex items-center gap-1 text-[10px] text-[#8a6a2c]">
                                                <span style={{ width: 8, height: 8, background: TOWER_COLOR[t] ?? '#ccc', display: 'inline-block', borderRadius: 2, border: '1px solid #1a1109' }} />
                                                {TOWER_LABEL[t] ?? t}
                                            </span>
                                        ))}
                                    </div>
                                )
                            })()}
                        </aside>
                        )}
                        </div>
                    )}
                    <div className={`relative min-h-0 rounded-lg overflow-hidden ${showChat ? 'h-full aspect-[5/4] shrink-0' : 'flex-1'} ${hlTarget === 'board' ? 'ring-4 ring-inset ring-yellow-400' : ''}`} style={{ border: '2px solid #2f1c0d' }}>
                        <CoopCanvas ref={canvasRef} onCellClick={place} selectedTower={selectedTower} />
                        {/* Toast messages, flottant sur le plateau. */}
                        {(notice || error) && (
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-20 kcd-panel text-xs px-3 py-1 whitespace-nowrap">
                                {notice ?? `⚠ ${error}`}
                            </div>
                        )}
                        {/* Bonus : bulle flottante en repli quand le panneau latéral n'est pas affiché. */}
                        {!showOpp && myHud && myHud.pendingBonuses > 0 && (
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-lg ring-2 ring-yellow-400" style={{ background: 'rgba(58,44,20,.95)' }}>
                                <span className="font-med text-sm text-yellow-300">Bonus{myHud.pendingBonuses > 1 ? ` x${myHud.pendingBonuses}` : ''} !</span>
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
                                   className="w-[320px] shrink-0 min-h-0" />
                    )}
                    </div>

                    {/* Barre d'action — deux lignes alignées : Tours (+ Bonus) / Envoyer */}
                    <div className="kcd-panel-wood shrink-0 flex flex-col gap-1 py-1.5">
                        {/* Ligne 1 : Tours + Bonus */}
                        <div className={`flex items-center gap-3 flex-wrap rounded-md ${hlTarget === 'towers' ? 'ring-2 ring-yellow-400' : ''}`}>
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
                        </div>

                        {/* Ligne 2 : Envoyer */}
                        <div className={`flex items-center gap-3 flex-wrap rounded-md ${hlTarget === 'sends' ? 'ring-2 ring-yellow-400' : ''}`}>
                            <span className="font-med text-sm text-[#e9d9b0] w-20 shrink-0">Envoyer</span>
                            <div className="flex flex-wrap gap-1.5">
                                {SENDS.map((s) => (
                                    <UnitChip
                                        key={s.type}
                                        icon={<EnemyIcon type={s.type} size={32} />}
                                        label={s.label}
                                        cost={s.cost}
                                        income={s.income}
                                        affordable={gold >= s.cost}
                                        disabled={gold < s.cost}
                                        onClick={() => actions.sendCreep(s.type)}
                                        title={`${s.label} — ${s.cost} or · revenu +${s.income}/vague`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ---- FIN DU DUEL ---- */}
            {finished && (
                <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center font-pixel p-4">
                    <div className="kcd-panel w-[360px] max-w-[92vw] text-center flex flex-col items-center gap-3">
                        <img src={iWon ? '/sprites/ui/icon_trophy.png' : '/sprites/ui/icon_defeat.png'} alt="" className="kcd-icon" style={{ height: 64 }} />
                        <h2 className={`font-med text-2xl ${iWon ? 'text-[#3a7a12]' : 'text-[#8a3d12]'}`}>
                            {iWon ? 'Victoire !' : 'Défaite'}
                        </h2>
                        <p className="text-sm text-[#4a361a]">
                            {iWon ? 'Ton château a tenu plus longtemps.' : 'Ton château est tombé le premier.'}
                        </p>
                        {myHud && oppHud && (
                            <p className="text-xs text-[#5a3d16]">
                                Toi : vague {myHud.wave}, {myHud.score} tués — {oppHud.username} : vague {oppHud.wave}, {oppHud.score} tués
                            </p>
                        )}
                        <button onClick={() => { actions.leave(); router.push('/versus') }} className="kcd-btn font-med text-lg py-2 w-full mt-1">
                            Rejouer
                        </button>
                        <button onClick={() => { actions.leave(); router.push('/game') }} className="kcd-btn text-sm py-1 w-full">
                            Retour au solo
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
