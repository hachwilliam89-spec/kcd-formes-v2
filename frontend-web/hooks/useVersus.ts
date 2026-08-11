'use client'

// Couche client du multi VERSUS (rush). Même lobby STOMP que la coop, mais le
// flux de jeu porte les DEUX boards (un par joueur) : on isole le sien pour le
// plateau Phaser et on garde un résumé de l'adversaire. Voir docs/MULTIPLAYER.md
// et VersusSnapshotResponse côté backend.
import { useCallback, useRef, useState } from 'react'
import { Client, type StompSubscription } from '@stomp/stompjs'
import { wsBaseUrl } from '@/lib/ws'
import type { Snapshot, MatchState, PlayerView } from '@/hooks/useCoop'
import type { ChatMessage } from '@/components/game/ChatPanel'

export type { PlayerView }
export type VersusMatchState = MatchState & { winnerId?: string | null }

// Vue versus adressée à CE joueur (canal /user/queue/game) : mon board complet
// + un résumé de l'adversaire (voir VersusPlayerView côté backend).
export type Blip = { x: number; y: number; type: string }
export type TowerBlip = { x: number; y: number; type: string }
type OpponentView = {
    playerId: string; username: string
    wave: number; gold: number; castleHp: number; castleMaxHp: number
    score: number; defeated: boolean
    enemies: Blip[]; towers: TowerBlip[]
}
type VersusPlayerView = {
    status: string; winnerId: string | null
    board: Snapshot | null; income: number; score: number; defeated: boolean
    opponent: OpponentView | null
}

export type SideHud = {
    username: string
    wave: number
    gold: number
    castleHp: number
    castleMaxHp: number
    income: number
    score: number
    pendingBonuses: number
    defeated: boolean
    // Aperçu de la grille (rempli pour l'adversaire uniquement).
    enemies?: Blip[]
    towers?: TowerBlip[]
}

