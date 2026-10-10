// Génération de la vague du banc de charge : déterministe (même graine → même
// vague). Partagée par scripts/perf-bench (mesure du jeu web) et
// scripts/visual-export (fichier rejoué par le client Godot) : les deux
// mesurent EXACTEMENT la même vague.
import type { TowerData, TickSnapshot, EnemySnapshot } from '@/components/game/GameScene'
import type { MapDef } from '@/components/game/maps'
import { towerRangeAt } from '@/store/catalogStore'

// PRNG déterministe (mulberry32) : deux runs = exactement la même vague.
function rng(seed: number) {
    return () => {
        seed |= 0
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export function buildBenchWave(map: MapDef, enemyCount: number, towerCount: number, seed: number) {
    const rand = rng(seed)

    // ── Chemin : position à une distance d (en cases) le long de la 1re voie ──
    const waypoints = map.waypoints
    const segments = waypoints.slice(1).map((b, i) => {
        const a = waypoints[i]
        return { a, b, len: Math.abs(b.x - a.x) + Math.abs(b.y - a.y) }
    })
    const pathLength = segments.reduce((sum, s) => sum + s.len, 0)
    function positionAt(distance: number) {
        let d = distance
        for (const s of segments) {
            if (d <= s.len) {
                const t = d / s.len
                return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t }
            }
            d -= s.len
        }
        return { ...waypoints[waypoints.length - 1] }
    }

    // ── Tours : réparties régulièrement sur la bande constructible ──
    const buildable = [...map.path.buildableSet]
        .map((k) => { const [x, y] = k.split(',').map(Number); return { x, y } })
        .filter((c) => c.y >= 1)
        .sort((a, b) => a.y - b.y || a.x - b.x)
    const TYPES: TowerData['type'][] = ['ARCHER', 'MAGE', 'CATAPULT', 'BALLISTA']
    const towers: TowerData[] = []
    const stride = Math.max(1, Math.floor(buildable.length / Math.max(1, towerCount)))
    for (let i = 0; i < buildable.length && towers.length < towerCount; i += stride) {
        const type = TYPES[towers.length % TYPES.length]
        towers.push({
            id: `t${towers.length}`, type, x: buildable[i].x, y: buildable[i].y,
            level: 1 + Math.floor(rand() * 3), hp: 300, maxHp: 300,
            damageType: type === 'MAGE' ? 'CONTINUOUS' : type === 'CATAPULT' ? 'AOE' : 'SINGLE_TARGET',
            splashRadius: type === 'CATAPULT' ? 1 : undefined,
        })
    }

    // ── Vague : mix de types, PV gonflés pour garder une foule à l'écran ──
    // [type, poids, vitesse (cases/tick), PV]
    const MIX: [string, number, number, number][] = [
        ['GOBLIN', 50, 0.16, 1600], ['ORC', 20, 0.12, 3000], ['TROLL', 8, 0.08, 8000],
        ['SAPEUR', 10, 0.12, 2200], ['CHARIOT', 6, 0.1, 5000], ['DARK_KNIGHT', 6, 0.1, 6000],
    ]
    const COOLDOWN: Record<string, number> = { ARCHER: 2, MAGE: 1, CATAPULT: 8, BALLISTA: 8 }
    const DAMAGE: Record<string, number> = { ARCHER: 14, MAGE: 9, CATAPULT: 45, BALLISTA: 120 }

    type SimEnemy = { id: string; type: string; speed: number; hp: number; maxHp: number; d: number; spawn: number; alive: boolean }
    const totalWeight = MIX.reduce((sum, m) => sum + m[1], 0)
    const sims: SimEnemy[] = Array.from({ length: enemyCount }, (_, i) => {
        let r = rand() * totalWeight
        let pick = MIX[0]
        for (const m of MIX) { if ((r -= m[1]) < 0) { pick = m; break } }
        return { id: `e${i}`, type: pick[0], speed: pick[2], hp: pick[3], maxHp: pick[3], d: 0, spawn: i * 3, alive: true }
    })

    const ticks: TickSnapshot[] = []
    let reachedCount = 0
    for (let tick = 0; tick < 4000 && enemyCount > 0; tick++) {
        const deaths: string[] = []
        const reached: string[] = []
        for (const s of sims) {
            if (!s.alive || tick < s.spawn) continue
            s.d += s.speed
            if (s.d >= pathLength) { s.alive = false; reached.push(s.id); reachedCount++ }
        }
        const live = sims.filter((s) => s.alive && tick >= s.spawn).map((s) => ({ s, p: positionAt(s.d) }))
        const damageEvents: TickSnapshot['damageEvents'] = []
        for (const t of towers) {
            if (tick % COOLDOWN[t.type] !== 0) continue
            const range = towerRangeAt(t.type, t.level)
            let target: (typeof live)[number] | null = null
            let best = Infinity
            for (const e of live) {
                if (e.s.hp <= 0) continue
                const dist = Math.hypot(e.p.x - t.x, e.p.y - t.y)
                if (dist <= range && dist < best) { target = e; best = dist }
            }
            if (!target) continue
            const center = target
            const hits = t.type === 'CATAPULT'
                ? live.filter((e) => e.s.hp > 0 && Math.hypot(e.p.x - center.p.x, e.p.y - center.p.y) <= 1)
                : [target]
            for (const e of hits) {
                const dmg = DAMAGE[t.type] * (1 + ((t.level ?? 1) - 1) * 0.6)
                e.s.hp -= dmg
                damageEvents.push({ towerId: t.id, enemyId: e.s.id, damage: dmg })
            }
        }
        for (const e of live) if (e.s.hp <= 0 && e.s.alive) { e.s.alive = false; deaths.push(e.s.id) }
        const enemies: EnemySnapshot[] = live.filter((e) => e.s.alive).map((e) => ({
            id: e.s.id, type: e.s.type, x: e.p.x, y: e.p.y, hp: Math.max(0, Math.round(e.s.hp)), maxHp: e.s.maxHp,
        }))
        ticks.push({
            tick, stunnedTowers: [], enemies, damageEvents, towerDamageEvents: [], deaths,
            reachedCastle: reached, destroyedTowers: [], bossAbilityEvents: [], castleAttacks: [], castleHp: 100,
        })
        if (enemies.length === 0 && sims.every((s) => !s.alive)) break
    }
    return { towers, ticks, reachedCount }
}
