'use client'

// Le tracé et les zones saisonnières sont lisibles avant de commencer une partie.
import { GAME_MAPS, type MapDef, mapIsCorridor } from './maps'
import { GRID_W, GRID_H } from './constants'
import { MAP_THEMES, BANK_CELLS, LAKE, fogCellsFor, mudCellsFor } from './seasons'

function PathPreview({ map }: { map: MapDef }) {
    const theme = MAP_THEMES[map.id]
    const castle = map.lanes[0][map.lanes[0].length - 1]
    return (
        <svg viewBox={`0 0 ${GRID_W} ${GRID_H}`} className="w-full h-auto block" preserveAspectRatio="none">
            <rect x={0} y={0} width={GRID_W} height={GRID_H} fill={theme.ground} />
            {map.id === 'spring' && (
                <rect x={LAKE.x0} y={LAKE.y0} width={LAKE.x1 - LAKE.x0 + 1} height={LAKE.y1 - LAKE.y0 + 1} fill="#527f87" />
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
            {map.id === 'spring' && BANK_CELLS.map(p => (
                <rect key={`${p.x},${p.y}`} x={p.x + 0.12} y={p.y + 0.12} width={0.76} height={0.76} fill="#92c9db" />
            ))}
            {map.id === 'autumn' && mudCellsFor(1).map(p => (
                <rect key={`m${p.x},${p.y}`} x={p.x + 0.08} y={p.y + 0.08} width={0.84} height={0.84} rx={0.3} fill="#4a3220" />
            ))}
            {/* Boue et brume de la vague 1 (elles se déplacent ensuite à chaque vague). */}
            {map.id === 'autumn' && fogCellsFor(1).filter(p => !mapIsCorridor(map, p.x, p.y)).map(p => (
                <rect key={`f${p.x},${p.y}`} x={p.x} y={p.y} width={1} height={1} fill="#e6e8ec" opacity={0.42} />
            ))}
            {map.lanes.map((lane, i) => (
                <circle key={i} cx={lane[0].x + 0.5} cy={lane[0].y + 0.5} r={0.9} fill="#5bbd3a" />
            ))}
            <circle cx={castle.x + 0.5} cy={castle.y + 0.5} r={0.9} fill="#e8c24a" />
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
        <div className="grid grid-cols-2 gap-2 md:gap-3">
            {GAME_MAPS.map((m) => {
                const theme = MAP_THEMES[m.id]
                const selected = m.id === value
                return (
                    <button
                        key={m.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(m.id)}
                        aria-pressed={selected}
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
                            <span><span className="block text-[10px] uppercase tracking-widest font-read" style={{ color: theme.accent }}>{theme.season}</span>{m.name}</span>
                            {selected && <span className="text-yellow-300">✓</span>}
                        </div>
                        <p className="font-read text-xs leading-relaxed text-[#e2d4b8] px-2 pb-3 min-h-16">{theme.challenge}</p>
                    </button>
                )
            })}
        </div>
    )
}