export function useVersus(myPlayerId: string | undefined) {
    const [connected, setConnected] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [match, setMatch] = useState<VersusMatchState | null>(null)
    const [myHud, setMyHud] = useState<SideHud | null>(null)
    const [oppHud, setOppHud] = useState<SideHud | null>(null)
    const [winnerId, setWinnerId] = useState<string | null>(null)
    const [chat, setChat] = useState<ChatMessage[]>([])

    const clientRef = useRef<Client | null>(null)
    const topicSub = useRef<StompSubscription | null>(null)
    const stateSub = useRef<StompSubscription | null>(null)
    const chatSub = useRef<StompSubscription | null>(null)
    const matchIdRef = useRef<string | null>(null)
    const myIdRef = useRef(myPlayerId)
    myIdRef.current = myPlayerId
    // Consommateur du board du joueur (le plateau Phaser) — branché par la page.
    const snapHandlerRef = useRef<((snap: Snapshot) => void) | null>(null)
    // Watchdog anti-figeage : si aucun snapshot n'arrive pendant STALE_MS alors que
    // la partie tourne (session coupée par le serveur après un throttle d'onglet,
    // sans que le client s'en aperçoive), on force une reconnexion complète.
    const lastMsgRef = useRef(0)
    const statusRef = useRef<string>('')
    const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null)

    // Traite une vue de jeu adressée à CE joueur (topic /player/{myId}).
    const handleGame = useCallback((body: string) => {
        lastMsgRef.current = Date.now()
        const v: VersusPlayerView = JSON.parse(body)
        statusRef.current = v.status
        if (v.board) snapHandlerRef.current?.(v.board)
        setMyHud({
            username: '', wave: v.board?.wave ?? 0, gold: v.board?.gold ?? 0,
            castleHp: v.board?.castleHp ?? 0, castleMaxHp: v.board?.castleMaxHp ?? 100,
            income: v.income, score: v.score,
            pendingBonuses: v.board?.pendingBonuses ?? 0, defeated: v.defeated,
        })
        if (v.opponent) setOppHud({
            username: v.opponent.username, wave: v.opponent.wave, gold: v.opponent.gold,
            castleHp: v.opponent.castleHp, castleMaxHp: v.opponent.castleMaxHp,
            income: 0, score: v.opponent.score, pendingBonuses: 0, defeated: v.opponent.defeated,
            enemies: v.opponent.enemies ?? [], towers: v.opponent.towers ?? [],
        })
        if (v.winnerId) setWinnerId(v.winnerId)
        setMatch((mm) => (mm ? { ...mm, status: v.status } : mm))
    }, [])

    // Abonne aux canaux du match : LOBBY (/topic/match/{id}) + JEU par joueur
    // (/topic/match/{id}/player/{myId}). (Ré)abonnement idempotent pour couvrir la
    // reconnexion (les abonnements de l'ancienne connexion sont morts).
    const subscribeMatch = useCallback((id: string) => {
        const client = clientRef.current
        if (!client) return
        matchIdRef.current = id
        try { topicSub.current?.unsubscribe() } catch { /* connexion morte */ }
        try { stateSub.current?.unsubscribe() } catch { /* connexion morte */ }
        try { chatSub.current?.unsubscribe() } catch { /* connexion morte */ }
        topicSub.current = client.subscribe(`/topic/match/${id}`, (m) => {
            lastMsgRef.current = Date.now()
            const st: VersusMatchState = JSON.parse(m.body)
            statusRef.current = st.status
            setMatch(st)
            if (st.winnerId) setWinnerId(st.winnerId)
        })
        chatSub.current = client.subscribe(`/topic/match/${id}/chat`, (m) => {
            const c: ChatMessage = JSON.parse(m.body)
            setChat((prev) => [...prev, c].slice(-100))
        })
        if (myIdRef.current) {
            stateSub.current = client.subscribe(
                `/topic/match/${id}/player/${myIdRef.current}`,
                (m) => handleGame(m.body))
        }
    }, [handleGame])

    const connect = useCallback(() => {
        if (clientRef.current) return
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
        if (!token) { setError('Connecte-toi d’abord.'); return }
        const client = new Client({
            brokerURL: wsBaseUrl(),
            connectHeaders: { Authorization: `Bearer ${token}` },
            reconnectDelay: 3000,
            // Heartbeats : détecte plus vite une connexion morte (throttle d'onglet).
            heartbeatIncoming: 10000,
            heartbeatOutgoing: 10000,
            onConnect: () => {
                setConnected(true); setError(null)
                lastMsgRef.current = Date.now()
                client.subscribe('/user/queue/match', (m) => {
                    const st: VersusMatchState = JSON.parse(m.body)
                    setMatch(st); subscribeMatch(st.id)
                })
                client.subscribe('/user/queue/errors', (m) => setError(JSON.parse(m.body).error))
                // Reconnexion en cours de partie : ré-abonne aux canaux du match
                // (lobby + jeu par joueur) — sinon le board reste figé après un throttle.
                if (matchIdRef.current) subscribeMatch(matchIdRef.current)
            },
            onStompError: (f) => setError(f.headers['message'] ?? 'Erreur STOMP'),
            onWebSocketClose: () => setConnected(false),
        })
        clientRef.current = client
        client.activate()

        // Watchdog : la partie tourne mais plus aucun snapshot depuis STALE_MS →
        // la session a été coupée sans que le client s'en rende compte. On force
        // une reconnexion complète (nouvelle session) qui rebranche les abonnements.
        const STALE_MS = 4000
        watchdogRef.current = setInterval(() => {
            if (statusRef.current !== 'RUNNING' || lastMsgRef.current === 0) return
            if (Date.now() - lastMsgRef.current > STALE_MS) {
                lastMsgRef.current = Date.now() // évite de reconnecter en boucle
                // forceDisconnect : coupe net la socket morte SANS attendre de
                // fermeture propre (deactivate() pouvait rester bloqué) → le
                // reconnect auto (reconnectDelay) refait une session + ré-abonne.
                clientRef.current?.forceDisconnect()
            }
        }, 2000)
    }, [subscribeMatch])

    const send = (dest: string, body?: object) =>
        clientRef.current?.publish({ destination: dest, body: body ? JSON.stringify(body) : '{}' })
    const mid = () => matchIdRef.current

    const actions = {
        connect,
        create: (mapId?: string) => send('/app/match/create', { mode: 'VERSUS', mapId: mapId ?? 'desert' }),
        join: (code: string) => send('/app/match/join', { code: code.trim().toUpperCase() }),
        setReady: (ready: boolean) => mid() && send(`/app/match/${mid()}/ready`, { ready }),
        start: () => mid() && send(`/app/match/${mid()}/start`),
        placeTower: (type: string, x: number, y: number) => { setError(null); mid() && send(`/app/match/${mid()}/tower`, { type, x, y }) },
        sendCreep: (type: string) => { setError(null); mid() && send(`/app/match/${mid()}/send`, { type }) },
        chooseBonus: (type: string) => { setError(null); mid() && send(`/app/match/${mid()}/bonus`, { type }) },
        sendChat: (text: string) => { mid() && send(`/app/match/${mid()}/chat`, { text }) },
        leave: () => {
            if (mid()) send(`/app/match/${mid()}/leave`)
            topicSub.current?.unsubscribe(); stateSub.current?.unsubscribe(); chatSub.current?.unsubscribe()
            topicSub.current = stateSub.current = chatSub.current = null
            matchIdRef.current = null
            statusRef.current = ''; lastMsgRef.current = 0
            if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null }
            setMatch(null); setMyHud(null); setOppHud(null); setWinnerId(null); setChat([])
        },
        clearError: () => setError(null),
        setSnapshotHandler: (fn: ((snap: Snapshot) => void) | null) => { snapHandlerRef.current = fn },
        // Démontage de la page : coupe TOUT (client STOMP + watchdog) pour ne pas
        // laisser une instance zombie qui continue de tourner (résidu Fast Refresh /
        // navigation) et superpose des arborescences.
        disconnect: () => {
            if (watchdogRef.current) { clearInterval(watchdogRef.current); watchdogRef.current = null }
            try { clientRef.current?.deactivate() } catch { /* déjà mort */ }
            clientRef.current = null
            topicSub.current = stateSub.current = chatSub.current = null
            matchIdRef.current = null; statusRef.current = ''; lastMsgRef.current = 0
            setConnected(false); setChat([])
        },
    }

    return { connected, error, match, myHud, oppHud, winnerId, chat, actions }
}
