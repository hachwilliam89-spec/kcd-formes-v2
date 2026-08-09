'use client'

// Page de test du Jalon 1 (plomberie WebSocket) — à supprimer une fois le vrai
// multijoueur en place. Valide toute la chaîne : handshake /ws → auth JWT au
// CONNECT → /app/echo → /topic/echo. Nécessite d'être connecté (token en
// localStorage) : va d'abord sur la page d'accueil te connecter, puis ici.
import { useRef, useState } from 'react'
import { Client } from '@stomp/stompjs'
import { wsBaseUrl } from '@/lib/ws'

export default function WsTestPage() {
    const [log, setLog] = useState<string[]>([])
    const [status, setStatus] = useState('déconnecté')
    const clientRef = useRef<Client | null>(null)

    const add = (s: string) =>
        setLog((l) => [...l, `${new Date().toLocaleTimeString()} — ${s}`])

    function connectAndEcho() {
        const token = localStorage.getItem('token')
        if (!token) {
            add('❌ Aucun token — connecte-toi d’abord sur la page d’accueil.')
            return
        }
        const url = wsBaseUrl()
        add(`Connexion à ${url} …`)
        const client = new Client({
            brokerURL: url,
            connectHeaders: { Authorization: `Bearer ${token}` },
            reconnectDelay: 0, // pas de reconnexion auto pour un test
            onConnect: () => {
                setStatus('connecté ✅')
                add('CONNECT OK — auth JWT acceptée')
                client.subscribe('/topic/echo', (m) => add('⬅ /topic/echo : ' + m.body))
                client.publish({
                    destination: '/app/echo',
                    body: JSON.stringify({ hello: 'KCD', at: Date.now() }),
                })
                add('➡ /app/echo {hello:"KCD"}')
            },
            onStompError: (f) => {
                setStatus('erreur STOMP')
                add('❌ Erreur STOMP : ' + (f.headers['message'] ?? '') + ' ' + f.body)
            },
            onWebSocketError: () => {
                setStatus('erreur WS')
                add('❌ Erreur WebSocket (handshake refusé ?)')
            },
            onWebSocketClose: () => {
                setStatus('fermé')
                add('WebSocket fermé')
            },
        })
        clientRef.current = client
        client.activate()
    }

    function disconnect() {
        clientRef.current?.deactivate()
        setStatus('déconnecté')
        add('Déconnexion demandée')
    }

    return (
        <main style={{ maxWidth: 720, margin: '40px auto', padding: 16, fontFamily: 'monospace' }}>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Test WebSocket (Jalon 1)</h1>
            <p style={{ marginBottom: 12 }}>
                État : <strong>{status}</strong>
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button onClick={connectAndEcho} style={{ padding: '6px 12px' }}>
                    Se connecter + envoyer un écho
                </button>
                <button onClick={disconnect} style={{ padding: '6px 12px' }}>
                    Déconnecter
                </button>
                <button onClick={() => setLog([])} style={{ padding: '6px 12px' }}>
                    Effacer
                </button>
            </div>
            <pre
                style={{
                    background: '#111',
                    color: '#9f9',
                    padding: 12,
                    borderRadius: 6,
                    minHeight: 160,
                    whiteSpace: 'pre-wrap',
                }}
            >
                {log.join('\n') || '(journal vide)'}
            </pre>
            <p style={{ marginTop: 12, color: '#666' }}>
                Succès attendu : « CONNECT OK » puis « ⬅ /topic/echo » contenant ton écho + `from` = ton playerId.
            </p>
        </main>
    )
}
