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
type Snapshot = { tick: number; wave: number; castleHp: number; castleMaxHp: number; status: string; enemies: Enemy[] }

export default function GameTestPage() {
    const [status, setStatus] = useState('déconnecté')
    const [code, setCode] = useState('')
    const [matchId, setMatchId] = useState<string | null>(null)
    const [hud, setHud] = useState({ wave: 0, castleHp: 0, castleMaxHp: 0, status: '' })
    const clientRef = useRef<Client | null>(null)
    const lobbySubRef = useRef<StompSubscription | null>(null)
    const stateSubRef = useRef<StompSubscription | null>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    // Deux derniers snapshots pour interpoler.
    const prevRef = useRef<{ snap: Snapshot; t: number } | null>(null)
    const currRef = useRef<{ snap: Snapshot; t: number } | null>(null)

    function subscribeMatch(id: string) {
        const client = clientRef.current
        if (!client || matchId === id) return
        setMatchId(id)
        lobbySubRef.current = client.subscribe(`/topic/match/${id}`, () => {})
        stateSubRef.current = client.subscribe(`/topic/match/${id}/state`, (m) => {
            const snap: Snapshot = JSON.parse(m.body)
            prevRef.current = currRef.current
            currRef.current = { snap, t: performance.now() }
            setHud({ wave: snap.wave, castleHp: snap.castleHp, castleMaxHp: snap.castleMaxHp, status: snap.status })
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
            },
            onStompError: (f) => setStatus('erreur : ' + (f.headers['message'] ?? '')),
            onWebSocketError: () => setStatus('erreur WS'),
        })
        clientRef.current = client
        client.activate()
    }

    const send = (dest: string, body?: object) =>
        clientRef.current?.publish({ destination: dest, body: body ? JSON.stringify(body) : '{}' })

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

            // ennemis interpolés
            const curr = currRef.current, prev = prevRef.current
            if (curr) {
                const alpha = prev ? Math.min(1, (performance.now() - curr.t) / 66) : 1
                const prevById = new Map((prev?.snap.enemies ?? []).map((e) => [e.id, e]))
                for (const e of curr.snap.enemies) {
                    const p = prevById.get(e.id)
                    const x = p ? p.x + (e.x - p.x) * alpha : e.x
                    const y = p ? p.y + (e.y - p.y) * alpha : e.y
                    ctx.fillStyle = '#4caf50'
                    ctx.beginPath()
                    ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, CELL * 0.3, 0, Math.PI * 2)
                    ctx.fill()
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
                {matchId && <> — vague <strong>{hud.wave}</strong> — château <strong>{hud.castleHp}/{hud.castleMaxHp}</strong> — {hud.status}</>}
            </p>
            <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap' }}>
                <button onClick={connect}>Se connecter</button>
                <button onClick={() => send('/app/match/create')}>Créer</button>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODE" style={{ width: 80, textTransform: 'uppercase' }} />
                <button onClick={() => send('/app/match/join', { code: code.trim().toUpperCase() })}>Rejoindre</button>
                <button onClick={() => send(`/app/match/${matchId}/ready`, { ready: true })} disabled={!matchId}>Prêt</button>
                <button onClick={() => send(`/app/match/${matchId}/start`)} disabled={!matchId}>Démarrer</button>
            </div>
            <canvas ref={canvasRef} width={W} height={H} style={{ border: '2px solid #2f1c0d', borderRadius: 6, background: '#2a1f16' }} />
            {matchId && <p style={{ color: '#666', marginTop: 8 }}>Code du match : <strong>{code || '(créé — voir l’autre écran)'}</strong> — id {matchId.slice(0, 8)}…</p>}
        </main>
    )
}
