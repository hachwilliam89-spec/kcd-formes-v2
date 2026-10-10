'use client'

// Choix de la carte : aperçu réel du champ de bataille (rendu du jeu, dans
// public/sprites/thumbs/ avec les autres sprites sous licence), saison, une phrase
// et la difficulté. Sans l'aperçu, le schéma du tracé le remplace.
import { useEffect, useState } from 'react'
import { type MapDef, mapIsCorridor } from './maps'
import { useCatalog, getForecast } from '@/store/catalogStore'
import { MAP_THEMES, type MapDifficulty } from './seasons'

function PathPreview({ map }: { map: MapDef }) {
    const theme = MAP_THEMES[map.id]
    const castle = map.castle
    // Prévision de la vague 1 (serveur) : boue et brume de l'automne, qui bougent ensuite.
    const first = getForecast(map.id, 1)
    const mud = first?.type === 'AUTUMN' ? first.affectedCells : []
    const fog = first?.fogCells ?? []
    return (
        <svg viewBox={`0 0 ${map.width} ${map.height}`} className="w-full h-auto block" preserveAspectRatio="none">
            <rect x={0} y={0} width={map.width} height={map.height} fill={theme.ground} />
            {map.lake && (
                <rect x={map.lake.x0} y={map.lake.y0} width={map.lake.x1 - map.lake.x0 + 1} height={map.lake.y1 - map.lake.y0 + 1} fill="#527f87" />
            )}
            {/* Chaque voie tracée + son entrée (vert). Château commun (or). */}
            {map.lanes.map((lane, i) => (
                <polyline
                    key={i}
                    points={lane.map((w) => `${w.x + 0.5},${w.y + 0.5}`).join(' ')}
                    fill="none"
                    stroke={theme.road}
                    strokeWidth={1.2 + map.halfWidth * 1.6}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                />
            ))}
            {map.bankCells.map(p => (
                <rect key={`${p.x},${p.y}`} x={p.x + 0.12} y={p.y + 0.12} width={0.76} height={0.76} fill="#92c9db" />
            ))}
            {mud.map(p => (
                <rect key={`m${p.x},${p.y}`} x={p.x + 0.08} y={p.y + 0.08} width={0.84} height={0.84} rx={0.3} fill="#4a3220" />
            ))}
            {/* Boue et brume de la vague 1 (elles se déplacent ensuite à chaque vague). */}
            {fog.filter(p => !mapIsCorridor(map, p.x, p.y)).map(p => (
                <rect key={`f${p.x},${p.y}`} x={p.x} y={p.y} width={1} height={1} fill="#e6e8ec" opacity={0.42} />
            ))}
            {map.lanes.map((lane, i) => (
                <circle key={i} cx={lane[0].x + 0.5} cy={lane[0].y + 0.5} r={0.9} fill="#5bbd3a" />
            ))}
            <circle cx={castle.x + 0.5} cy={castle.y + 0.5} r={0.9} fill="#e8c24a" />
        </svg>
    )
}

function MapThumb({ map }: { map: MapDef }) {
    const [missing, setMissing] = useState(false)
    if (missing) return <PathPreview map={map} />
    return <img src={`/sprites/thumbs/${map.id}.webp`} alt="" loading="lazy" onError={() => setMissing(true)} />
}

// Crâne pixel 7 × 7, contour encre ajouté autour : plein = niveau atteint.
const SKULL = ['.#####.', '#######', '#..#..#', '#######', '.##.##.', '.#####.', '.#.#.#.']
const SKULL_CELLS = (() => {
    const on = (x: number, y: number) => SKULL[y]?.[x] === '#'
    const fill: [number, number][] = [], ink: [number, number][] = []
    for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) {
        if (on(x, y)) fill.push([x + 1, y + 1])
        else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => on(x + dx, y + dy))) ink.push([x + 1, y + 1])
    }
    return { fill, ink }
})()
const DIFFICULTY_LABEL: Record<MapDifficulty, string> = { 1: 'Abordable', 2: 'Rude', 3: 'Redoutable' }

function Difficulty({ level }: { level: MapDifficulty }) {
    return (
        <span className="war-map-diff" aria-label={`Difficulté : ${DIFFICULTY_LABEL[level]} (${level} sur 3)`}>
            {[1, 2, 3].map((i) => (
                <svg key={i} viewBox="0 0 9 9" width={18} height={18} shapeRendering="crispEdges" aria-hidden="true">
                    {SKULL_CELLS.ink.map(([x, y]) => <rect key={`i${x},${y}`} x={x} y={y} width={1.02} height={1.02} fill={i <= level ? '#24160f' : '#4a3626'} />)}
                    {SKULL_CELLS.fill.map(([x, y]) => <rect key={`f${x},${y}`} x={x} y={y} width={1.02} height={1.02} fill={i <= level ? '#f1e4c6' : '#3a2a1c'} />)}
                </svg>
            ))}
            <span aria-hidden="true">{DIFFICULTY_LABEL[level]}</span>
        </span>
    )
}

export default function MapSelector({
    value,
    onChange,
    disabled = false,
}: {
    value: string
    onChange: (id: string) => void
    disabled?: boolean
}) {
    // Cartes servies par le backend (voir store/catalogStore.ts).
    const { maps, status, load } = useCatalog()
    useEffect(() => { void load() }, [load])
    if (status === 'error') {
        return (
            <div className="flex flex-col items-center gap-2 py-6 text-sm">
                <p>Impossible de charger les cartes (serveur injoignable).</p>
                <button type="button" onClick={() => void load()} className="kcd-btn text-xs py-1 px-3">Réessayer</button>
            </div>
        )
    }
    if (status !== 'ready') return <p className="py-6 text-center text-sm">Chargement des cartes…</p>
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {maps.map((m) => {
                const theme = MAP_THEMES[m.id] ?? MAP_THEMES.desert
                const selected = m.id === value
                return (
                    <button
                        key={m.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(m.id)}
                        aria-pressed={selected}
                        className={`war-map-card ${selected ? 'is-selected' : ''}`}
                        style={{ '--season-color': theme.accent } as React.CSSProperties}
                    >
                        <span className="war-map-preview">
                            <MapThumb map={m} />
                            <span className="war-map-season">{theme.season}</span>
                            {selected && <span className="war-map-check" aria-label="Sélectionnée">✓</span>}
                        </span>
                        <span className="war-map-body">
                            <span className="war-map-name">{m.name}</span>
                            <span className="war-map-desc">{theme.challenge}</span>
                            <Difficulty level={theme.difficulty} />
                        </span>
                    </button>
                )
            })}
        </div>
    )
}
