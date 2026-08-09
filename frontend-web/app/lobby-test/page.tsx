'use client'

// Page de test du Jalon 2 (lobby) — à supprimer une fois l'UI multijoueur finale
// en place. Ouvre-la dans DEUX onglets (deux comptes) : l'un crée, l'autre
// rejoint avec le code, et on voit l'état se diffuser à tous en temps réel.
// Nécessite d'être connecté (token en localStorage).
import { useRef, useState } from 'react'
import { Client, type StompSubscription } from '@stomp/stompjs'
import { wsBaseUrl } from '@/lib/ws'

type PlayerView = { playerId: string; username: string; ready: boolean; connected: boolean }
type MatchState = {
    id: string; code: string; status: string; mode: string
    maxPlayers: number; canStart: boolean; players: PlayerView[]
}

export default function LobbyTestPage() {
    const [status, setStatus] = useState('déconnecté')
    const [match, setMatch] = useState<MatchState | null>(null)
    const [code, setCode] = useState('')
    const [log, setLog] = useState<string[]>([])
    const clientRef = useRef<Client | null>(null)
    const topicSubRef = useRef<StompSubscription | null>(null)
    const myIdRef = useRef<string | null>(null)

    const add = (s: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString()} — ${s}`])

    function applyState(state: MatchState) {
        setMatch(state)
        // Dès qu'on connaît l'id, on s'abonne au canal du match (mises à jour live).
        if (clientRef.current && topicSubRef.current === null) {
            topicSubRef.current = clientRef.current.subscribe(
                `/topic/match/${state.id}`,
                (m) => applyState(JSON.parse(m.body)),
            )
            add(`Abonné à /topic/match/${state.id}`)
        }
    }

    function connect() {
        const token = localStorage.getItem('token')
        if (!token) { add('❌ Aucun token — connecte-toi d’abord.'); return }
        const client = new Client({
            brokerURL: wsBaseUrl(),
            connectHeaders: { Authorization: `Bearer ${token}` },
            reconnectDelay: 0,
            onConnect: () => {
                setStatus('connecté ✅')
                add('CONNECT OK')
                // Réponses personnelles (create / join) : on y apprend l'id du match.
                client.subscribe('/user/queue/match', (m) => {
                    add('⬅ /user/queue/match : ' + m.body)
                    applyState(JSON.parse(m.body))
                })
            },
            onStompError: (f) => { setStatus('erreur'); add('❌ STOMP : ' + (f.headers['message'] ?? '') + ' ' + f.body) },
            onWebSocketError: () => { setStatus('erreur WS'); add('❌ WebSocket') },
        })
        clientRef.current = client
        client.activate()
    }

    const send = (dest: string, body?: object) =>
        clientRef.current?.publish({ destination: dest, body: body ? JSON.stringify(body) : '{}' })

    const createMatch = () => { send('/app/match/create'); add('➡ create') }
    const joinMatch = () => { send('/app/match/join', { code: code.trim().toUpperCase() }); add('➡ join ' + code) }
    const setReady = (ready: boolean) => { if (match) { send(`/app/match/${match.id}/ready`, { ready }); add('➡ ready=' + ready) } }
    const leave = () => { if (match) { send(`/app/match/${match.id}/leave`); topicSubRef.current?.unsubscribe(); topicSubRef.current = null; setMatch(null); add('➡ leave') } }

    return (
        <main style={{ maxWidth: 760, margin: '40px auto', padding: 16, fontFamily: 'monospace' }}>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Test Lobby (Jalon 2)</h1>
            <p>État connexion : <strong>{status}</strong></p>

            <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
                <button onClick={connect} style={{ padding: '6px 12px' }}>Se connecter</button>
                <button onClick={createMatch} style={{ padding: '6px 12px' }}>Créer un match</button>
                <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODE"
                       style={{ padding: '6px', width: 90, textTransform: 'uppercase' }} />
                <button onClick={joinMatch} style={{ padding: '6px 12px' }}>Rejoindre</button>
            </div>

            {match && (
                <div style={{ border: '1px solid #ccc', borderRadius: 6, padding: 12, marginBottom: 16 }}>
                    <p>Match <strong>{match.code}</strong> — {match.status} — {match.mode} — {match.players.length}/{match.maxPlayers}
                        {match.canStart && <strong style={{ color: 'green' }}> — PRÊT À DÉMARRER</strong>}</p>
                    <ul>
                        {match.players.map((p) => (
                            <li key={p.playerId}>
                                {p.username} — {p.ready ? '✅ prêt' : '⏳ pas prêt'} {p.connected ? '' : '(déconnecté)'}
                            </li>
                        ))}
                    </ul>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setReady(true)} style={{ padding: '4px 10px' }}>Je suis prêt</button>
                        <button onClick={() => setReady(false)} style={{ padding: '4px 10px' }}>Pas prêt</button>
                        <button onClick={leave} style={{ padding: '4px 10px' }}>Quitter</button>
                    </div>
                </div>
            )}

            <pre style={{ background: '#111', color: '#9f9', padding: 12, borderRadius: 6, minHeight: 140, whiteSpace: 'pre-wrap' }}>
                {log.join('\n') || '(journal vide)'}
            </pre>
        </main>
    )
}
