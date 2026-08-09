// URL du endpoint WebSocket, dérivée de la même logique que l'API REST (lib/api.ts) :
// - En dev : NEXT_PUBLIC_API_URL non défini → http://localhost:8080 → ws://localhost:8080/ws
// - En prod : NEXT_PUBLIC_API_URL = "" → même origine → wss://kcd-formes.fr/ws (Caddy proxifie).
export function wsBaseUrl(): string {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8080'
    const base = apiBase || (typeof window !== 'undefined' ? window.location.origin : '')
    return base.replace(/^http/, 'ws') + '/ws'
}
