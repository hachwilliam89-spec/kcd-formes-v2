'use client'

// Sélecteur de map (solo + lobby multi). Le décor des 3 maps est identique pour
// l'instant (variante désert) : ce qui les distingue est le TRACÉ. On dessine donc
// un aperçu SVG du chemin (waypoints) plutôt qu'une vignette du terrain, pour que
// le choix soit lisible. La map choisie est communiquée par son id (catalogue).
import { GAME_MAPS, type MapDef } from './maps'
import { GRID_W, GRID_H } from './constants'

function PathPreview({ map }: { map: MapDef }) {
    const pts = map.waypoints
        .map((w) => `${w.x + 0.5},${w.y + 0.5}`)
        .join(' ')
    return (
        <svg viewBox={`0 0 ${GRID_W} ${GRID_H}`} className="w-full h-auto block" preserveAspectRatio="none">
            <rect x={0} y={0} width={GRID_W} height={GRID_H} fill="#3a2a17" />
            {/* Départ (vert) et château (or) aux extrémités du tracé. */}
            <polyline
                points={pts}
                fill="none"
                stroke="#c9a05a"
                strokeWidth={1.2}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <circle cx={map.waypoints[0].x + 0.5} cy={map.waypoints[0].y + 0.5} r={0.9} fill="#5bbd3a" />
            <circle
                cx={map.waypoints[map.waypoints.length - 1].x + 0.5}
                cy={map.waypoints[map.waypoints.length - 1].y + 0.5}
                r={0.9}
                fill="#e8c24a"
            />
        </svg>
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
    return (
        <div className="grid grid-cols-3 gap-2 md:gap-3">
            {GAME_MAPS.map((m) => {
                const selected = m.id === value
                return (
                    <button
                        key={m.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(m.id)}
                        className="text-left rounded-lg overflow-hidden transition disabled:opacity-50"
                        style={{
                            border: selected ? '3px solid #e8c24a' : '3px solid #2f1c0d',
                            boxShadow: selected ? '0 0 0 2px #7a5a2a inset' : 'none',
                            background: '#241811',
                        }}
                    >
                        <div className="w-full" style={{ borderBottom: '2px solid #2f1c0d' }}>
                            <PathPreview map={m} />
                        </div>
                        <div className="px-2 py-1 font-med text-sm text-[#f0e2c4] flex items-center justify-between">
                            <span>{m.name}</span>
                            {selected && <span className="text-yellow-300">✓</span>}
                        </div>
                    </button>
                )
            })}
        </div>
    )
}
