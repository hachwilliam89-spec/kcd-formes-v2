'use client'

// Page multi VERSUS (rush) : lobby puis duel. Chacun défend SON château ; tu
// dépenses de l'or pour envoyer des ennemis chez l'adversaire (ce qui augmente
// ton revenu passif). Dernier château debout gagne. Voir docs/MULTIPLAYER.md.
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useVersus } from '@/hooks/useVersus'
import type { CoopCanvasHandle } from '@/components/coop/CoopCanvas'
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
const TOWERS: { type: TowerType; label: string; cost: number }[] = [
    { type: 'ARCHER', label: 'Archer', cost: 50 },
    { type: 'MAGE', label: 'Mage', cost: 100 },
    { type: 'CATAPULT', label: 'Catapulte', cost: 150 },
    { type: 'BALLISTA', label: 'Baliste', cost: 200 },
    { type: 'WALL', label: 'Mur', cost: 35 },
]

// Bonus gagnés au nombre de kills (mêmes que le solo, voir BonusType).
const BONUSES: { type: string; label: string; desc: string }[] = [
    { type: 'GOLD_INJECTION', label: '💰 Trésor de guerre', desc: 'Or bonus selon la vague' },
    { type: 'CASTLE_REPAIR', label: '🏰 Réparer le château', desc: 'Château au maximum' },
    { type: 'TOWER_REPAIR', label: '🔧 Réparer les tours', desc: 'Toutes tes tours au max' },
]

