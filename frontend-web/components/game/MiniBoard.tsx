'use client'

// Miniature (aperçu) d'un plateau : le couloir, le château, les tours (couleur du
// type) et les ennemis (points), rendus en SVG à l'échelle de la grille (20×15).
// Utilisé pour l'aperçu de la grille adverse en versus. Léger : pas d'animation,
// juste un re-render à chaque snapshot serveur.
import { GRID_W, GRID_H, CORRIDOR_CELLS, PATH_END } from './constants'
import type { Blip, TowerBlip } from '@/hooks/useVersus'

const TOWER_COLOR: Record<string, string> = {
    ARCHER: '#5bbd3a', MAGE: '#9a6ce0', CATAPULT: '#e08a3a', BALLISTA: '#c7cdd4', WALL: '#9a8560',
}

export function MiniBoard({ enemies = [], towers = [], className = '' }: {
    enemies?: Blip[]
    towers?: TowerBlip[]
    className?: string
}) {
    return (
        <svg viewBox={`0 0 ${GRID_W} ${GRID_H}`} preserveAspectRatio="xMidYMid meet"
             className={className} style={{ background: '#2f2113', borderRadius: 6, border: '1px solid #120a06' }}>
            {/* Couloir (route des ennemis) */}
            {CORRIDOR_CELLS.map((c, i) => (
                <rect key={i} x={c.x} y={c.y} width={1} height={1} fill="#5a4326" />
            ))}
            {/* Château (fin du chemin) */}
            <rect x={PATH_END.x - 0.5} y={PATH_END.y - 0.5} width={2} height={2} fill="#c9b273" stroke="#7a5320" strokeWidth={0.15} />
            {/* Tours */}
            {towers.map((t, i) => (
                <rect key={`t${i}`} x={t.x + 0.12} y={t.y + 0.12} width={0.76} height={0.76} rx={0.15}
                      fill={TOWER_COLOR[t.type] ?? '#cccccc'} stroke="#1a1109" strokeWidth={0.08} />
            ))}
            {/* Ennemis */}
            {enemies.map((e, i) => (
                <circle key={`e${i}`} cx={e.x + 0.5} cy={e.y + 0.5} r={0.32} fill="#d64545" stroke="#3a0f0f" strokeWidth={0.06} />
            ))}
        </svg>
    )
}
