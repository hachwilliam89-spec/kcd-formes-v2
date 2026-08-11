'use client'

// Miniature (aperçu) d'un plateau : chemin, château (coloré selon ses PV), tours
// (couleur par type) et ennemis (taille/couleur par type). Utilisé pour l'aperçu
// de la grille adverse en versus. Léger : re-render à chaque snapshot serveur.
import { GRID_W, GRID_H, CORRIDOR_CELLS, PATH_START, PATH_END } from './constants'
import type { Blip, TowerBlip } from '@/hooks/useVersus'

// Couleurs des tours (par TYPE) — reprises de la légende du jeu. Exportées pour
// la légende affichée sous la mini-map (savoir quoi envoyer selon la défense).
export const TOWER_COLOR: Record<string, string> = {
    ARCHER: '#5bbd3a', MAGE: '#9a6ce0', CATAPULT: '#e08a3a', BALLISTA: '#c7cdd4', WALL: '#9a8560',
}
export const TOWER_LABEL: Record<string, string> = {
    ARCHER: 'Archer', MAGE: 'Mage', CATAPULT: 'Catapulte', BALLISTA: 'Baliste', WALL: 'Mur',
}

// Style des ennemis par type : les grosses menaces (Troll, Chevalier, Démon, Boss)
// ressortent (plus gros, couleur distincte) pour repérer une poussée d'un coup d'œil.
const ENEMY_STYLE: Record<string, { color: string; r: number }> = {
    GOBLIN:       { color: '#84cc16', r: 0.26 },
    ORC:          { color: '#c2792e', r: 0.32 },
    SAPEUR:       { color: '#e0483f', r: 0.30 },
    TROLL:        { color: '#9aa3b0', r: 0.42 },
    DARK_KNIGHT:  { color: '#6b5bd8', r: 0.40 },
    CHARIOT:      { color: '#3bb0e0', r: 0.44 },
    BOSS_WARLORD: { color: '#eab308', r: 0.60 },
}
const ENEMY_DEFAULT = { color: '#d64545', r: 0.30 }

export function MiniBoard({ enemies = [], towers = [], castleRatio = 1, className = '' }: {
    enemies?: Blip[]
    towers?: TowerBlip[]
    castleRatio?: number          // PV du château adverse (0..1) → couleur du marqueur
    className?: string
}) {
    const castleColor = castleRatio > 0.5 ? '#5bbd3a' : castleRatio > 0.25 ? '#eab308' : '#d64545'
    return (
        <svg viewBox={`0 0 ${GRID_W} ${GRID_H}`} preserveAspectRatio="xMidYMid meet"
             className={className} style={{ background: '#2f2113', borderRadius: 6, border: '1px solid #120a06' }}>
            {/* Couloir (route des ennemis) — plus contrasté */}
            {CORRIDOR_CELLS.map((c, i) => (
                <rect key={i} x={c.x} y={c.y} width={1} height={1} fill="#6b4f2c" />
            ))}
            {/* Entrée (spawn) : petit triangle vert */}
            <circle cx={PATH_START.x + 0.5} cy={PATH_START.y + 0.5} r={0.5} fill="#3a7a12" stroke="#dff0c8" strokeWidth={0.12} />
            {/* Château (fin du chemin), coloré selon ses PV */}
            <rect x={PATH_END.x - 0.5} y={PATH_END.y - 0.5} width={2} height={2} rx={0.2}
                  fill={castleColor} stroke="#2a1a0a" strokeWidth={0.18} />
            {/* Tours (couleur par type) */}
            {towers.map((t, i) => (
                <rect key={`t${i}`} x={t.x + 0.12} y={t.y + 0.12} width={0.76} height={0.76} rx={0.15}
                      fill={TOWER_COLOR[t.type] ?? '#cccccc'} stroke="#1a1109" strokeWidth={0.08} />
            ))}
            {/* Ennemis (taille/couleur par type) */}
            {enemies.map((e, i) => {
                const s = ENEMY_STYLE[e.type] ?? ENEMY_DEFAULT
                return (
                    <circle key={`e${i}`} cx={e.x + 0.5} cy={e.y + 0.5} r={s.r}
                            fill={s.color} stroke="#1a0f0f" strokeWidth={0.06} />
                )
            })}
        </svg>
    )
}