// Catalogue d'envois (miroir de SendCatalog côté backend) : coût / bonus de revenu.
const SENDS: { type: string; label: string; cost: number; income: number }[] = [
    { type: 'GOBLIN', label: 'Gobelin', cost: 70, income: 2 },
    { type: 'ORC', label: 'Orc', cost: 150, income: 4 },
    { type: 'TROLL', label: 'Troll', cost: 280, income: 7 },
    { type: 'SAPEUR', label: 'Sapeur', cost: 320, income: 8 },
    { type: 'DARK_KNIGHT', label: 'Chevalier noir', cost: 360, income: 9 },
    { type: 'CHARIOT', label: 'Démon de givre', cost: 460, income: 11 },
    { type: 'BOSS_WARLORD', label: 'Seigneur de guerre', cost: 850, income: 20 },
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
        // Nettoyage au démontage : coupe le client STOMP + watchdog, sinon une
        // instance zombie persiste (Fast Refresh / navigation) et se superpose.
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

    const myRatio = myHud && myHud.castleMaxHp > 0 ? Math.max(0, myHud.castleHp / myHud.castleMaxHp) : 1
    const oppRatio = oppHud && oppHud.castleMaxHp > 0 ? Math.max(0, oppHud.castleHp / oppHud.castleMaxHp) : 1

    return (
        <div
            className="relative min-h-screen lg:h-screen flex flex-col lg:overflow-hidden text-[#f0e2c4] font-pixel p-3 md:p-4"
            onPointerDown={() => audio.resume()}
            style={{ backgroundImage: "url('/home-bg-alt.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
        >
            <div className="absolute inset-0 bg-[#160f08]/85" />

            {/* Barre du haut */}
            <div className="relative z-10 kcd-panel-wood flex flex-wrap justify-between items-center gap-y-2 mb-3 md:mb-4 shrink-0">
                <h1 className="text-2xl md:text-3xl font-med text-yellow-400" style={{ textShadow: '2px 2px 0 #2f1c0d' }}>
                    Versus — KCD Formes v2
                </h1>
                <div className="flex flex-wrap items-center gap-3 md:gap-4">
                    {running && myHud && (
                        <>
                            <span className="font-med text-yellow-300 text-lg">Vague {myHud.wave}</span>
                            <span className="font-med text-sm text-[#d8c193]" title="Tes ennemis tués">{myHud.score} 💀</span>
                            <div className="flex items-center gap-2">
                                <img src="/sprites/ui/icon_heart.png" alt="PV" className="kcd-icon" style={{ height: 18 }} />
                                <div className="w-28 h-4 overflow-hidden" style={{ background: '#2a1810', border: '2px solid #120a06' }}>
                                    <div className="h-full transition-all" style={{ width: `${myRatio * 100}%`, background: myRatio > 0.3 ? '#5bbd3a' : '#d64545' }} />
                                </div>
                                <span className="font-med text-sm">{myHud.castleHp}/{myHud.castleMaxHp}</span>
                            </div>
                        </>
                    )}

                    {/* État de l'adversaire dans la barre du haut (toujours visible,
                        pas de scroll dans la colonne de droite). */}
                    {running && oppHud && (
                        <div className="flex items-center gap-2 pl-3 border-l-2 border-[#4a3418]">
                            <span className="text-[#e6b3a0] text-sm">⚔ {oppHud.username}{oppHud.defeated && ' 💀'}</span>
                            <div className="w-24 h-4 overflow-hidden" style={{ background: '#2a1810', border: '2px solid #120a06' }}>
                                <div className="h-full transition-all" style={{ width: `${oppRatio * 100}%`, background: oppRatio > 0.3 ? '#5bbd3a' : '#d64545' }} />
                            </div>
                            <span className="font-med text-xs text-[#d8c193]">{oppHud.castleHp} · V{oppHud.wave} · {oppHud.score}💀</span>
                        </div>
                    )}

                    <span className="text-[#d8c193] text-sm">{player?.username}</span>
                    <button onClick={() => { actions.leave(); router.push('/game') }} className="kcd-btn text-xs py-1 px-3">← Solo</button>
                </div>
            </div>

            {(!connected || error) && (
                <div className="relative z-10 mb-2 text-sm">
                    {!connected && <span className="text-[#e9d9b0]">Connexion au serveur…</span>}
                    {error && <span className="text-red-300 ml-2">⚠ {error}</span>}
                </div>
            )}

            {/* ---- LOBBY ---- */}
            {!running && !finished && (
                <div className="relative z-10 flex-1 flex items-center justify-center">
                    <div className="kcd-panel-titled w-[440px] max-w-[94vw]">
                        <h2 className="kcd-title font-med text-center text-xl mb-4">Duel 1 contre 1</h2>

                        {!match && (
                            <div className="flex flex-col gap-3">
                                <p className="text-xs text-[#8a6a2c] text-center">
                                    Chacun défend son château. Dépense ton or pour envoyer des ennemis chez
                                    l&apos;adversaire (ça augmente ton revenu). Dernier debout gagne.
                                </p>
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

            {/* ---- DUEL EN COURS ---- */}
            {running && (
                <div className="relative z-10 flex flex-col lg:flex-row gap-4 lg:flex-1 lg:min-h-0">
                    <div className="w-full aspect-[4/3] lg:aspect-auto lg:flex-1 min-w-0 lg:min-h-0 rounded-lg overflow-hidden" style={{ border: '2px solid #2f1c0d' }}>
                        <CoopCanvas ref={canvasRef} onCellClick={place} />
                    </div>

                    <div className="flex flex-col gap-3 w-full lg:w-60 shrink-0 lg:overflow-y-auto">
                        {/* Or disponible, à portée des boutons de dépense. */}
                        <div className="kcd-panel flex items-center justify-center gap-2 py-2">
                            <img src="/sprites/ui/icon_gold.png" alt="or" className="kcd-icon" />
                            <span className="font-med text-yellow-300 text-2xl">{myHud?.gold ?? 0}</span>
                            <span className="text-green-700 text-xs font-med">+{myHud?.income ?? 0}/vague</span>
                        </div>

                        {/* Bonus gagnés au nombre de kills (choix non bloquant) */}
                        {myHud && myHud.pendingBonuses > 0 && (
                            <div className="kcd-panel-titled ring-2 ring-yellow-400">
                                <h3 className="kcd-title font-med text-center text-base mb-2">
                                    Bonus ! {myHud.pendingBonuses > 1 && `(x${myHud.pendingBonuses})`}
                                </h3>
                                <div className="flex flex-col gap-2">
                                    {BONUSES.map((b) => (
                                        <button key={b.type} onClick={() => actions.chooseBonus(b.type)}
                                                className="text-left px-2 py-1 rounded bg-[#cdb987] hover:bg-[#d8c79a] text-[#4a361a]">
                                            <span className="block text-xs font-semibold">{b.label}</span>
                                            <span className="block text-[10px] opacity-80">{b.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Envois (rush) */}
                        <div className="kcd-panel-titled">
                            <h3 className="kcd-title font-med text-center text-base mb-2">Envoyer</h3>
                            <div className="flex flex-col gap-2">
                                {SENDS.map((s) => (
                                    <button
                                        key={s.type}
                                        onClick={() => actions.sendCreep(s.type)}
                                        disabled={!myHud || myHud.gold < s.cost}
                                        className="kcd-btn text-sm flex justify-between items-center disabled:opacity-40"
                                        title={`Coût ${s.cost} or · revenu +${s.income}/vague`}
                                    >
                                        <span>{s.label}</span>
                                        <span className="font-med text-xs">{s.cost}<span className="text-green-300 ml-1">+{s.income}</span></span>
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-[#8a6a2c] mt-2 text-center">Débarque chez l&apos;adversaire · gonfle ton revenu.</p>
                        </div>

                        {/* Tours */}
                        <div className="kcd-panel-titled">
                            <h3 className="kcd-title font-med text-center text-base mb-2">Tours</h3>
                            <div className="flex flex-col gap-2">
                                {TOWERS.map((t) => (
                                    <button
                                        key={t.type}
                                        onClick={() => { audio.play('ui_click', { volume: 0.5 }); setSelectedTower(t.type) }}
                                        className={`kcd-btn text-sm flex justify-between items-center ${selectedTower === t.type ? 'ring-2 ring-yellow-400' : ''}`}
                                    >
                                        <span>{t.label}</span>
                                        <span className="font-med text-base">{t.cost}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {notice && <div className="kcd-panel text-xs text-center">{notice}</div>}
                        {error && <div className="kcd-panel text-xs text-center text-[#8a3d12]">⚠ {error}</div>}
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
