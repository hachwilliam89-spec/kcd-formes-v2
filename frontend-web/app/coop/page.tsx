'use client'

// Page multijoueur COOP : lobby (créer / rejoindre par code / prêt / démarrer)
// puis partie en direct partagée à deux (or commun, boucle autoritaire serveur).
// Réutilise la charte pixel du solo (kcd-panel / kcd-btn). Voir docs/MULTIPLAYER.md.
import { useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { useCoop } from '@/hooks/useCoop'
import type { CoopCanvasHandle } from '@/components/coop/CoopCanvas'
import { isCorridorCell } from '@/components/game/constants'
import { audio } from '@/lib/audio'

// Phaser ne peut pas être rendu côté serveur (accède à window) → import dynamique.
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
    { type: 'TOWER_REPAIR', label: '🔧 Réparer les tours', desc: 'Toutes les tours au max' },
]

export default function CoopPage() {
    const router = useRouter()
    const { player, isAuthenticated, hasHydrated } = useAuthStore()
    const { connected, error, match, hud, actions } = useCoop()

    const [code, setCode] = useState('')
    const [selectedTower, setSelectedTower] = useState<TowerType>('ARCHER')
    const [notice, setNotice] = useState<string | null>(null)
    const canvasRef = useRef<CoopCanvasHandle>(null)

    // Branche le plateau Phaser sur le flux de snapshots serveur.
    useEffect(() => {
        actions.setSnapshotHandler((snap) => canvasRef.current?.pushSnapshot(snap))
        return () => actions.setSnapshotHandler(null)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Garde d'auth : attendre la réhydratation avant de rediriger (cf. /game).
    useEffect(() => {
        if (hasHydrated && !isAuthenticated) router.push('/')
    }, [hasHydrated, isAuthenticated, router])

    // Connexion STOMP à l'arrivée sur la page.
    useEffect(() => {
        if (isAuthenticated) actions.connect()
        return () => actions.disconnect() // évite l'instance zombie au démontage
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated])

    // Musique de combat une fois la partie lancée.
    useEffect(() => {
        if (match?.status === 'RUNNING') audio.music('game')
    }, [match?.status])

    const running = match?.status === 'RUNNING'
    const isHost = useMemo(
        () => match?.players[0]?.playerId === player?.playerId,
        [match, player],
    )
    const me = match?.players.find((p) => p.playerId === player?.playerId)

    function place(x: number, y: number) {
        if (!running) return
        setNotice(null)
        const inCorridor = isCorridorCell(x, y)
        if (selectedTower === 'WALL' && !inCorridor) {
            setNotice('Le mur se pose sur le couloir des ennemis.')
            return
        }
        if (selectedTower !== 'WALL' && inCorridor) {
            setNotice('Impossible de poser une tour sur le couloir.')
            return
        }
        actions.placeTower(selectedTower, x, y)
    }

    if (!hasHydrated || !isAuthenticated) return null

    const castleRatio = hud && hud.castleMaxHp > 0 ? Math.max(0, hud.castleHp / hud.castleMaxHp) : 1

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
                    Coop — KCD Formes v2
                </h1>
                <div className="flex flex-wrap items-center gap-3 md:gap-4">
                    {running && hud && (
                        <>
                            <span className="font-med text-yellow-300 text-lg">Vague {hud.wave}</span>
                            <span className="flex items-center gap-1 text-yellow-300 font-med text-xl">
                                <img src="/sprites/ui/icon_gold.png" alt="or" className="kcd-icon" /> {hud.gold}
                            </span>
                            <div className="flex items-center gap-2">
                                <img src="/sprites/ui/icon_heart.png" alt="PV" className="kcd-icon" style={{ height: 18 }} />
                                <div className="w-32 h-4 overflow-hidden" style={{ background: '#2a1810', border: '2px solid #120a06' }}>
                                    <div className="h-full transition-all" style={{
                                        width: `${castleRatio * 100}%`,
                                        background: castleRatio > 0.3 ? '#5bbd3a' : '#d64545',
                                    }} />
                                </div>
                                <span className="font-med text-sm">{hud.castleHp}/{hud.castleMaxHp}</span>
                            </div>
                        </>
                    )}
                    <span className="text-[#d8c193] text-sm">{player?.username}</span>
                    <button onClick={() => { actions.leave(); router.push('/game') }} className="kcd-btn text-xs py-1 px-3">
                        ← Solo
                    </button>
                </div>
            </div>

            {/* Statut connexion + erreurs serveur */}
            {(!connected || error) && (
                <div className="relative z-10 mb-2 text-sm">
                    {!connected && <span className="text-[#e9d9b0]">Connexion au serveur…</span>}
                    {error && <span className="text-red-300 ml-2">⚠ {error}</span>}
                </div>
            )}

            {/* ---- LOBBY ---- */}
            {!running && (
                <div className="relative z-10 flex-1 flex items-center justify-center">
                    <div className="kcd-panel-titled w-[440px] max-w-[94vw]">
                        <h2 className="kcd-title font-med text-center text-xl mb-4">Jouer à deux</h2>

                        {!match && (
                            <div className="flex flex-col gap-3">
                                <p className="text-xs text-[#8a6a2c] text-center">
                                    Défendez le même château, or partagé. Créez une partie et donnez le code
                                    à un ami — ou rejoignez la sienne.
                                </p>
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
                                    <button
                                        onClick={() => actions.setReady(!me?.ready)}
                                        className={`kcd-btn flex-1 py-2 ${me?.ready ? 'ring-2 ring-green-500' : ''}`}
                                    >
                                        {me?.ready ? '✓ Prêt' : 'Je suis prêt'}
                                    </button>
                                    {isHost && (
                                        <button
                                            onClick={actions.start}
                                            disabled={!match.canStart}
                                            className="kcd-btn flex-1 py-2 font-med disabled:opacity-40"
                                        >
                                            Démarrer
                                        </button>
                                    )}
                                </div>
                                {isHost && !match.canStart && (
                                    <p className="text-[11px] text-[#8a6a2c] text-center">
                                        Il faut deux joueurs prêts pour démarrer.
                                    </p>
                                )}
                                <button onClick={actions.leave} className="kcd-btn text-xs py-1 opacity-90">
                                    Quitter le lobby
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ---- PARTIE EN COURS ---- */}
            {running && (
                <div className="relative z-10 flex flex-col lg:flex-row gap-4 lg:flex-1 lg:min-h-0">
                    <div className="w-full aspect-[4/3] lg:aspect-auto lg:flex-1 min-w-0 lg:min-h-0 rounded-lg overflow-hidden" style={{ border: '2px solid #2f1c0d' }}>
                        <CoopCanvas ref={canvasRef} onCellClick={place} />
                    </div>

                    <div className="flex flex-col gap-3 w-full lg:w-56 shrink-0 lg:overflow-y-auto">
                        {/* Or partagé disponible, à portée des boutons de dépense. */}
                        <div className="kcd-panel flex items-center justify-center gap-2 py-2">
                            <img src="/sprites/ui/icon_gold.png" alt="or" className="kcd-icon" />
                            <span className="font-med text-yellow-300 text-2xl">{hud?.gold ?? 0}</span>
                        </div>

                        {/* Bonus gagnés au nombre de kills (partagé, choix non bloquant) */}
                        {hud && hud.pendingBonuses > 0 && (
                            <div className="kcd-panel-titled ring-2 ring-yellow-400">
                                <h3 className="kcd-title font-med text-center text-base mb-2">
                                    Bonus ! {hud.pendingBonuses > 1 && `(x${hud.pendingBonuses})`}
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

                        <div className="kcd-panel-titled">
                            <h3 className="kcd-title font-med text-center text-lg mb-3">Tours</h3>
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
                            <p className="text-[11px] text-[#8a6a2c] mt-2 text-center">
                                Clique la grille pour poser. Or partagé.
                            </p>
                        </div>

                        {notice && <div className="kcd-panel text-xs text-center">{notice}</div>}
                        {error && <div className="kcd-panel text-xs text-center text-[#8a3d12]">⚠ {error}</div>}

                        <div className="kcd-panel text-xs text-center text-[#5a3d16]">
                            Coéquipiers : {match.players.map((p) => p.username).join(', ')}
                        </div>

                        <button onClick={() => { actions.leave(); router.push('/game') }} className="kcd-btn text-sm py-1">
                            Quitter la partie
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
