// Aperçu manuel de la vraie scène ; états synthétiques, sans compte ni serveur de jeu.
// Les règles serveur sont couvertes par SeasonalTerrainTest, pas par cet aperçu.
import Phaser from 'phaser'
import { GameScene, type TowerData } from '@/components/game/GameScene'
import { FLOOD_CELLS, LEAF_CELLS, type TerrainSnapshot } from '@/components/game/seasons'
import { getMapDef } from '@/components/game/maps'

const map = getMapDef(new URLSearchParams(location.search).get('map') ?? 'spring')
const panel = document.createElement('div')
panel.style.cssText = 'color:#f4ead2;font:14px sans-serif;padding:12px;max-width:1000px'
panel.innerHTML = `<strong>Aperçu saisonnier — ${map.name}</strong> · États de test synthétiques
<nav style="margin:10px 0">${['desert', 'fourche', 'spring', 'autumn'].map(id => `<a style="color:#efc978;margin-right:16px" href="?map=${id}">${getMapDef(id).name}</a>`).join('')}</nav>
<div id="controls"></div><p id="status">Chargement…</p><p id="measure"></p>`
document.body.prepend(panel)
const gameEl = document.getElementById('game')!
gameEl.style.width = '800px'; gameEl.style.height = '640px'
const scene = new GameScene()
scene.setActiveMap(map.id)
const towers: TowerData[] = map.id === 'spring' ? [
    { id: 'bank', type: 'ARCHER', x: 10, y: 6, level: 1, hp: 100, maxHp: 100 },
    { id: 'high', type: 'MAGE', x: 5, y: 3, level: 1, hp: 100, maxHp: 100 },
] : [{ id: 'catapult', type: 'CATAPULT', x: 10, y: 4, level: 1, hp: 100, maxHp: 100 }]
const dry: TerrainSnapshot = { flooded: false, burning: [], burned: [], disabledTowers: [] }
let running = false
const samples: number[] = []
const originalStep = Phaser.Game.prototype.step
Phaser.Game.prototype.step = function(time: number, delta: number) {
    const start = performance.now()
    originalStep.call(this, time, delta)
    if (running) samples.push(performance.now() - start)
}
function show(state: TerrainSnapshot, label: string) {
    scene.pushCoopSnapshot([], towers, [], state)
    document.getElementById('status')!.textContent = label
}
function button(label: string, action: () => void) {
    const b = document.createElement('button'); b.textContent = label
    b.style.cssText = 'padding:7px 12px;margin-right:8px;cursor:pointer'
    b.onclick = () => { if (!running) action() }
    document.getElementById('controls')!.append(b)
}
scene.setOnCoopReady(() => {
    show(dry, 'Terrain au repos')
    button('Terrain au repos', () => show(dry, 'Terrain au repos'))
    if (map.id === 'spring') {
        button('Annonce de crue', () => {
            scene.setTerrainForecast({ type: 'SPRING', flooded: true, affectedCells: FLOOD_CELLS })
            document.getElementById('status')!.textContent = 'Prochaine vague : crue'
        })
        button('Crue active', () => show({ ...dry, flooded: true, disabledTowers: ['bank'] }, 'Crue active — archer suspendu, mage actif'))
    }
    if (map.id === 'autumn') {
        button('Feu actif', () => show({ ...dry, burning: LEAF_CELLS.slice(0, 4) }, 'Première nappe en feu'))
        button('Cendres', () => show({ ...dry, burned: LEAF_CELLS.slice(0, 4) }, 'Première nappe consommée'))
    }
    button('Tester fin de vague', () => {
        scene.playWave([{ tick: 1, enemies: [], damageEvents: [], towerDamageEvents: [], deaths: [], reachedCastle: [], destroyedTowers: [], bossAbilityEvents: [], stunnedTowers: [], castleAttacks: [], castleHp: 100, terrain: { ...dry, flooded: map.id === 'spring', burning: map.id === 'autumn' ? LEAF_CELLS : [], disabledTowers: ['bank'] } }], undefined, () => {
            document.getElementById('status')!.textContent = 'Vague terminée — terrain réinitialisé'
        })
    })
    button('Mesurer 8 secondes', () => {
        samples.length = 0
        running = true
        document.getElementById('measure')!.textContent = 'Mesure CPU du rendu en cours…'
        setTimeout(() => {
            running = false
            samples.sort((a, b) => a - b)
            document.getElementById('measure')!.textContent = `${samples.length} images · CPU moyen ${(samples.reduce((a,b) => a+b,0)/samples.length).toFixed(2)} ms · p95 ${samples[Math.floor(samples.length*0.95)]?.toFixed(2)} ms (état courant, hors charge réseau)`
        }, 8000)
    })
})
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', backgroundColor: '#0f172a', scene, pixelArt: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 800, height: 640 } })
