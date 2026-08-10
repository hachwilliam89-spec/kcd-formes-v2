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
import { isCorridorCell } from '@/components/game/constants'
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
    const { connected, error, match, myHud, oppHud, winnerId, actions } = useVersus(player?.playerId)

    const [code, setCode] = useState('')
    const [selectedTower, setSelectedTower] = useState<TowerType>('ARCHER')
    const [notice, setNotice] = useState<string | null>(null)
    const canvasRef = useRef<CoopCanvasHandle>(null)

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

    function place(x: number, y: number) {
        if (!running) return
        setNotice(null)
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

            {/* ---- HUD compact (une ligne, se réagence) ---- */}
            <div className="relative z-10 kcd-panel-wood flex flex-wrap items-center gap-x-4 gap-y-2 mb-2 shrink-0 py-2">
                <h1 className="font-med text-xl md:text-2xl text-yellow-400" style={{ textShadow: '2px 2px 0 #2f1c0d' }}>Versus</h1>

                {running && myHud && (
                    <>
                        <span className="flex items-center gap-1 text-yellow-300 font-med text-xl">
                            <img src="/sprites/ui/icon_gold.png" alt="or" className="kcd-icon" /> {gold}
                            <span className="text-green-300 text-xs ml-1">+{myHud.income}/vague</span>
                        </span>
                        <span className="font-med text-yellow-300 text-lg">Vague {myHud.wave}</span>
                        <span className="font-med text-sm text-[#d8c193]" title="Tes ennemis tués">{myHud.score} 💀</span>
                        <div className="flex items-center gap-2">
                            <img src="/sprites/ui/icon_heart.png" alt="PV" className="kcd-icon" style={{ height: 18 }} />
                            <div className="w-24 h-4 overflow-hidden" style={{ background: '#2a1810', border: '2px solid #120a06' }}>
                                <div className="h-full transition-all" style={{ width: `${myRatio * 100}%`, background: myRatio > 0.3 ? '#5bbd3a' : '#d64545' }} />
                            </div>
                            <span className="font-med text-sm">{myHud.castleHp}</span>
                        </div>
                    </>
                )}

                {running && oppHud && (
                    <div className="flex items-center gap-2 pl-3 border-l-2 border-[#4a3418]">
                        <span className="text-[#e6b3a0] text-sm">⚔ {oppHud.username}{oppHud.defeated && ' 💀'}</span>
                        <div className="w-20 h-4 overflow-hidden" style={{ background: '#2a1810', border: '2px solid #120a06' }}>
                            <div className="h-full transition-all" style={{ width: `${oppRatio * 100}%`, background: oppRatio > 0.3 ? '#5bbd3a' : '#d64545' }} />
                        </div>
                        <span className="font-med text-xs text-[#d8c193]">{oppHud.castleHp} · V{oppHud.wave} · {oppHud.score}💀</span>
                    </div>
                )}

                <div className="ml-auto flex items-center gap-3">
                    {!connected && <span className="text-[#e9d9b0] text-xs">Connexion…</span>}
                    <span className="text-[#d8c193] text-sm hidden sm:inline">{player?.username}</span>
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
                    {/* Plateau */}
                    <div className="relative flex-1 min-h-0 rounded-lg overflow-hidden" style={{ border: '2px solid #2f1c0d' }}>
                        <CoopCanvas ref={canvasRef} onCellClick={place} selectedTower={selectedTower} />
                        {/* Toast messages, flottant sur le plateau. */}
                        {(notice || error) && (
                            <div className="absolute left-1/2 -translate-x-1/2 bottom-2 z-20 kcd-panel text-xs px-3 py-1 whitespace-nowrap">
                                {notice ?? `⚠ ${error}`}
                            </div>
                        )}
                        {/* Bonus au nombre de kills : bulle flottante (overlay, ne pousse pas le layout). */}
                        {myHud && myHud.pendingBonuses > 0 && (
                            <div className="absolute top-2 right-2 z-20 flex items-center gap-2 px-3 py-2 rounded-lg ring-2 ring-yellow-400" style={{ background: 'rgba(58,44,20,.95)' }}>
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

                    {/* Barre d'action — deux lignes alignées : Tours (+ Bonus) / Envoyer */}
                    <div className="kcd-panel-wood shrink-0 flex flex-col gap-2 py-2">
                        {/* Ligne 1 : Tours + Bonus */}
                        <div className="flex items-center gap-3 flex-wrap">
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
                        <div className="flex items-center gap-3 flex-wrap">
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
