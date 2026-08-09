'use client'

// Test du Jalon 3a — boucle autoritaire live. Deux comptes : l'un crée, l'autre
// rejoint par code, les deux se mettent « prêt », puis « Démarrer ». Les ennemis
// spawnent et avancent sur le serpentin, rendus À L'IDENTIQUE et EN MÊME TEMPS
// sur les deux écrans (snapshots 15 Hz interpolés). À supprimer plus tard.
import { useEffect, useRef, useState } from 'react'
import { Client, type StompSubscription } from '@stomp/stompjs'
import { wsBaseUrl } from '@/lib/ws'
import { WAYPOINTS, GRID_W, GRID_H } from '@/components/game/constants'

const CELL = 22
const W = GRID_W * CELL
const H = GRID_H * CELL

type Enemy = { id: string; type: string; x: number; y: number; hp: number; maxHp: number }
type TowerV = { id: string; type: string; x: number; y: number; level: number }
type Shot = { fromX: number; fromY: number; toX: number; toY: number }
type Snapshot = { tick: number; wave: number; gold: number; castleHp: number; castleMaxHp: number; status: string; enemies: Enemy[]; towers: TowerV[]; shots: Shot[] }

const TOWER_COLORS: Record<string, string> = {
    ARCHER: '#3fa34d', MAGE: '#8e5bd8', CATAPULT: '#d2691e', BALLISTA: '#9aa0a6', WALL: '#8a7a5a',
}
const TOWER_TYPES = ['ARCHER', 'MAGE', 'CATAPULT', 'WALL']

