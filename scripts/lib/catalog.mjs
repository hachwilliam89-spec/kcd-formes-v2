// Catalogue du jeu (tours + disposition des cartes) pour les outils hors du
// navigateur du joueur : export visuel (scripts/visual-export) et banc de charge
// (scripts/perf-bench). Même source que le jeu : le backend (requêtes publiques
// GET /api/v1/towers et /api/v1/maps). Option --catalog <fichier.json> pour
// travailler sans backend, à partir d'une sauvegarde au format { towers, maps, forecasts? }.
import fs from 'node:fs'

/** Nombre de vagues dont on charge la prévision saisonnière (crues 3 et 6, cycle de brume). */
const FORECAST_WAVES = 6

export const CATALOG_OPTIONS = {
    api: { type: 'string', default: process.env.API_URL ?? 'http://localhost:8080' },
    catalog: { type: 'string' },
}

export async function loadCatalog({ api, catalog }) {
    if (catalog) return JSON.parse(fs.readFileSync(catalog, 'utf8'))
    const get = async (p) => {
        const res = await fetch(api + p)
        if (!res.ok) throw new Error(`${p} : HTTP ${res.status}`)
        return res.json()
    }
    try {
        const [towers, ids] = await Promise.all([get('/api/v1/towers'), get('/api/v1/maps')])
        const maps = await Promise.all(ids.map((id) => get(`/api/v1/maps/${encodeURIComponent(id)}`)))
        // Prévisions saisonnières des premières vagues (aperçus du banc saisonnier).
        const forecasts = Object.fromEntries(await Promise.all(ids.map(async (id) => [id,
            await Promise.all(Array.from({ length: FORECAST_WAVES }, (_, i) =>
                get(`/api/v1/maps/${encodeURIComponent(id)}/forecast?wave=${i + 1}`)))])))
        return { towers, maps, forecasts }
    } catch (e) {
        console.error(`Catalogue du jeu indisponible sur ${api} (${e.message}).`)
        console.error('Lance le backend (docker compose up -d), ou passe --api <url> ou --catalog <fichier.json>.')
        process.exit(1)
    }
}

/** Script servi à la page avant le bundle : la scène lit le catalogue dès sa création. */
export const catalogScript = (data) => `window.__CATALOG__ = ${JSON.stringify(data)};`

/** Remplace process.env.* du code web (lib/api.ts), absent d'un bundle navigateur hors Next. */
export const NEXT_ENV_DEFINE = { 'process.env.NEXT_PUBLIC_API_URL': 'undefined' }
