'use client'

// Couche client du multijoueur coop (STOMP au-dessus de /ws). Encapsule la
// connexion, le lobby (create/join/ready/start), la pose de tour, et le flux de
// snapshots de jeu. Voir docs/MULTIPLAYER.md.
import { useCallback, useRef, useState } from 'react'
import { Client, type StompSubscription } from '@stomp/stompjs'
import { wsBaseUrl } from '@/lib/ws'

export type PlayerView = { playerId: string; username: string; ready: boolean; connected: boolean }
export type MatchState = {
    id: string; code: string; status: string; mode: string
    maxPlayers: number; canStart: boolean; players: PlayerView[]
}
export type EnemyV = { id: string; type: string; x: number; y: number; hp: number; maxHp: number }
export type TowerV = { id: string; type: string; x: number; y: number; level: number }
export type ShotV = { fromX: number; fromY: number; toX: number; toY: number }
export type Snapshot = {
    tick: number; wave: number; gold: number; castleHp: number; castleMaxHp: number
    pendingBonuses: number
    status: string; enemies: EnemyV[]; towers: TowerV[]; shots: ShotV[]
}

export type CoopHud = { wave: number; gold: number; castleHp: number; castleMaxHp: number; pendingBonuses: number; status: string }

export function useCoop() {
    const [connected, setConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [match, setMatch] = useState<MatchState | null>(null)
    const [hud, setHud] = useState<CoopHud | null>(null)

    const clientRef = useRef<Client | null>(null)
    const topicSub = useRef<StompSubscription | null>(null)
    const stateSub = useRef<StompSubscription | null>(null)
    const matchIdRef = useRef<string | null>(null)
    // Consommateur du flux de snapshots (le plateau Phaser) — branché par la page.
    const snapHandlerRef = useRef<((snap: Snapshot) => void) | null>(null)
    // Watchdog anti-figeage (voir useVersus) : reconnexion forcée si le flux s'arrête.
    const lastMsgRef = useRef(0)
    const statusRef = useRef<string>('')
    const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null)

    const subscribeMatch = useCallback((id: string) => {
        const client = clientRef.current
        if (!client) return
        matchIdRef.current = id
        // (Ré)abonnement idempotent. unsubscribe() sur une connexion MORTE
        // (reconnexion) lève une exception qui avortait le ré-abonnement → try/catch.
        try { topicSub.current?.unsubscribe() } catch { /* connexion morte */ }
        try { stateSub.current?.unsubscribe() } catch { /* connexion morte */ }
        topicSub.current = client.subscribe(`/topic/match/${id}`, (m) => {
            lastMsgRef.current = Date.now()
            setMatch(JSON.parse(m.body))
        })
        stateSub.current = client.subscribe(`/topic/match/${id}/state`, (m) => {
            lastMsgRef.current = Date.now()
            const snap: Snapshot = JSON.parse(m.body)
            statusRef.current = snap.status
            snapHandlerRef.current?.(snap)
            setHud({ wave: snap.wave, gold: snap.gold, castleHp: snap.castleHp, castleMaxHp: snap.castleMaxHp, pendingBonuses: snap.pendingBonuses, status: snap.status })
            setMatch((mm) => (mm ? { ...mm, status: snap.status } : mm))
        })
    }, [])

    const connect = useCallback(() => {
        if (clientRef.current) return
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        if (!token) { setError('Connecte-toi d’abord.'); return }
        const client = new Client({
            brokerURL: wsBaseUrl(),
            connectHeaders: { Authorization: `Bearer ${token}` },
            reconnectDelay: 3000,
            heartbeatIncoming: 10000,
            heartbeatOutgoing: 10000,
            onConnect: () => {
                setConnected(true); setError(null)
                lastMsgRef.current = Date.now()
                client.subscribe('/user/queue/match', (m) => {
                    const st: MatchState = JSON.parse(m.body)
                    setMatch(st); subscribeMatch(st.id)
                })
                client.subscribe('/user/queue/errors', (m) => setError(JSON.parse(m.body).error))
                // Reconnexion en cours de partie : ré-abonne aux canaux du match.
                if (matchIdRef.current) subscribeMatch(matchIdRef.current)
            },
            onStompError: (f) => setError(f.headers['message'] ?? 'Erreur STOMP'),
            onWebSocketClose: () => setConnected(false),
        })
        clientRef.current = client
        client.activate()

        // Watchdog : plus de snapshot depuis STALE_MS en partie → reconnexion forcée.
        const STALE_MS = 4000
        watchdogRef.current = setInterval(() => {
            if (statusRef.current !== 'RUNNING' || lastMsgRef.current === 0) return
            if (Date.now() - lastMsgRef.current > STALE_MS) {
                lastMsgRef.current = Date.now()
                const c = clientRef.current
                if (c) c.deactivate().then(() => c.activate()).catch(() => {})
            }
        }, 2000)
    }, [subscribeMatch])

    const send = (dest: string, body?: object) =>
        clientRef.current?.publish({ destination: dest, body: body ? JSON.stringify(body) : '{}' })

    const mid = () => matchIdRef.current

    const actions = {
        connect,
        create: () => send('/app/match/create'),
        join: (code: string) => send('/app/match/join', { code: code.trim().toUpperCase() }),
        setReady: (ready: boolean) => mid() && send(`/app/match/${mid()}/ready`, { ready }),
        start: () => mid() && send(`/app/match/${mid()}/start`),
        placeTower: (type: string, x: number, y: number) => { setError(null); mid() && send(`/app/match/${mid()}/tower`, { type, x, y }) },
        chooseBonus: (type: string) => { setError(null); mid() && send(`/app/match/${mid()}/bonus`, { type }) },
        leave: () => {
            if (mid()) send(`/app/match/${mid()}/leave`)
            topicSub.current?.unsubscribe(); stateSub.current?.unsubscribe()
            topicSub.current = stateSub.current = null
            matchIdRef.current = null
            statusRef.current = ''; lastMsgRef.current = 0
            if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null }
            setMatch(null); setHud(null)
        },
        clearError: () => setError(null),
        // Branche le consommateur du flux de snapshots (plateau Phaser).
        setSnapshotHandler: (fn: ((snap: Snapshot) => void) | null) => { snapHandlerRef.current = fn },
        // Démontage : coupe TOUT (client + watchdog) pour ne pas laisser d'instance zombie.
        disconnect: () => {
            if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null }
            try { clientRef.current?.deactivate() } catch { /* déjà mort */ }
            clientRef.current = null
            topicSub.current = stateSub.current = null
            matchIdRef.current = null; statusRef.current = ''; lastMsgRef.current = 0
            setConnected(false)
        },
    }

    return { connected, error, match, hud, actions }
}