export default function GameTestPage() {
    const [status, setStatus] = useState('déconnecté')
    const [code, setCode] = useState('')
    const [matchId, setMatchId] = useState<string | null>(null)
    const [towerType, setTowerType] = useState('ARCHER')
    const [hud, setHud] = useState({ wave: 0, gold: 0, castleHp: 0, castleMaxHp: 0, status: '' })
    const [err, setErr] = useState('')
    const matchIdRef = useRef<string | null>(null)
    const clientRef = useRef<Client | null>(null)
    const lobbySubRef = useRef<StompSubscription | null>(null)
    const stateSubRef = useRef<StompSubscription | null>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    // Deux derniers snapshots pour interpoler.
    const prevRef = useRef<{ snap: Snapshot; t: number } | null>(null)
    const currRef = useRef<{ snap: Snapshot; t: number } | null>(null)

    function subscribeMatch(id: string) {
        const client = clientRef.current
        if (!client || matchIdRef.current === id) return
        setMatchId(id)
        matchIdRef.current = id
        lobbySubRef.current = client.subscribe(`/topic/match/${id}`, () => {})
        stateSubRef.current = client.subscribe(`/topic/match/${id}/state`, (m) => {
            const snap: Snapshot = JSON.parse(m.body)
            prevRef.current = currRef.current
            currRef.current = { snap, t: performance.now() }
            setHud({ wave: snap.wave, gold: snap.gold, castleHp: snap.castleHp, castleMaxHp: snap.castleMaxHp, status: snap.status })
        })
    }

    function connect() {
        const token = localStorage.getItem('token')
        if (!token) { setStatus('❌ connecte-toi d’abord'); return }
        const client = new Client({
            brokerURL: wsBaseUrl(),
            connectHeaders: { Authorization: `Bearer ${token}` },
            reconnectDelay: 0,
            onConnect: () => {
                setStatus('connecté ✅')
                client.subscribe('/user/queue/match', (m) => {
                    const st = JSON.parse(m.body)
                    setCode(st.code)
                    subscribeMatch(st.id)
                })
                // Motifs de refus (pose invalide, or insuffisant…) renvoyés par le serveur.
                client.subscribe('/user/queue/errors', (m) => setErr('❌ ' + JSON.parse(m.body).error))
            },
            onStompError: (f) => setStatus('erreur : ' + (f.headers['message'] ?? '')),
            onWebSocketError: () => setStatus('erreur WS'),
        })
        clientRef.current = client
        client.activate()
    }

    const send = (dest: string, body?: object) =>
        clientRef.current?.publish({ destination: dest, body: body ? JSON.stringify(body) : '{}' })

    function onCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
        const id = matchIdRef.current
        if (!id) return
        setErr('')
        // Ratio → grille : robuste même si le canvas est redimensionné/zoomé.
        const rect = e.currentTarget.getBoundingClientRect()
        const cx = Math.floor((e.clientX - rect.left) / rect.width * GRID_W)
        const cy = Math.floor((e.clientY - rect.top) / rect.height * GRID_H)
        send(`/app/match/${id}/tower`, { type: towerType, x: cx, y: cy })
    }

    // Boucle de rendu : interpole entre les deux derniers snapshots.
    useEffect(() => {
        let raf = 0
        const ctx = canvasRef.current?.getContext('2d')
        const draw = () => {
            raf = requestAnimationFrame(draw)
            if (!ctx) return
            ctx.clearRect(0, 0, W, H)
            // fond + chemin
            ctx.fillStyle = '#2a1f16'; ctx.fillRect(0, 0, W, H)
            ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = CELL * 0.7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
            ctx.beginPath()
            WAYPOINTS.forEach((w, i) => {
                const px = w.x * CELL + CELL / 2, py = w.y * CELL + CELL / 2
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
            })
            ctx.stroke()
            // château (fin du chemin)
            const end = WAYPOINTS[WAYPOINTS.length - 1]
            ctx.fillStyle = '#c9a24b'
            ctx.fillRect(end.x * CELL, end.y * CELL, CELL, CELL)

            // tours (dernier snapshot, pas d'interpolation — statiques)
            for (const t of currRef.current?.snap.towers ?? []) {
                ctx.fillStyle = TOWER_COLORS[t.type] ?? '#ccc'
                ctx.fillRect(t.x * CELL + 3, t.y * CELL + 3, CELL - 6, CELL - 6)
            }

            // tirs du tick (traits tour → ennemi)
            ctx.strokeStyle = 'rgba(255,235,130,0.9)'
            ctx.lineWidth = 1.5
            for (const sh of currRef.current?.snap.shots ?? []) {
                ctx.beginPath()
                ctx.moveTo(sh.fromX * CELL + CELL / 2, sh.fromY * CELL + CELL / 2)
                ctx.lineTo(sh.toX * CELL + CELL / 2, sh.toY * CELL + CELL / 2)
                ctx.stroke()
            }

            // ennemis interpolés
            const curr = currRef.current, prev = prevRef.current
            if (curr) {
                const alpha = prev ? Math.min(1, (performance.now() - curr.t) / 66) : 1
                const prevById = new Map((prev?.snap.enemies ?? []).map((e) => [e.id, e]))
                for (const e of curr.snap.enemies) {
                    const p = prevById.get(e.id)
                    const x = p ? p.x + (e.x - p.x) * alpha : e.x
                    const y = p ? p.y + (e.y - p.y) * alpha : e.y
                    const px = x * CELL + CELL / 2, py = y * CELL + CELL / 2
                    ctx.fillStyle = '#4caf50'
                    ctx.beginPath()
                    ctx.arc(px, py, CELL * 0.3, 0, Math.PI * 2)
                    ctx.fill()
                    // barre de vie
                    const bw = CELL * 0.6, bx = px - bw / 2, by = py - CELL * 0.45
                    ctx.fillStyle = '#000'; ctx.fillRect(bx, by, bw, 3)
                    ctx.fillStyle = e.hp / e.maxHp > 0.3 ? '#4caf50' : '#e74c3c'
                    ctx.fillRect(bx, by, bw * Math.max(0, e.hp / e.maxHp), 3)
                }
            }
        }
        raf = requestAnimationFrame(draw)
        return () => cancelAnimationFrame(raf)
    }, [])

    return (
        <main style={{ maxWidth: 760, margin: '24px auto', padding: 16, fontFamily: 'monospace' }}>
            <h1 style={{ fontSize: 20 }}>Test boucle live (Jalon 3a)</h1>
            <p>Connexion : <strong>{status}</strong>
                {matchId && <> — vague <strong>{hud.wave}</strong> — or <strong>{hud.gold}</strong> — château <strong>{hud.castleHp}/{hud.castleMaxHp}</strong> — {hud.status}</>}
            </p>
            {matchId && (
                <div style={{ display: 'flex', gap: 6, margin: '6px 0' }}>
                    {TOWER_TYPES.map((t) => (
                        <button key={t} onClick={() => setTowerType(t)}
                                style={{ padding: '4px 8px', outline: towerType === t ? '2px solid #4caf50' : 'none' }}>
                            {t}
                        </button>
                    ))}
                    <span style={{ color: '#666' }}>(clique la grille pour poser)</span>
                </div>
            )}
            {err && <p style={{ color: '#c0392b', margin: '4px 0' }}>{err}</p>}
            <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
                <button onClick={connect}>Se connecter</button>
                <button onClick={() => send('/app/match/create')}>Créer</button>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODE" style={{ width: 80, textTransform: 'uppercase' }} />
                <button onClick={() => send('/app/match/join', { code: code.trim().toUpperCase() })}>Rejoindre</button>
                <button onClick={() => send(`/app/match/${matchId}/ready`, { ready: true })} disabled={!matchId}>Prêt</button>
                <button onClick={() => send(`/app/match/${matchId}/start`)} disabled={!matchId}>Démarrer</button>
            </div>
            <canvas ref={canvasRef} width={W} height={H} onClick={onCanvasClick}
                    style={{ border: '2px solid #2f1c0d', borderRadius: 6, background: '#2a1f16', cursor: 'crosshair' }} />
            {matchId && <p style={{ color: '#666', marginTop: 8 }}>Code du match : <strong>{code || '(créé — voir l’autre écran)'}</strong> — id {matchId.slice(0, 8)}…</p>}
        </main>
    )
}
