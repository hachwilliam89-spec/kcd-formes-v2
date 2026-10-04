import { paintSeasonalTerrain, roadTreeSpots, castleTreeSpots, recolorFoliage, TREES, FOLIAGE_TINTS } from './seasonalTerrain'
import { paintCastle, FORT_WIDTH, FORT_HEIGHT, PORTAL_FRAMES } from './castles'
import { BANK_CELLS, LAKE, FOG_RANGE_PENALTY, type TerrainSnapshot, type TerrainForecast } from './seasons'
import Phaser from 'phaser'
import type { Cell } from './constants'
import { TOP_RESERVED_ROWS, MAX_WALLS, towerRangeAt } from './constants'
import { GAME_MAPS, DEFAULT_MAP_ID, getMapDef, mapIsCorridor, mapIsBuildable, mapPathDir, mapLaneStarts, mapCastle } from './maps'
import { audio, Sfx } from '@/lib/audio'

// Association effet visuel d'impact → bruitage, avec un intervalle mini (ms) pour
// éviter de superposer 10 sons identiques quand une AOE touche plein d'ennemis.
const IMPACT_SFX: Record<string, { sfx: Sfx; gap: number; vol?: number }> = {
    explosion: { sfx: 'catapult_impact', gap: 60 }, // impact catapulte = thud de rocher
    destroy: { sfx: 'tower_destroy', gap: 60, vol: 1 }, // son propre, distinct de la catapulte
    bigboom: { sfx: 'explosion', gap: 40 }, // chute du château = explosion (synthèse)
    // 'fireball' (impact magique du Mage) : PAS de son d'impact — c'est le
    // crépitement de flamme continu (shoot_mage) qui porte le Mage. Un impact
    // ici rajoutait un "pop" sec cadencé.
    heavy: { sfx: 'impact_hit', gap: 70 },
    frost: { sfx: 'frost_impact', gap: 200, vol: 0.9 }, // impact = sort "epic"
    // 'firearrow' (flèche du château qui touche) : pas de son d'impact — c'est le
    // sifflement au tir (shoot_arrow) qui porte l'action.
}

// Pitch du gémissement de mort selon le gabarit : gros ennemis = voix plus grave
// (rate < 1), petits = plus aiguë. Donne de la variété avec un seul asset.
const DEATH_PITCH: Record<string, number> = {
    GOBLIN: 1.18, SAPEUR: 1.12, ORC: 1.0, DARK_KNIGHT: 0.95,
    CHARIOT: 0.95, TROLL: 0.82, BOSS_WARLORD: 0.68,
}

const CELL_SIZE = 40
const GRID_WIDTH = 20
const GRID_HEIGHT = 16   // 15 rangées jouables + 1 rangée tampon en haut (voir TOP_RESERVED_ROWS)
const TICK_DELAY_MS = 120

export interface TowerData {
    id: string
    type: 'ARCHER' | 'MAGE' | 'CATAPULT' | 'BALLISTA' | 'WALL'
    x: number
    y: number
    // Renvoyés par le backend (TowerResponse) — pilotent le rendu visuel des
    // effets de combat (voir drawEffects) sans dupliquer côté frontend la
    // logique de profil de dégâts définie dans TowerType côté Java.
    damageType?: 'SINGLE_TARGET' | 'AOE' | 'CONTINUOUS'
    splashRadius?: number
    // PV courants/max de la structure — absents tant que le backend n'a pas
    // été redéployé avec le champ (voir GameMapMapper) ; dans ce cas on ne
    // dessine simplement pas de barre de vie pour la tour.
    hp?: number
    maxHp?: number
    // Niveau d'amélioration (coût/dégâts croissants, voir UpgradeTowerService) et
    // priorité de tir choisie par le joueur (voir TargetingMode) — renvoyés par le
    // backend (TowerResponse) et utilisés par la carte de tour (voir game/page).
    level?: number
    targetingMode?: 'CLOSEST' | 'FIRST' | 'STRONGEST'
}

// Verdict de pose pour l'aperçu de construction : la scène applique les règles
// de terrain (terrainVerdict : case libre, couloir, bande constructible, limite
// de murs), puis, si elles passent, le validateur de la page (or disponible…).
export interface PlacementVerdict {
    ok: boolean
    reason?: string // raison courte d'un refus, affichée au-dessus de la case
    cost?: number   // coût affiché quand la pose est possible
}

export interface EnemySnapshot {
    id: string
    type: string
    x: number
    y: number
    hp: number
    maxHp: number
}

export interface DamageEvent {
    towerId: string
    enemyId: string
    damage: number
}

// Dégât infligé par un Sapeur à la tour qu'il assiège (voir
// WaveSimulationService.TowerDamageEvent côté backend) — distinct de
// DamageEvent (tour → ennemi) puisque le sens de l'attaque est inversé ici.
export interface TowerDamageEvent {
    enemyId: string
    towerId: string
    damage: number
}

// Pulsation d'aura/AoE d'un Boss (voir WaveSimulationService.BossAbilityEvent
// côté backend) : un évènement par Boss à chaque déclenchement, même quand
// alliesHealed/towersHit valent 0 — sert à animer le pulse à l'écran.
export interface BossAbilityEvent {
    bossId: string
    x: number
    y: number
    alliesHealed: number
    towersHit: number
}

export interface TickSnapshot {
    terrain?: TerrainSnapshot
    tick: number
    // Tours étourdies par le pulse d'un Boss pendant ce tick (état complet par
    // tick, recalculé côté backend) : grisées tant qu'elles y figurent — le
    // frontend ne compte aucune durée lui-même.
    stunnedTowers: string[]
    enemies: EnemySnapshot[]
    damageEvents: DamageEvent[]
    towerDamageEvents: TowerDamageEvent[]
    deaths: string[]
    reachedCastle: string[]
    destroyedTowers: string[]
    bossAbilityEvents: BossAbilityEvent[]
    // Ennemis touchés par la défense du château ce tick (tir des remparts).
    castleAttacks?: string[]
    castleHp: number
}

// Couleurs par type de tour
const TOWER_COLORS: Record<string, number> = {
    ARCHER: 0x22c55e,   // vert
    MAGE: 0x8b5cf6,     // violet
    CATAPULT: 0xf97316, // orange
    BALLISTA: 0x94a3b8, // gris-bleu
    WALL: 0x78716c,     // pierre — structure passive, volontairement terne
}

// Largeur affichée des tours, en cases (la hauteur suit les proportions du
// sprite). < 1 : la silhouette tient dans SA case avec ~2 px de marge de chaque
// côté → deux tours voisines ne se chevauchent plus et on voit d'un coup d'œil
// quelle case appartient à quelle tour. Elles ne débordent que vers le haut, où
// le tri par profondeur (unitDepth) fait passer le premier plan devant.
// Réglable par modèle (avant : 1.25 pour toutes → débord sur les voisines).
const TOWER_WIDTH: Record<string, number> = {
    ARCHER: 0.9, MAGE: 0.9, CATAPULT: 0.9, BALLISTA: 0.9,
}
const DEFAULT_TOWER_WIDTH = 0.9
// Mur : barricade centrée et orientée sur le couloir (pas une tour) — inchangé.
const WALL_WIDTH = 1.3

// Profondeurs d'affichage (setDepth). Sol, décor et calques Graphics « au sol »
// restent ≤ 0 ; les UNITÉS (tours, armes, ennemis) sont triées par la position
// de leurs pieds — plus bas à l'écran = devant — dans une plage étroite au-dessus ;
// les repères d'interface passent par-dessus (pastilles 6, projectiles 9, impacts 10).
const DEPTH_RANGE = 0.5  // cercle de portée (tour survolée/sélectionnée), sous les unités
const DEPTH_UNITS = 1    // + pieds (en cases) / 100 → 1.00 … 1.17
const DEPTH_FOCUS = 4.5  // cadre de survol / coins de sélection, au-dessus des unités
const DEPTH_BARS = 5     // barres de vie (tours + ennemis), toujours lisibles
const DEPTH_LABEL = 7     // étiquette de l'aperçu de pose (coût / raison du refus)
const DEPTH_WATER = 0.35 // eau de crue (printemps), sous les tours qui y ont les pieds
const DEPTH_FOG = 3      // brume (automne), au-dessus des tours qu'elle pénalise
const DEPTH_RAIN = 58    // pluie (printemps), sous la neige (60)
const DEPTH_PUDDLES = -1.5 // flaques de pluie : sur le sol et la route, sous les parcelles (-1)
const RAIN_ANGLE = 12    // inclinaison des gouttes (vent), en degrés
const unitDepth = (footCellY: number) => DEPTH_UNITS + footCellY / 100

// Mirage (biome désert) : longueur d'onde de la texture tuilée (~2π/0.035, la
// fréquence d'origine) et amplitude dessinée dans la texture.
const HEAT_WAVELENGTH = 180
const HEAT_TEX_AMP = 3

// Police de lecture pour les textes du canvas (étiquettes) : simple et nette,
// la pixel/médiévale reste réservée à l'habillage.
const READABLE_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'

// Survol / sélection d'une tour posée (voir refreshFocus). La tour est éclaircie
// (teinte en mode SCREEN), jamais agrandie : grossir recréerait le chevauchement.
const HOVER_COLOR = 0xf5ecd0  // crème : survol
const SELECT_COLOR = 0xf2c94c // or : sélection (même or que les pastilles de palier)
const HOVER_TINT = 0x3a3a3a   // éclaircie neutre
const SELECT_TINT = 0x4a3c12  // éclaircie chaude, dorée

// Couleurs par type d'ennemi
const ENEMY_COLORS: Record<string, number> = {
    GOBLIN: 0x84cc16,      // vert clair
    ORC: 0xb45309,         // marron
    TROLL: 0x6b7280,       // gris
    DARK_KNIGHT: 0x4338ca, // violet sombre
    SAPEUR: 0xdc2626,      // rouge — signale visuellement la menace sur les tours
    CHARIOT: 0x0ea5e9,     // cyan acier — l'engin de siège qui tire en avançant
    BOSS_WARLORD: 0xeab308, // or — distinct de tout le reste, signale le premier boss
}

// Taille du sprite par type, en cases (setDisplaySize). Hiérarchie voulue :
// la piétaille (Goblin) est petite, les brutes (Orc puis Troll) plus grosses,
// et le Boss domine nettement. Les autres restent à une taille intermédiaire.
const ENEMY_SCALE: Record<string, number> = {
    GOBLIN: 1.4,
    ORC: 1.9,
    TROLL: 2.3,
    SAPEUR: 1.4,       // menace anti-tours, pas un colosse : taille d'un Goblin
    CHARIOT: 1.9,
    DARK_KNIGHT: 1.9,  // taille d'un Orc
    BOSS_WARLORD: 3.8,
}

// Couleur de la ligne de siège (Sapeur → tour visée), distincte des couleurs
// de tir des tours pour ne jamais être confondue avec une attaque de tour.
const SIEGE_LINE_COLOR = 0xdc2626

// Rayon continu du Boss (profil "tour Mage" inversé, voir EnemyType.rayDamage) :
// violet pour évoquer la magie du Mage tout en restant distinct du rouge Sapeur.
const BOSS_RAY_COLOR = 0x8b5cf6

// Couleurs des pulsations de Boss (voir drawBossAbilityEvents) : vert pour le
// soin de zone, orange pour l'attaque de zone — pour rester cohérent avec les
// codes couleur déjà utilisés ailleurs (vert = positif, orange/rouge = dégâts).
const BOSS_HEAL_PULSE_COLOR = 0x22c55e
const BOSS_AOE_PULSE_COLOR = 0xf97316

// Atlas d'ennemis (voir preload / manifest.json) : frames 96x96, 12 frames de
// marche (index 0-11) puis 10 de mort (12-21). SPRITE_ENEMY_TYPES : types dont
// l'atlas est branché — les autres restent en formes géométriques le temps de
// la généralisation.
const SPRITE_CELL = 96
const SPRITE_WALK = { start: 0, end: 11 }
const SPRITE_DIE = { start: 12, end: 21 }
const SPRITE_ATTACK = { start: 22, end: 31 }
const SPRITE_ENEMY_TYPES = [
    'GOBLIN', 'ORC', 'TROLL', 'SAPEUR', 'CHARIOT', 'DARK_KNIGHT', 'BOSS_WARLORD',
]

// Effets d'impact animés (public/sprites/effects/) : jouent une fois à la
// position de l'ennemi touché, puis s'auto-détruisent. Mappés par type de tour.
const EFFECT_CELL = 64
const EFFECT_KEYS = ['heavy', 'explosion', 'fireball', 'firearrow', 'destroy', 'frost', 'bigboom']
const TOWER_IMPACT: Record<string, string> = {
    ARCHER: 'firearrow',   // flèche de feu à l'impact
    BALLISTA: 'heavy',     // gros impact perçant (perce-blindage)
    CATAPULT: 'explosion', // nuage de poussière (impact de rocher)
    // MAGE : boule de feu cadencée sur son rayon continu (voir drawEffects).
}
// Période (en frames) entre deux éclats de magie du Mage — l'anim dure ~8
// frames/20fps ≈ 400ms, une période de 3 ticks donne un scintillement quasi
// continu sans chevauchement excessif.
const MAGIC_FX_PERIOD = 3

// Projectiles volants (public/sprites/projectiles/) : petits sprites animés
// (3 frames) tirés de la tour vers la cible, l'impact éclate à l'arrivée. Le
// sprite d'origine pointe vers le HAUT, on le fait pivoter dans la direction
// du tir. frameW = largeur planche / 3.
const PROJECTILES: Record<string, { key: string; frameW: number; frameH: number }> = {
    ARCHER: { key: 'bolt', frameW: 6, frameH: 26 },
    BALLISTA: { key: 'arrow', frameW: 8, frameH: 40 },
}
const PROJECTILE_KEYS = ['arrow', 'bolt', 'icebolt']
// Dard de glace du Démon de givre (10 frames 32×48), tiré vers la tour visée.
const ICEBOLT = { frameW: 32, frameH: 48 }

// Tours à arme animée : planche pré-composée (base + arme à chaque pose), jouée
// au tir. loop=true pour le rayon continu du Mage (canalise tant qu'il vise),
// false pour un tir ponctuel (Archer, Baliste, Catapulte) qui rejoue puis revient
// au repos (frame 0). Dimensions issues de la génération des planches.
const TOWER_ANIM: Record<string, { frameW: number; frameH: number; fps: number; loop: boolean }> = {
    MAGE:     { frameW: 64, frameH: 104, fps: 16, loop: true },
}

// Tours à ARME ROTATIVE (Archer, Baliste) : base statique + sprite d'arme
// superposé qui PIVOTE vers la cible au tir (les autres tours restent des
// composites figés vers le haut). base = ${type}_base.png (64 de large),
// weapon = ${type}_weapon.png (spritesheet frameW×frameH×frames). pivotY = ancre
// verticale de rotation dans la frame d'arme (~grip). mountFrac = position du
// pivot sur la base, en fraction de hauteur depuis le HAUT de la base.
const ROT_WEAPON: Record<string, {
    frameW: number; frameH: number; frames: number; fps: number; pivotX: number; pivotY: number; mountFrac: number
}> = {
    ARCHER:   { frameW: 28, frameH: 45, frames: 6, fps: 18, pivotX: 0.5, pivotY: 0.82, mountFrac: 0.30 },
    BALLISTA: { frameW: 40, frameH: 67, frames: 6, fps: 16, pivotX: 0.5, pivotY: 0.82, mountFrac: 0.28 },
    // Marteau à long manche : tourne sur lui-même autour du MILIEU de la tige
    // (pivotX sur l'axe du manche, pivotY au centre), monté sur la couronne.
    CATAPULT: { frameW: 20, frameH: 104, frames: 17, fps: 32, pivotX: 0.5, pivotY: 0.5, mountFrac: 0.35 },
}

// Tours à sprite (bâtiments statiques, public/sprites/towers/). Les 5 types y
// figurent : le rendu géométrique (carrés) n'est plus qu'un repli si l'image
// manque.
const TOWER_SPRITE_TYPES = ['ARCHER', 'MAGE', 'CATAPULT', 'BALLISTA', 'WALL']

export class GameScene extends Phaser.Scene {
    private towersGraphics!: Phaser.GameObjects.Graphics
    private enemiesGraphics!: Phaser.GameObjects.Graphics
    // Calque dédié aux effets de combat (rayon continu, cercle de zone, tir
    // mono-cible) — séparé de enemiesGraphics pour pouvoir le vider/redessiner
    // indépendamment à chaque tick sans repasser par drawEnemies.
    private effectsGraphics!: Phaser.GameObjects.Graphics
    // Aperçu de pose : surbrillance verte/rouge de la case survolée + cercle de
    // portée du type à poser. Actif seulement si buildPreviewType est posé (via
    // setBuildPreview, solo comme multi).
    private previewGraphics!: Phaser.GameObjects.Graphics
    private buildPreviewType: string | null = null
    private terrainForecast?: TerrainForecast
    private terrainLayer?: Phaser.GameObjects.Image
    private terrainKey = ''
    private seasonalCombat = false
    // Brume (automne) : cases de la vague affichée (portées), nappe et sa signature.
    private currentFog = new Set<string>()
    private fogImages: Phaser.GameObjects.Image[] = []
    private fogSignature = ''
    private fogSerial = 0
    // Boue (automne) : flaques de la vague affichée ; une averse accompagne chaque déplacement.
    private mudImage?: Phaser.GameObjects.Image
    private mudSignature = ''
    private mudSerial = 0
    private rainShowerTimer?: Phaser.Time.TimerEvent
    // Crue (printemps) : eau sur les berges, gouttes de pluie et voile d'averse.
    private floodLayers: { water: Phaser.GameObjects.Image; glints: Phaser.GameObjects.Image; glintX: number; axis: 'x' | 'y' }[] = []
    private floodSignature = ''
    private bankAlertLayer?: Phaser.GameObjects.Image
    private rippleCells: Cell[] = []
    // Grêle (printemps) : grêlons réutilisés, rebonds au sol, voile froid.
    private hailStones: { img: Phaser.GameObjects.Image; x: number; y: number; v: number; land: number }[] = []
    private hailVisible = 0
    private hailLevel: 'none' | 'light' | 'storm' = 'none'
    private hailShade?: Phaser.GameObjects.Image
    private hailBounces: Phaser.GameObjects.Image[] = []
    private hailBounceNext = 0
    private floodWakes = new Map<string, Phaser.GameObjects.Image>()
    private rainDrops: { img: Phaser.GameObjects.Image; x: number; y: number; v: number }[] = []
    private rainLevel: 'none' | 'drizzle' | 'storm' = 'none'
    private rainVisible = 0
    private rainShade?: Phaser.GameObjects.Image
    private rippleTimer?: Phaser.Time.TimerEvent
    private ripples: Phaser.GameObjects.Image[] = []
    private puddles?: Phaser.GameObjects.Image
    private puddleSpots: { x: number; y: number; rw: number; rh: number }[] = []
    private puddleRippleTimer?: Phaser.Time.TimerEvent
    private puddleRipples: Phaser.GameObjects.Image[] = []
    private hoverCell: { x: number; y: number } | null = null
    // Repères de la tour survolée / sélectionnée (voir refreshFocus) : cercle de
    // portée SOUS les unités, cadre et coins dorés AU-DESSUS.
    private rangeGraphics!: Phaser.GameObjects.Graphics
    private focusGraphics!: Phaser.GameObjects.Graphics
    // Barres de vie des ennemis : calque à part, au-dessus des unités, pour qu'un
    // ennemi qui passe derrière une tour garde sa jauge visible.
    private enemyBarsGraphics!: Phaser.GameObjects.Graphics
    // Inspection des tours posées au survol (voir setTowerInspect) et tour
    // sélectionnée par la page (voir setSelectedTower).
    private inspectEnabled = false
    private hoveredTowerId: string | null = null
    private selectedTowerId: string | null = null
    // Aperçu de pose : validateur fourni par la page (or, limite de murs…),
    // silhouette translucide de la tour à poser et étiquette coût / refus.
    private placementValidator?: (type: string, x: number, y: number) => PlacementVerdict
    private ghost: {
        type: string
        base: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite
        weapon?: Phaser.GameObjects.Sprite
    } | null = null
    private ghostLabel?: Phaser.GameObjects.Text
    // Prévenu quand les PV / la présence des tours changent PENDANT une vague solo
    // (siège, destruction) : la carte de tour de la page reste juste en combat.
    private onTowersLive?: (towers: TowerData[]) => void
    // Solo : deux derniers ticks rendus, interpolés image par image dans update()
    // (comme la coop) → déplacements continus au lieu de sauts toutes les 120 ms.
    private soloPrev: { enemies: EnemySnapshot[]; t: number } | null = null
    private soloCurr: {
        enemies: EnemySnapshot[]; t: number
        deaths: string[]; attacking: Set<string>; reached: Set<string>
    } | null = null
    // Positions définitives du tick courant déjà dessinées : inutile de redessiner
    // jusqu'au tick suivant.
    private soloSettled = false

    // Map active (tracé + biome). Fixée par le canvas AVANT le boot de la scène
    // (setActiveMap) ; create() rend alors le bon terrain/décor. Défaut = désert.
    private activeMapId: string = DEFAULT_MAP_ID
    setActiveMap(id: string) { this.activeMapId = id }
    private get mapDef() { return getMapDef(this.activeMapId) }
    private get pathStart(): Cell { return this.mapDef.waypoints[0] }
    private get pathEnd(): Cell { return this.mapDef.waypoints[this.mapDef.waypoints.length - 1] }
    private onCellClick?: (x: number, y: number) => void
    // Effet d'ambiance neige (biome snow) : flocons mis à jour chaque frame.
    // Particules d'ambiance (neige / sable soufflé) : une petite Image par grain,
    // déplacée chaque frame — regroupées par le moteur en un seul lot de quads,
    // bien moins cher que des cercles redessinés dans un Graphics (voir bakeStatic).
    private snowflakes: { img: Phaser.GameObjects.Image; x: number; y: number; vy: number; vx: number }[] = []
    // Mirage / ondes de chaleur (biome desert) : lignes ondulantes animées.
    // Lignes du mirage : une bande d'onde tuilée par ligne, défilée et pulsée.
    private heatLines: Phaser.GameObjects.TileSprite[] = []
    // Ombres portées du décor, regroupées puis figées en une texture (voir bakeDecorShadows).
    private decorShadows?: Phaser.GameObjects.Graphics
    private heatPhase = 0
    private waveTimer?: Phaser.Time.TimerEvent
    // Fonction de rendu du tick courant, conservée pour reprendre après une pause
    // de tuto (voir playWave / resumeWave).
    private waveRender?: () => void
    // Compteur de performance (outil de dev, activé par ?perf=1 dans l'URL) :
    // fps, temps CPU d'une image (update + rendu), ennemis et objets affichés.
    private perfEnabled = false
    private perfFrames: number[] = []
    // Évite de rejouer la volée d'explosions du château plusieurs fois (une seule
    // chute par vague).
    private castleFell = false
    // Indexées par id pour retrouver rapidement la tour à l'origine d'un
    // DamageEvent pendant playWave (position + profil de dégâts). Contient des
    // COPIES des données React (voir drawTowers) : les PV y sont décrémentés en
    // direct pendant l'animation (voir renderTick) sans toucher au store.
    private towersById = new Map<string, TowerData>()
    // Pastilles de palier (✦) par tour : Text RÉUTILISÉS d'un redraw à l'autre
    // (seuls le texte et la position sont mis à jour). Les recréer à chaque
    // drawTowers coûtait une texture par tour améliorée — 15 fois par seconde en
    // coop. Celles d'une tour disparue ou redescendue sous le niveau 2 sont
    // détruites en fin de drawTowers (sinon pastille fantôme).
    private towerPips = new Map<string, Phaser.GameObjects.Text>()
    private pipsDrawn = new Set<string>()
    // Tours reçues AVANT que la scène soit prête (create() est asynchrone) :
    // rejouées à la fin de create(). Cas typique : reprise de partie persistée
    // (gameId en localStorage) où la réponse du serveur peut arriver avant
    // l'initialisation de Phaser — sans ce tampon, le premier drawTowers était
    // silencieusement perdu et les tours n'apparaissaient jamais à l'écran.
    private pendingTowers: TowerData[] | null = null
    // Sprites d'ennemis animés (CraftPix), indexés par id d'ennemi — réutilisés
    // d'un tick à l'autre, détruits quand l'ennemi disparaît (mort/fuite) ou en
    // fin de vague. Seuls les types listés dans SPRITE_ENEMY_TYPES ont un atlas
    // chargé ; les autres retombent sur les formes géométriques (drawEnemies).
    private enemySprites = new Map<string, Phaser.GameObjects.Sprite>()
    // Images statiques des tours (bâtiments), indexées par id — réutilisées et
    // réconciliées à chaque drawTowers (créées à la pose, retirées à la
    // destruction). Le tir est porté par les effets d'impact, pas par une anim
    // de la tour (voir drawEffects).
    private towerSprites = new Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Sprite>()
    // Sprite d'arme rotative superposé (Archer, Baliste) — clé = id de la tour.
    private towerWeapons = new Map<string, Phaser.GameObjects.Sprite>()
    // Dernier tick où chaque Mage a émis son éclat de magie (cadencé pour un
    // scintillement continu sans spawn à chaque tick — voir drawEffects).
    private magicFxTick = new Map<string, number>()

    // ── Multijoueur coop ──────────────────────────────────────────────────
    // La même scène sert au rendu du flux de snapshots serveur (15 Hz) : au lieu
    // de rejouer une vague pré-calculée (playWave), on reçoit l'état autoritaire
    // et on l'interpole image par image (update). coopActive bascule ce mode.
    private coopActive = false
    private coopPrev: { enemies: EnemySnapshot[]; t: number } | null = null
    private coopCurr: { enemies: EnemySnapshot[]; t: number } | null = null
    // Ennemis disparus entre deux snapshots, classés pour rejouer la bonne anim
    // (le snapshot ne dit pas POURQUOI un ennemi part) : mort (tué par une tour)
    // ou arrivée au château (proche de PATH_END).
    private coopDeaths: string[] = []
    private coopReached = new Set<string>()
    private onCoopReady?: () => void
    // Cadence de la boucle live serveur (voir MatchTicker TICK_MS = 120 ms,
    // aligné sur un tick solo pour un combat fidèle).
    private static readonly COOP_TICK_MS = 120

    constructor() {
        super({ key: 'GameScene' })
    }

    preload() {
        // Atlas d'ennemis (public/sprites/enemies/, voir manifest.json) : une
        // spritesheet horizontale par type, frames 96x96, marche puis mort.
        // Démarrage progressif : le Goblin seul pour valider taille/vitesse
        // avant de généraliser aux 6 autres.
        SPRITE_ENEMY_TYPES.forEach((type) => {
            this.load.spritesheet(`enemy-${type}`, `/sprites/enemies/${type}.png`, {
                frameWidth: SPRITE_CELL,
                frameHeight: SPRITE_CELL,
            })
        })
        // Effets d'impact (slash, gros impact, explosion, magie).
        EFFECT_KEYS.forEach((key) => {
            this.load.spritesheet(`fx-${key}`, `/sprites/effects/${key}.png`, {
                frameWidth: EFFECT_CELL,
                frameHeight: EFFECT_CELL,
            })
        })
        // Sprites de tours (bâtiments statiques, une image par type).
        TOWER_SPRITE_TYPES.forEach((type) => {
            this.load.image(`tower-${type}`, `/sprites/towers/${type}.png`)
        })
        // Projectiles animés (flèche, carreau) : spritesheets 3 frames.
        Object.values(PROJECTILES).forEach(({ key, frameW, frameH }) => {
            this.load.spritesheet(`proj-${key}`, `/sprites/projectiles/${key}.png`, {
                frameWidth: frameW,
                frameHeight: frameH,
            })
        })
        this.load.spritesheet('proj-icebolt', '/sprites/projectiles/icebolt.png', {
            frameWidth: ICEBOLT.frameW,
            frameHeight: ICEBOLT.frameH,
        })
        // Tours à arme animée : planches pré-composées (base + arme). Chaque tour
        // concernée devient un Sprite animé (voir TOWER_ANIM / drawTowers).
        Object.entries(TOWER_ANIM).forEach(([type, a]) => {
            this.load.spritesheet(`tower-${type}-anim`, `/sprites/towers/${type}_sheet.png`, {
                frameWidth: a.frameW,
                frameHeight: a.frameH,
            })
        })
        // Tours à arme rotative : base statique + planche d'arme (voir ROT_WEAPON).
        Object.entries(ROT_WEAPON).forEach(([type, w]) => {
            this.load.image(`tower-${type}-base`, `/sprites/towers/${type}_base.png`)
            this.load.spritesheet(`tower-${type}-weapon`, `/sprites/towers/${type}_weapon.png`, {
                frameWidth: w.frameW,
                frameHeight: w.frameH,
            })
        })
        // Terrain "champ de bataille" (tileset TD pro) : sol terre foncée tuilable
        // + route en terre claire (texture tuilable) masquée en forme de serpentin
        // arrondi (voir drawTerrain) → virages parfaitement nets.
        this.load.image('terrain-ground', '/sprites/terrain/ground.png')
        this.load.image('road_fill', '/sprites/terrain/road_fill.png')
        // Map "terres désolées" pré-composée (terre terne + piste sableuse aux bords
        // naturels) : image unique, rendu garanti (voir buildBakedTerrain).
        for (const m of GAME_MAPS) if (m.image) this.load.image(`map-${m.id}`, m.image)
        // Thème terres désolées / ruines : PAS d'arbres/herbe verts. Ruines "tall"
        // (colonne, tombes, croix, bannières, palissade, feu) calées en HAUTEUR ;
        // "flat" (ossements, tronc, rocher, souche) en LARGEUR ; rochers + petits cailloux.
        for (let i = 1; i <= 8; i++) this.load.image(`decor-ruinT-${i}`, `/sprites/decor/ruinT_${i}.png`)
        for (let i = 1; i <= 4; i++) this.load.image(`decor-ruinF-${i}`, `/sprites/decor/ruinF_${i}.png`)
        for (let i = 1; i <= 4; i++) this.load.image(`decor-rock-${i}`, `/sprites/decor/rock_${i}.png`)
        for (let i = 1; i <= 3; i++) this.load.image(`decor-small-${i}`, `/sprites/decor/small_${i}.png`)   // cailloux / tas de terre
        // Props décoratifs (rochers) pour habiller le champ.
        for (let i = 1; i <= 5; i++) this.load.image(`prop-stone-${i}`, `/sprites/props/stone_${i}.png`)
        // Thème NEIGE / toundra (carte Fourche) : sapins enneigés, arbre nu givré,
        // rochers sous la neige, monticules, + colonne/statue/lanterne/butte/cailloux.
        for (let i = 1; i <= 3; i++) this.load.image(`snow-fir-${i}`, `/sprites/decor/snow/fir_${i}.png`)
        this.load.image('snow-bare', '/sprites/decor/snow/bare_tree.png')
        for (let i = 1; i <= 4; i++) this.load.image(`snow-rock-${i}`, `/sprites/decor/snow/rock_${i}.png`)
        for (let i = 1; i <= 2; i++) this.load.image(`snow-mound-${i}`, `/sprites/decor/snow/mound_${i}.png`)
        this.load.image('snow-column', '/sprites/decor/snow/column.png')
        this.load.image('snow-statue', '/sprites/decor/snow/statue.png')
        this.load.image('snow-lantern', '/sprites/decor/snow/lantern.png')
        this.load.image('snow-dirt', '/sprites/decor/snow/dirt.png')
        this.load.image('snow-pebbles', '/sprites/decor/snow/pebbles.png')
        // Packs fournis localement : ignorés par git, inclus dans le bundle privé d’assets.
        this.load.image('season-plants', '/sprites/seasonal/plants.png')
        this.load.image('season-road', '/sprites/seasonal/garden-road.png')
        // Châteaux : le tien (arrivée, à défendre) + celui de l'ennemi (spawn, décoratif).
        // Fortifications dessinées par biome dans drawPath, sans sprite externe.
    }

    create() {
        this.drawTerrain()
        this.initWeather()

        this.previewGraphics = this.add.graphics() // sous les tours/ennemis (aperçu de pose)
        this.towersGraphics = this.add.graphics()
        this.enemiesGraphics = this.add.graphics()
        this.effectsGraphics = this.add.graphics()
        // towersGraphics ne porte plus que les barres de vie (et le repli
        // géométrique) : au-dessus des sprites, sinon la tour les masquerait.
        this.towersGraphics.setDepth(DEPTH_BARS)
        this.enemyBarsGraphics = this.add.graphics().setDepth(DEPTH_BARS)
        this.rangeGraphics = this.add.graphics().setDepth(DEPTH_RANGE)
        this.focusGraphics = this.add.graphics().setDepth(DEPTH_FOCUS)

        // Animations marche (bouclée) + mort (une fois) par type à sprite.
        SPRITE_ENEMY_TYPES.forEach((type) => {
            if (!this.anims.exists(`${type}-walk`)) {
                this.anims.create({
                    key: `${type}-walk`,
                    frames: this.anims.generateFrameNumbers(`enemy-${type}`, SPRITE_WALK),
                    frameRate: 12,
                    repeat: -1,
                })
            }
            if (!this.anims.exists(`${type}-die`)) {
                this.anims.create({
                    key: `${type}-die`,
                    frames: this.anims.generateFrameNumbers(`enemy-${type}`, SPRITE_DIE),
                    frameRate: 14,
                    repeat: 0,
                })
            }
            if (!this.anims.exists(`${type}-attack`)) {
                this.anims.create({
                    key: `${type}-attack`,
                    frames: this.anims.generateFrameNumbers(`enemy-${type}`, SPRITE_ATTACK),
                    frameRate: 14,
                    repeat: -1,
                })
            }
        })

        // Effets d'impact : one-shot (repeat 0), le sprite s'auto-détruit à la fin.
        EFFECT_KEYS.forEach((key) => {
            if (!this.anims.exists(`fx-${key}`)) {
                this.anims.create({
                    key: `fx-${key}`,
                    frames: this.anims.generateFrameNumbers(`fx-${key}`, {}),
                    frameRate: 20,
                    repeat: 0,
                })
            }
        })

        // Projectiles : anim en boucle (3 frames) jouée pendant le vol.
        PROJECTILE_KEYS.forEach((key) => {
            if (!this.anims.exists(`proj-${key}`)) {
                this.anims.create({
                    key: `proj-${key}`,
                    frames: this.anims.generateFrameNumbers(`proj-${key}`, {}),
                    frameRate: 16,
                    repeat: -1,
                })
            }
        })

        // Tours animées : une anim de tir par type. loop=-1 pour le Mage (rayon
        // continu), 0 pour un tir ponctuel qui revient au repos.
        Object.entries(TOWER_ANIM).forEach(([type, a]) => {
            if (!this.anims.exists(`tower-${type}-fire`)) {
                this.anims.create({
                    key: `tower-${type}-fire`,
                    frames: this.anims.generateFrameNumbers(`tower-${type}-anim`, {}),
                    frameRate: a.fps,
                    repeat: a.loop ? -1 : 0,
                })
            }
        })
        // Anim de tir de l'arme rotative (jouée sur le sprite d'arme, pas la base).
        Object.entries(ROT_WEAPON).forEach(([type, w]) => {
            if (!this.anims.exists(`weapon-${type}-fire`)) {
                this.anims.create({
                    key: `weapon-${type}-fire`,
                    frames: this.anims.generateFrameNumbers(`tower-${type}-weapon`, {}),
                    frameRate: w.fps,
                    repeat: 0,
                })
            }
        })

        // Préchauffage : Phaser n'envoie une texture au GPU qu'à son premier
        // AFFICHAGE (rendu). On joue donc chaque effet une fois DANS le canvas
        // (hors écran il serait "cull" et jamais uploadé), minuscule et quasi
        // transparent — invisible à l'œil mais rendu, ce qui force l'upload.
        // Sans ça, le premier tir montre le trait mais pas encore le sprite.
        EFFECT_KEYS.forEach((key) => {
            const warm = this.add.sprite(2, 2, `fx-${key}`).setScale(0.02).setAlpha(0.02).setDepth(-1)
            warm.play(`fx-${key}`)
            warm.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => warm.destroy())
        })
        PROJECTILE_KEYS.forEach((key) => {
            const warm = this.add.sprite(2, 2, `proj-${key}`).setScale(0.02).setAlpha(0.02).setDepth(-1)
            warm.play(`proj-${key}`)
            this.time.delayedCall(60, () => warm.destroy())
        })

        this.drawGrid()
        this.drawPath()
        this.renderTerrainState()
        this.prewarmShaders()

        // Rejoue les tours arrivées pendant l'initialisation de la scène
        // (reprise de partie : la réponse du serveur peut précéder ce create()).
        if (this.pendingTowers) {
            const pending = this.pendingTowers
            this.pendingTowers = null
            this.drawTowers(pending)
        }

        // Écoute les clics sur le canvas
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            const cellX = Math.floor(pointer.x / CELL_SIZE)
            const cellY = Math.floor(pointer.y / CELL_SIZE)

            // Vérifie seulement que le clic est dans la grille : la règle du
            // couloir (interdit aux tours, obligatoire pour le mur) dépend du
            // type sélectionné, que seule la page connaît — voir handleCellClick.
            if (
                cellX >= 0 && cellX < GRID_WIDTH &&
                cellY >= 0 && cellY < GRID_HEIGHT
            ) {
                this.onCellClick?.(cellX, cellY)
            }
        })

        // Survol : suit la case sous le curseur → inspection des tours posées
        // (refreshFocus) et aperçu de pose. Ne redessine qu'au changement de case.
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            const x = Math.floor(pointer.x / CELL_SIZE)
            const y = Math.floor(pointer.y / CELL_SIZE)
            if (this.hoverCell && this.hoverCell.x === x && this.hoverCell.y === y) return
            this.hoverCell = { x, y }
            if (this.syncHoveredTower()) this.refreshFocus()
            if (this.buildPreviewType) this.drawBuildPreview()
        })
        // Curseur sorti du canvas. 'gameout' et non 'pointerout' : ce dernier ne
        // concerne que les GameObjects interactifs (il n'y en a aucun ici), si bien
        // que l'aperçu restait affiché après avoir quitté le plateau.
        this.input.on(Phaser.Input.Events.GAME_OUT, () => {
            this.hoverCell = null
            this.previewGraphics?.clear()
            this.hideGhost()
            if (this.syncHoveredTower()) this.refreshFocus()
        })

        if (this.perfEnabled) this.setupPerfOverlay()

        // Coop : signale que la scène est prête (textures chargées, calques créés)
        // pour que le canvas commence à pousser les snapshots serveur.
        this.onCoopReady?.()
    }

    /**
     * Préchauffage des shaders. Phaser 4 compile un programme WebGL par NOMBRE de
     * textures distinctes dans un lot de rendu (de 1 à maxTextures), à la première
     * rencontre. En pleine partie, chaque nouveau compte (nouvel ennemi, texte,
     * effet…) déclenchait une compilation bloquante : jusqu'à ~150 ms par
     * programme au banc de charge, 400+ ms cumulés au démarrage d'une vague. On
     * les compile tous ici : pendant quelques images, des lots de 1 à N textures
     * minuscules, cachés sous le terrain (depth -30) et séparés par un Graphics
     * (qui coupe le lot et compile au passage le shader des formes pleines).
     */
    private prewarmShaders() {
        if (!(this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return
        const keys = this.textures.getTextureKeys().filter((k) => !k.startsWith('__'))
        const max = Math.min(this.renderer.maxTextures, keys.length)
        const warm: Phaser.GameObjects.GameObject[] = []
        for (let count = 1; count <= max; count++) {
            for (let i = 0; i < count; i++) {
                warm.push(this.add.image(2, 2, keys[i]).setScale(0.01).setAlpha(0.01).setDepth(-30))
            }
            warm.push(this.add.graphics().setDepth(-30).fillStyle(0xffffff, 0.01).fillRect(0, 0, 1, 1))
        }
        // Quelques images : laisse aussi finir les compilations en parallèle
        // (KHR_parallel_shader_compile), là où le navigateur les propose.
        this.time.delayedCall(400, () => warm.forEach((o) => o.destroy()))
    }

    /** Active le compteur de performance (à appeler avant le boot de la scène). */
    enablePerfOverlay() {
        this.perfEnabled = true
    }

    /**
     * Compteur affiché en haut à gauche, rafraîchi toutes les 500 ms. Le temps CPU
     * est mesuré du début de l'étape (PRE_STEP) à la fin du rendu (POST_RENDER) :
     * c'est le budget à tenir sous ~16 ms pour du 60 fps.
     */
    private setupPerfOverlay() {
        const text = this.add.text(4, 4, '', {
            fontFamily: 'monospace', fontSize: '11px', color: '#9ef59e',
            backgroundColor: 'rgba(0,0,0,0.65)', padding: { x: 4, y: 2 }, resolution: 2,
        }).setDepth(100)
        let stepStart = 0
        this.game.events.on(Phaser.Core.Events.PRE_STEP, () => { stepStart = performance.now() })
        this.game.events.on(Phaser.Core.Events.POST_RENDER, () => { this.perfFrames.push(performance.now() - stepStart) })
        this.time.addEvent({
            delay: 500, loop: true, callback: () => {
                const frames = this.perfFrames
                this.perfFrames = []
                if (frames.length === 0) return
                const avg = frames.reduce((a, b) => a + b, 0) / frames.length
                text.setText(
                    `${Math.round(this.game.loop.actualFps)} fps · CPU ${avg.toFixed(1)} ms (max ${Math.max(...frames).toFixed(1)})`
                    + ` · ${this.enemySprites.size} ennemis · ${this.children.list.length} objets`,
                )
            },
        })
    }

    update(_time: number, delta: number) {
        // Effet d'ambiance (neige qui tombe) — avant tout return, sinon coupé en solo.
        this.updateWeather(delta)
        this.updateRain(delta)
        this.updateHail(delta)

        // Solo : playWave() fournit un tick toutes les TICK_DELAY_MS ; on interpole
        // les ennemis entre les deux derniers pour un mouvement continu à 60 fps.
        // Purement visuel : le combat est déjà résolu côté serveur. Contrepartie :
        // l'affichage a jusqu'à un tick de retard sur la simulation.
        if (this.soloCurr) {
            if (this.soloSettled) return
            const curr = this.soloCurr
            const { enemies, alpha } = this.interpolateEnemies(this.soloPrev, curr, TICK_DELAY_MS)
            this.drawEnemies(enemies, curr.deaths, curr.attacking, curr.reached)
            if (alpha >= 1) this.soloSettled = true
            return
        }

        // Coop : même interpolation entre les deux derniers snapshots serveur.
        if (!this.coopActive || !this.coopCurr) return
        const { enemies } = this.interpolateEnemies(this.coopPrev, this.coopCurr, GameScene.COOP_TICK_MS)
        this.drawEnemies(enemies, this.coopDeaths, new Set(), this.coopReached)
    }

    /**
     * Positions des ennemis entre deux états reçus (alpha 0 → prev, 1 → curr).
     * Un ennemi absent de prev (il vient d'apparaître) est pris à sa position courante.
     */
    private interpolateEnemies(
        prev: { enemies: EnemySnapshot[]; t: number } | null,
        curr: { enemies: EnemySnapshot[]; t: number },
        periodMs: number,
    ): { enemies: EnemySnapshot[]; alpha: number } {
        if (!prev) return { enemies: curr.enemies, alpha: 1 }
        const alpha = Math.min(1, (performance.now() - curr.t) / periodMs)
        if (alpha >= 1) return { enemies: curr.enemies, alpha }
        const prevById = new Map(prev.enemies.map((e) => [e.id, e]))
        const enemies = curr.enemies.map((e) => {
            const p = prevById.get(e.id)
            return p ? { ...e, x: p.x + (e.x - p.x) * alpha, y: p.y + (e.y - p.y) * alpha } : e
        })
        return { enemies, alpha }
    }

    shutdown() {
        this.waveTimer?.remove()
        this.clearEnemySprites()
        for (const sprite of this.towerSprites.values()) sprite.destroy()
        this.towerSprites.clear()
        for (const pips of this.towerPips.values()) pips.destroy()
        this.towerPips.clear()
    }

    // ── API publique appelée depuis React ────────────────────────────────

    setOnCellClick(callback: (x: number, y: number) => void) {
        this.onCellClick = callback
    }

    /**
     * Aperçu de pose : type de tour sélectionné → cercle de portée + case
     * verte/rouge au survol. null = désactive (combat, fin de partie).
     */
    setBuildPreview(type: string | null) {
        this.buildPreviewType = type
        if (!this.previewGraphics) return
        if (!type) { this.previewGraphics.clear(); this.hideGhost(); return }
        this.drawBuildPreview()
    }

    /**
     * Validateur de pose fourni par la page, appliqué après les règles de terrain
     * (voir terrainVerdict) : or disponible, et coût affiché quand la pose passe.
     */
    setPlacementValidator(fn?: (type: string, x: number, y: number) => PlacementVerdict) {
        this.placementValidator = fn
        if (this.buildPreviewType) this.drawBuildPreview()
    }

    /** Abonnement aux PV / destructions de tours pendant une vague solo (voir onTowersLive). */
    setOnTowersLive(callback?: (towers: TowerData[]) => void) {
        this.onTowersLive = callback
    }

    /**
     * Inspection des tours posées au survol : éclaircie + cadre de la case +
     * portée réelle (voir refreshFocus). Activée quand un clic sur une tour la
     * sélectionne vraiment (solo, y compris pendant une vague en lecture seule ;
     * coop et versus) ; coupée sinon pour ne pas suggérer une interaction qui
     * n'existe pas (fin de partie).
     */
    setTowerInspect(enabled: boolean) {
        this.inspectEnabled = enabled
        this.syncHoveredTower()
        this.refreshFocus()
        if (this.buildPreviewType) this.drawBuildPreview()
    }

    /**
     * Tour posée sélectionnée (id, null = aucune) — la même que la carte de tour
     * du panneau : coins dorés sur sa case, éclaircie dorée et portée réelle
     * (niveau compris) tant qu'elle reste sélectionnée.
     */
    setSelectedTower(id: string | null) {
        this.selectedTowerId = id
        this.refreshFocus()
    }

    /**
     * Aperçu de pose sur la case survolée : case verte/rouge, silhouette
     * translucide de la tour à sa taille finale, cercle de portée, et une
     * étiquette — le coût si la pose est possible, sinon la raison du refus.
     */
    private drawBuildPreview() {
        if (!this.previewGraphics) return
        this.previewGraphics.clear()
        const type = this.buildPreviewType
        const cell = this.hoverCell
        const inGrid = !!cell && cell.x >= 0 && cell.x < GRID_WIDTH && cell.y >= 0 && cell.y < GRID_HEIGHT
        // Survol d'une tour posée (inspection active) : c'est elle qu'on met en
        // avant (refreshFocus) — un clic la sélectionne, il ne pose rien.
        if (!type || !cell || !inGrid || this.hoveredTowerId) { this.hideGhost(); return }

        const terrain = this.terrainVerdict(type, cell.x, cell.y)
        const verdict = terrain.ok && this.placementValidator ? this.placementValidator(type, cell.x, cell.y) : terrain
        const ok = verdict.ok

        const px = cell.x * CELL_SIZE, py = cell.y * CELL_SIZE
        const color = ok ? 0x5bbd3a : 0xd64545
        this.previewGraphics.fillStyle(color, 0.3)
        this.previewGraphics.fillRect(px, py, CELL_SIZE, CELL_SIZE)
        this.previewGraphics.lineStyle(2, color, 0.9)
        this.previewGraphics.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2)

        // Cercle de portée (tours à tir uniquement), atténué si la pose est refusée ;
        // réduit si la case sera dans la brume à la prochaine vague.
        const baseRange = towerRangeAt(type)
        const range = baseRange > 0 ? baseRange - this.fogPenaltyAt(cell.x, cell.y) : 0
        if (range > 0) {
            const cx = px + CELL_SIZE / 2, cy = py + CELL_SIZE / 2
            this.previewGraphics.fillStyle(0xffe066, ok ? 0.06 : 0.03)
            this.previewGraphics.fillCircle(cx, cy, range * CELL_SIZE)
            this.previewGraphics.lineStyle(2, 0xffe066, ok ? 0.6 : 0.3)
            this.previewGraphics.strokeCircle(cx, cy, range * CELL_SIZE)
        }

        // Silhouette : la vraie tour, translucide, à sa taille et sa place finales
        // (rougie si refusée) → on juge l'encombrement avant de payer.
        const ghost = this.ensureGhost(type)
        const topY = this.placeTowerParts(type, cell.x, cell.y, ghost.base, ghost.weapon)
        for (const part of [ghost.base, ghost.weapon]) {
            if (!part) continue
            part.setVisible(true).setAlpha(ok ? 0.6 : 0.4)
            if (ok) part.clearTint()
            else part.setTintMode(Phaser.TintModes.MULTIPLY).setTint(0xff7070)
        }

        // Étiquette : coût si la pose est possible, sinon la raison du refus.
        const text = ok
            ? (verdict.cost != null ? `${verdict.cost} or` : '')
                + (this.activeMapId === 'spring' && BANK_CELLS.some(p => p.x === cell.x && p.y === cell.y) ? ' · berge inondable (crues v. 3, 6, 9…)' : '')
                + (baseRange > 0 && this.fogPenaltyAt(cell.x, cell.y) > 0 ? ' · brume : −1 portée' : '')
            : (verdict.reason ?? 'Pose impossible')
        const label = this.ensureGhostLabel()
        label.setVisible(text !== '')
        if (!text) return
        label.setText(text).setColor(ok ? '#f2c94c' : '#ffb4a8')
        const half = label.width / 2
        label.setPosition(
            Phaser.Math.Clamp(px + CELL_SIZE / 2, half + 2, GRID_WIDTH * CELL_SIZE - half - 2),
            Math.max(label.height + 1, topY - 2),
        )
    }

    /** Règles de terrain, valables en solo comme en multi (le serveur reste l'arbitre). */
    private terrainVerdict(type: string, x: number, y: number): PlacementVerdict {
        if (this.getTowerAt(x, y)) return { ok: false, reason: 'Case occupée' }
        if (y < TOP_RESERVED_ROWS) return { ok: false, reason: 'Rangée réservée' }
        const corridor = mapIsCorridor(this.mapDef, x, y)
        // Mur : sur le couloir, dans la limite de MAX_WALLS ; tours : bande constructible.
        if (type === 'WALL') {
            if (!corridor) return { ok: false, reason: 'Mur : sur le couloir' }
            const walls = [...this.towersById.values()].filter((t) => t.type === 'WALL').length
            return walls >= MAX_WALLS ? { ok: false, reason: `Limite de ${MAX_WALLS} murs` } : { ok: true }
        }
        if (corridor) return { ok: false, reason: 'Pas sur le couloir' }
        return mapIsBuildable(this.mapDef, x, y) ? { ok: true } : { ok: false, reason: 'Impossible' }
    }

    /** Silhouette de l'aperçu (recréée seulement quand le type à poser change). */
    private ensureGhost(type: string) {
        let ghost = this.ghost
        if (!ghost || ghost.type !== type) {
            ghost?.base.destroy()
            ghost?.weapon?.destroy()
            ghost = { type, ...this.createTowerParts(type) }
            this.ghost = ghost
        }
        return ghost
    }

    private ensureGhostLabel() {
        if (!this.ghostLabel) {
            this.ghostLabel = this.add.text(0, 0, '', {
                fontFamily: READABLE_FONT, fontSize: '12px', fontStyle: 'bold', color: '#f2c94c',
                resolution: 2, // net malgré la mise à l'échelle du canvas
            }).setOrigin(0.5, 1).setDepth(DEPTH_LABEL)
            this.ghostLabel.setStroke('#1a1006', 4)
        }
        return this.ghostLabel
    }

    private hideGhost() {
        this.ghost?.base.setVisible(false)
        this.ghost?.weapon?.setVisible(false)
        this.ghostLabel?.setVisible(false)
    }

    // ── Survol / sélection des tours posées ──────────────────────────────

    /** Tour (ou mur) posée sur une case, d'après le dernier état affiché. */
    getTowerAt(x: number, y: number): TowerData | undefined {
        for (const t of this.towersById.values()) if (t.x === x && t.y === y) return t
        return undefined
    }

    /**
     * Recalcule la tour sous le curseur (inspection active ; murs exclus, un clic
     * dessus ne sélectionne rien) et le curseur « main ». Renvoie true si elle a
     * changé — l'appelant redessine alors les repères (refreshFocus).
     */
    private syncHoveredTower(): boolean {
        const cell = this.hoverCell
        const tower = this.inspectEnabled && cell ? this.getTowerAt(cell.x, cell.y) : undefined
        const id = tower && tower.type !== 'WALL' ? tower.id : null
        if (id === this.hoveredTowerId) return false
        this.hoveredTowerId = id
        this.input?.setDefaultCursor(id ? 'pointer' : '')
        return true
    }

    /**
     * Repères de la tour survolée et de la tour sélectionnée. On n'agrandit jamais
     * la tour (ça recréerait le chevauchement) : on l'éclaircit, on marque SA case
     * et on trace SA portée réelle.
     * - survol : cadre crème + portée discrète ;
     * - sélection : coins dorés (repris dans le panneau) + portée dorée.
     * Le cercle ne concerne que ces deux tours → le plateau reste lisible.
     */
    private refreshFocus() {
        if (!this.rangeGraphics) return
        this.applyFocusTints()
        this.rangeGraphics.clear()
        this.focusGraphics.clear()

        const selected = this.selectedTowerId ? this.towersById.get(this.selectedTowerId) : undefined
        const hovered = this.hoveredTowerId && this.hoveredTowerId !== this.selectedTowerId
            ? this.towersById.get(this.hoveredTowerId)
            : undefined

        if (hovered) {
            this.drawTowerRange(hovered, HOVER_COLOR, 0.05, 0.5)
            this.focusGraphics.lineStyle(2, HOVER_COLOR, 0.8)
            this.focusGraphics.strokeRect(
                hovered.x * CELL_SIZE + 1, hovered.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2,
            )
        }
        if (selected) {
            this.drawTowerRange(selected, SELECT_COLOR, 0.08, 0.8)
            this.drawSelectionCorners(selected.x * CELL_SIZE, selected.y * CELL_SIZE)
        }
    }

    /** Cercle de portée RÉELLE d'une tour (niveau compris, miroir du backend). */
    private drawTowerRange(tower: TowerData, color: number, fillAlpha: number, strokeAlpha: number) {
        const base = towerRangeAt(tower.type, tower.level ?? 1)
        if (base <= 0) return
        const radius = (base - this.fogPenaltyAt(tower.x, tower.y)) * CELL_SIZE // brume : portée réduite
        const cx = tower.x * CELL_SIZE + CELL_SIZE / 2
        const cy = tower.y * CELL_SIZE + CELL_SIZE / 2
        this.rangeGraphics.fillStyle(color, fillAlpha)
        this.rangeGraphics.fillCircle(cx, cy, radius)
        this.rangeGraphics.lineStyle(2, color, strokeAlpha)
        this.rangeGraphics.strokeCircle(cx, cy, radius)
    }

    /** Coins dorés aux 4 angles de la case, liserés de sombre (lisibles sur sable comme sur neige). */
    private drawSelectionCorners(px: number, py: number) {
        const g = this.focusGraphics
        const len = 10
        const x0 = px + 1, y0 = py + 1, x1 = px + CELL_SIZE - 1, y1 = py + CELL_SIZE - 1
        const corners: [number, number, number, number][] = [
            [x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1],
        ]
        const passes: [number, number][] = [[5, 0x2a1a06], [3, SELECT_COLOR]]
        for (const [width, color] of passes) {
            g.lineStyle(width, color, 1)
            for (const [cx, cy, sx, sy] of corners) {
                g.beginPath()
                g.moveTo(cx + sx * len, cy)
                g.lineTo(cx, cy)
                g.lineTo(cx, cy + sy * len)
                g.strokePath()
            }
        }
    }

    // Teinte appliquée par tour (survol / sélection) : on ne retouche que les
    // sprites concernés — drawTowers tourne à 15 Hz en coop.
    private focusTints = new Map<string, number>()

    private applyFocusTints() {
        const want = new Map<string, number>()
        if (this.hoveredTowerId) want.set(this.hoveredTowerId, HOVER_TINT)
        if (this.selectedTowerId) want.set(this.selectedTowerId, SELECT_TINT) // la sélection prime
        for (const id of this.focusTints.keys()) if (!want.has(id)) this.tintTower(id, null)
        // Réappliquée à chaque fois : le sprite a pu être recréé entre-temps.
        for (const [id, tint] of want) this.tintTower(id, tint)
        this.focusTints = want
    }

    /** Éclaircit (mode SCREEN : respecte la transparence) ou rétablit une tour, base + arme. */
    private tintTower(id: string, tint: number | null) {
        for (const part of [this.towerSprites.get(id), this.towerWeapons.get(id)]) {
            if (!part) continue
            if (tint == null) part.clearTint()
            else part.setTintMode(Phaser.TintModes.SCREEN).setTint(tint)
        }
    }

    // ── API coop (rendu du flux serveur) ─────────────────────────────────

    setOnCoopReady(callback: () => void) {
        this.onCoopReady = callback
        // La scène est peut-être déjà créée (callback branché tardivement) : dans
        // ce cas on l'appelle tout de suite.
        if (this.enemiesGraphics) callback()
    }

    setTerrainForecast(forecast?: TerrainForecast) {
        this.terrainForecast = forecast
        if (!this.seasonalCombat && !this.coopActive) this.renderTerrainState()
    }

    /**
     * Terrain saisonnier. Le serveur décide des effets ; ces calques représentent
     * seulement son état (snapshot de la vague en cours, sinon l'annonce de la
     * prochaine). Chaque calque est redessiné quand cet état change, jamais à
     * chaque image (voir bakeStatic).
     */
    private renderTerrainState(state?: TerrainSnapshot) {
        if (!this.towersGraphics || !['spring', 'autumn'].includes(this.activeMapId)) return
        const key = JSON.stringify([state, this.terrainForecast, this.seasonalCombat])
        if (key === this.terrainKey) return
        this.terrainKey = key
        const spring = this.activeMapId === 'spring'
        const flooded = state?.flooded ?? false
        const forecastFlood = !this.seasonalCombat && !!this.terrainForecast?.flooded

        // Printemps : berges noyées de cette vague (le sens change à chaque crue), berges
        // annoncées pour la prochaine, grêle en cours ou annoncée.
        const floodCells = state?.flood ?? (flooded ? BANK_CELLS : [])
        const alertCells = forecastFlood ? this.terrainForecast?.affectedCells ?? [] : []
        const hail = !!state?.hail
        const forecastHail = !this.seasonalCombat && !!this.terrainForecast?.hail
        if (spring) {
            const underWater = new Set(floodCells.map((c) => `${c.x},${c.y}`))
            // Berges : terre humide, roseaux et vaguelette (le symbole de la crue).
            const g = this.make.graphics({ x: 0, y: 0 }, false)
            for (const p of BANK_CELLS) {
                const x = p.x * CELL_SIZE, y = p.y * CELL_SIZE
                g.fillStyle(0x5f9792, 0.22)
                g.fillRoundedRect(x + 2, y + 2, 36, 36, 5)
                if (underWater.has(`${p.x},${p.y}`)) continue // sous l'eau : pas de repère qui transparaîtrait
                g.lineStyle(1, 0x9fd3dc, 0.6)
                g.strokeRoundedRect(x + 3.5, y + 3.5, 33, 33, 5)
                let seed = p.x * 31 + p.y * 17
                const r = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
                for (let i = 0; i < 3; i++) {
                    const rx = Math.round(x + 8 + r() * 22), ry = Math.round(y + 14 + r() * 18)
                    g.lineStyle(1, 0x9cb85e, 0.95)
                    g.lineBetween(rx, ry, rx - 1, ry - 7); g.lineBetween(rx + 2, ry, rx + 3, ry - 6); g.lineBetween(rx + 4, ry, rx + 4, ry - 5)
                    g.fillStyle(0x6b4a2b, 1); g.fillRect(rx - 2, ry - 10, 2, 4)
                }
                g.lineStyle(1.5, 0xd2eef2, 0.85)
                g.beginPath(); g.moveTo(x + 22, y + 32); g.lineTo(x + 25, y + 30); g.lineTo(x + 28, y + 32); g.lineTo(x + 31, y + 30); g.lineTo(x + 34, y + 32); g.strokePath()
            }
            const textureKey = `season-overlay-${this.activeMapId}`
            if (this.textures.exists(textureKey)) (this.textures.get(textureKey) as Phaser.Textures.CanvasTexture).getContext().clearRect(0, 0, 800, 640)
            g.generateTexture(textureKey, 800, 640)
            g.destroy()
            if (!this.terrainLayer) this.terrainLayer = this.add.image(0, 0, textureKey).setOrigin(0, 0).setDepth(0.3)

            // Berges que la prochaine crue noiera : surbrillance qui pulse.
            const a = this.make.graphics({ x: 0, y: 0 }, false)
            for (const p of alertCells) {
                const x = p.x * CELL_SIZE, y = p.y * CELL_SIZE
                a.fillStyle(0x9fd8e8, 0.22)
                a.fillRoundedRect(x + 2, y + 2, 36, 36, 5)
                a.lineStyle(2, 0xe8f8ff, 0.95)
                a.strokeRoundedRect(x + 3, y + 3, 34, 34, 5)
            }
            const alertKey = 'season-bank-alert'
            if (this.textures.exists(alertKey)) (this.textures.get(alertKey) as Phaser.Textures.CanvasTexture).getContext().clearRect(0, 0, 800, 640)
            a.generateTexture(alertKey, 800, 640)
            a.destroy()
            if (!this.bankAlertLayer) this.bankAlertLayer = this.add.image(0, 0, alertKey).setOrigin(0, 0).setDepth(0.31)
            this.tweens.killTweensOf(this.bankAlertLayer)
            this.bankAlertLayer.setAlpha(1)
            if (alertCells.length > 0) this.tweens.add({ targets: this.bankAlertLayer, alpha: 0.25, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

            // Crue : l'eau monte sur les berges noyées sous une averse ; la vague qui la
            // précède, une bruine l'annonce. Retour au calme à la décrue. Grêle : quelques
            // grêlons l'annoncent, puis une vraie averse de grêle pendant la vague.
            this.setFloodWater(floodCells)
            this.setRain(flooded ? 'storm' : forecastFlood ? 'drizzle' : 'none')
            this.setHail(hail ? 'storm' : forecastHail ? 'light' : 'none')
        } else {
            // Boue et brume : celles de la vague en cours, sinon celles annoncées pour la prochaine.
            this.setMud(state ? state.mud ?? [] : this.terrainForecast?.affectedCells ?? [])
            this.setFog(state ? state.fog : this.terrainForecast?.fogCells ?? [])
        }

        // Tours suspendues par la crue : pieds dans l'eau (ronds qui ondulent), un peu
        // estompées ; restaurées à la décrue.
        const disabled = new Set(state?.disabledTowers ?? [])
        for (const [id, sprite] of this.towerSprites) {
            sprite.setAlpha(disabled.has(id) ? 0.72 : 1)
            this.towerWeapons.get(id)?.setAlpha(disabled.has(id) ? 0.72 : 1)
        }
        this.syncFloodWakes(disabled)
        // Pas de bandeau d'avertissement : le plateau montre tout (berges qui clignotent,
        // bruine, grêlons, boue, brume) et les règles passent par les bulles de conseils.
    }

    /**
     * Flaques de boue : une flaque organique par groupe de cases de boue voisines —
     * bord détrempé plus sombre, creux humides, reflets, empreintes et feuilles mortes
     * collées. Pseudo-aléatoire à graine fixe : même dessin à chaque fois.
     */
    private paintMud(g: Phaser.GameObjects.Graphics, cells: Cell[]) {
        const left = new Set(cells.map((c) => `${c.x},${c.y}`))
        const patches: Cell[][] = []
        for (const c of cells) {
            if (!left.delete(`${c.x},${c.y}`)) continue
            const patch = [c], queue = [c]
            while (queue.length > 0) {
                const p = queue.pop()!
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    if (left.delete(`${p.x + dx},${p.y + dy}`)) {
                        const n = { x: p.x + dx, y: p.y + dy }
                        patch.push(n); queue.push(n)
                    }
                }
            }
            patches.push(patch)
        }
        for (const patch of patches) {
            const xs = patch.map((c) => c.x), ys = patch.map((c) => c.y)
            const x0 = Math.min(...xs) * CELL_SIZE + 6, x1 = (Math.max(...xs) + 1) * CELL_SIZE - 6
            const y0 = Math.min(...ys) * CELL_SIZE + 6, y1 = (Math.max(...ys) + 1) * CELL_SIZE - 6
            const w = x1 - x0, h = y1 - y0, area = w * h
            let seed = (x0 * 7919 + y0 * 104729) | 0
            const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
            const at = (margin: number) => ({ x: x0 + margin + rnd() * (w - 2 * margin), y: y0 + margin + rnd() * (h - 2 * margin) })
            const blobs: { x: number; y: number; w: number; h: number }[] = []
            for (let y = y0 + 10; y <= y1 - 10; y += 9) {
                for (let x = x0 + 10; x <= x1 - 10; x += 9) blobs.push({ x: x + (rnd() - 0.5) * 4, y: y + (rnd() - 0.5) * 4, w: 20 + rnd() * 12, h: 18 + rnd() * 10 })
            }
            g.fillStyle(0x3a2718, 0.85)                                   // bord : terre détrempée
            for (const b of blobs) g.fillEllipse(b.x, b.y, b.w + 7, b.h + 6)
            g.fillStyle(0x573c25, 1)                                      // boue
            for (const b of blobs) g.fillEllipse(b.x, b.y, b.w, b.h)
            g.fillStyle(0x432d1b, 1)                                      // creux humides
            for (let i = 0; i < 2 + area / 900; i++) { const p = at(12); g.fillEllipse(p.x, p.y, 12 + rnd() * 16, 7 + rnd() * 6) }
            g.fillStyle(0xc2aa86, 0.45)                                   // reflets d'eau stagnante
            for (let i = 0; i < 2 + area / 1300; i++) { const p = at(12); g.fillEllipse(p.x, p.y, 5 + rnd() * 7, 1.6) }
            g.fillStyle(0x2c1d12, 0.8)                                    // empreintes des ennemis
            for (let i = 0; i < 3 + area / 700; i++) { const p = at(8); g.fillEllipse(p.x, p.y, 5, 3.5); g.fillEllipse(p.x + 7, p.y + 4, 5, 3.5) }
            for (let i = 0; i < 2 + area / 1000; i++) {                   // feuilles mortes collées
                const p = at(6)
                g.fillStyle([0xc8642a, 0xe2a548, 0x9a3b1d][Math.floor(rnd() * 3)], 0.9)
                g.fillRect(Math.round(p.x), Math.round(p.y), 3, 2)
            }
        }
    }

    /**
     * Boue de la vague : quand ses flaques changent de place, une averse passe quelques
     * secondes ; l'ancienne boue s'efface pendant que la nouvelle se forme. Au premier
     * affichage de la carte, elle est simplement posée (pas d'averse).
     */
    private setMud(cells: Cell[]) {
        const signature = cells.map((c) => `${c.x},${c.y}`).sort().join(';')
        if (signature === this.mudSignature) return
        const first = this.mudSignature === '' && !this.mudImage
        this.mudSignature = signature
        const old = this.mudImage
        this.mudImage = undefined
        if (cells.length > 0) {
            const g = this.make.graphics({ x: 0, y: 0 }, false)
            this.paintMud(g, cells)
            const key = `mud-${this.mudSerial++}`
            g.generateTexture(key, GRID_WIDTH * CELL_SIZE, GRID_HEIGHT * CELL_SIZE)
            g.destroy()
            const img = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0.3).setAlpha(first ? 1 : 0)
            if (!first) this.tweens.add({ targets: img, alpha: 1, delay: 900, duration: 1800, ease: 'Sine.easeInOut' })
            this.mudImage = img
        }
        if (old) {
            this.tweens.killTweensOf(old)
            this.tweens.add({
                targets: old, alpha: 0, duration: 1800, ease: 'Sine.easeInOut',
                onComplete: () => {
                    const k = old.texture.key
                    old.destroy()
                    if (this.textures.exists(k)) this.textures.remove(k)
                },
            })
        }
        if (!first) this.rainShower()
    }

    /** Averse passagère (automne) : pluie forte quelques secondes, puis éclaircie. */
    private rainShower() {
        this.setRain('storm')
        this.rainShowerTimer?.remove()
        this.rainShowerTimer = this.time.delayedCall(4200, () => {
            this.rainShowerTimer = undefined
            this.setRain('none')
        })
    }

    /**
     * Brume : voile blanc sur les cases qu'elle couvre, au-dessus des tours qu'elle
     * pénalise ; le chemin n'en garde qu'un léger voile pour rester lisible. Dessinée
     * en basse résolution puis agrandie avec lissage (bords naturellement flous), en
     * deux couches qui dérivent en sens contraires. Quand les bancs se déplacent,
     * l'ancienne nappe s'efface pendant que la nouvelle apparaît.
     */
    private setFog(cells: Cell[]) {
        this.currentFog = new Set(cells.map((c) => `${c.x},${c.y}`))
        const visible = cells.filter((c) => !mapIsCorridor(this.mapDef, c.x, c.y))
        const signature = visible.map((c) => `${c.x},${c.y}`).join(';')
        if (signature === this.fogSignature) return
        this.fogSignature = signature

        const old = this.fogImages
        this.fogImages = []
        if (visible.length > 0) {
            const S = 4, cs = CELL_SIZE / S
            const key = `fog-${this.fogSerial++}`
            const tex = this.textures.createCanvas(key, (GRID_WIDTH * CELL_SIZE) / S, (GRID_HEIGHT * CELL_SIZE) / S)
            const ctx = tex?.getContext()
            if (tex && ctx) {
                const blob = (x: number, y: number, r: number, a: number) => {
                    const grad = ctx.createRadialGradient(x, y, 0, x, y, r)
                    grad.addColorStop(0, `rgba(236, 240, 240, ${a})`)
                    grad.addColorStop(0.55, `rgba(236, 240, 240, ${a})`)
                    grad.addColorStop(1, 'rgba(236, 240, 240, 0)')
                    ctx.fillStyle = grad
                    ctx.fillRect(x - r, y - r, r * 2, r * 2)
                }
                for (const c of visible) blob((c.x + 0.5) * cs, (c.y + 0.5) * cs, cs * 0.95, 1)
                ctx.globalCompositeOperation = 'destination-out'
                for (const c of visible) {                                  // trouées : nappe irrégulière
                    if (Math.random() < 0.45) blob((c.x + Math.random()) * cs, (c.y + Math.random()) * cs, cs * (0.4 + Math.random() * 0.4), 0.5)
                }
                ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'                       // chemin : léger voile seulement
                for (let y = 0; y < GRID_HEIGHT; y++) for (let x = 0; x < GRID_WIDTH; x++) {
                    if (mapIsCorridor(this.mapDef, x, y)) ctx.fillRect(x * cs, y * cs, cs, cs)
                }
                ctx.globalCompositeOperation = 'source-over'
                tex.refresh()
                tex.setFilter(Phaser.Textures.FilterMode.LINEAR)
                for (const layer of [
                    { alpha: 0.42, x: [-6, 6], y: [0, 0], duration: 7000 },
                    { alpha: 0.26, x: [6, -6], y: [-4, 4], duration: 9500 },
                ]) {
                    const img = this.add.image(0, 0, key).setOrigin(0, 0).setScale(S).setDepth(DEPTH_FOG).setAlpha(0)
                    this.tweens.add({ targets: img, alpha: layer.alpha, duration: 1400, ease: 'Sine.easeInOut' })
                    this.tweens.add({
                        targets: img, x: { from: layer.x[0], to: layer.x[1] }, y: { from: layer.y[0], to: layer.y[1] },
                        duration: layer.duration, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
                    })
                    this.fogImages.push(img)
                }
            }
        }
        if (old.length > 0) {
            for (const img of old) this.tweens.killTweensOf(img)
            this.tweens.add({
                targets: old, alpha: 0, duration: 1400, ease: 'Sine.easeInOut',
                onComplete: () => {
                    const k = old[0].texture.key
                    for (const img of old) img.destroy()
                    if (this.textures.exists(k)) this.textures.remove(k)
                },
            })
        }
        // Les portées affichées dépendent de la brume.
        this.refreshFocus()
        if (this.buildPreviewType) this.drawBuildPreview()
    }

    /** Portée perdue par une tour posée sur cette case (brume de la vague affichée). */
    private fogPenaltyAt(x: number, y: number) {
        return this.currentFog.has(`${x},${y}`) ? FOG_RANGE_PENALTY : 0
    }

    /**
     * Crue : le lac déborde sur les berges noyées de cette crue (le sens change d'une
     * crue à l'autre). Une nappe par groupe de berges, peinte une fois par sens —
     * profonde côté lac (même bleu que lui, la jonction disparaît), claire côté terre,
     * rive festonnée d'écume sur une bande de terre mouillée — et un calque de reflets
     * qui scintille par-dessus. À la montée, l'eau s'étale depuis le lac ; à la décrue,
     * elle s'y retire.
     */
    private setFloodWater(cells: Cell[]) {
        const on = cells.length > 0
        const signature = cells.map((c) => `${c.x},${c.y}`).sort().join(';')
        if (on && signature !== this.floodSignature) {
            // Nouveau sens : les nappes de la crue précédente (déjà retirées) sont remplacées.
            for (const l of this.floodLayers) { this.tweens.killTweensOf([l.water, l.glints]); l.water.destroy(); l.glints.destroy() }
            this.floodLayers = []
            this.floodSignature = signature
            this.buildFloodLayers(cells)
        }
        for (const layer of this.floodLayers) {
            this.tweens.killTweensOf([layer.water, layer.glints])
            const grow = layer.axis === 'x' ? { scaleX: 1 } : { scaleY: 1 }
            const shrink = layer.axis === 'x' ? { scaleX: 0.12 } : { scaleY: 0.12 }
            if (on) {
                this.tweens.add({ targets: layer.water, ...grow, alpha: 1, duration: 2200, ease: 'Cubic.easeOut' })
                this.tweens.add({
                    targets: layer.glints, ...grow, alpha: 0.9, duration: 2200, ease: 'Cubic.easeOut',
                    onComplete: () => {
                        // Reflets : scintillent et glissent doucement, comme sur une eau qui bouge.
                        this.tweens.add({ targets: layer.glints, alpha: 0.3, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
                        this.tweens.add({ targets: layer.glints, x: { from: layer.glintX - 3, to: layer.glintX + 3 }, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
                    },
                })
            } else {
                this.tweens.add({ targets: [layer.water, layer.glints], ...shrink, alpha: 0, duration: 1600, ease: 'Sine.easeIn' })
            }
        }
        this.setRipples(cells)
    }

    /** Peint les nappes de crue (une par groupe de berges voisines), cachées au départ. */
    private buildFloodLayers(cells: Cell[]) {
        const key = (x: number, y: number) => `${x},${y}`
        const lake = new Set(this.mapDef.water.map((c) => key(c.x, c.y)))
        const left = new Set(cells.map((c) => key(c.x, c.y)))
        const groups: Cell[][] = []
        for (const c of cells) {
            if (!left.delete(key(c.x, c.y))) continue
            const group = [c], queue = [c]
            while (queue.length > 0) {
                const p = queue.pop()!
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    if (left.delete(key(p.x + dx, p.y + dy))) { const n = { x: p.x + dx, y: p.y + dy }; group.push(n); queue.push(n) }
                }
            }
            groups.push(group)
        }
        let seed = 5309
        const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
        groups.forEach((group, gi) => {
            const xs = group.map((c) => c.x), ys = group.map((c) => c.y)
            const M = 12
            const ox = Math.min(...xs) * CELL_SIZE - M, oy = Math.min(...ys) * CELL_SIZE - M
            const rw = (Math.max(...xs) - Math.min(...xs) + 1) * CELL_SIZE, rh = (Math.max(...ys) - Math.min(...ys) + 1) * CELL_SIZE
            const w = rw + 2 * M, h = rh + 2 * M
            // De quel côté est le lac ? L'eau s'étale depuis ce bord.
            const lakeRight = group.some((c) => lake.has(key(c.x + 1, c.y)))
            const lakeLeft = group.some((c) => lake.has(key(c.x - 1, c.y)))
            const lakeBelow = !lakeLeft && !lakeRight && group.some((c) => lake.has(key(c.x, c.y + 1)))
            const lakeAbove = !lakeLeft && !lakeRight && !lakeBelow && group.some((c) => lake.has(key(c.x, c.y - 1)))
            const wkey = `flood-water-${gi}`, gkey = `flood-glints-${gi}`
            for (const k of [wkey, gkey]) if (this.textures.exists(k)) this.textures.remove(k)
            const wtex = this.textures.createCanvas(wkey, w, h), gtex = this.textures.createCanvas(gkey, w, h)
            const ctx = wtex?.getContext(), gctx = gtex?.getContext()
            if (!wtex || !gtex || !ctx || !gctx) return
            // Bord du rectangle d'eau (coordonnées locales) : déborde sur la rive du lac.
            const x0 = M - (lakeLeft ? 8 : 0), x1 = M + rw + (lakeRight ? 8 : 0)
            const y0 = M - (lakeAbove ? 8 : 0), y1 = M + rh + (lakeBelow ? 8 : 0)
            // Bords côté terre, pour festonner la rive.
            const edges: [number, number, number, number][] = []
            if (!lakeAbove) edges.push([x0, y0, x1, y0])
            if (!lakeBelow) edges.push([x0, y1, x1, y1])
            if (!lakeLeft) edges.push([x0, y0, x0, y1])
            if (!lakeRight) edges.push([x1, y0, x1, y1])
            const along = (draw: (x: number, y: number) => void, step: number) => {
                for (const [ax, ay, bx, by] of edges) {
                    const len = Math.hypot(bx - ax, by - ay)
                    for (let d = 0; d <= len; d += step) draw(ax + (bx - ax) * d / len, ay + (by - ay) * d / len)
                }
            }
            const inward = (x: number, y: number, d: number) => [
                x <= x0 + 0.5 ? d : x >= x1 - 0.5 ? -d : 0,
                y <= y0 + 0.5 ? d : y >= y1 - 0.5 ? -d : 0,
            ]
            const disc = (c: CanvasRenderingContext2D, x: number, y: number, r: number) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill() }
            // 1) Terre mouillée, un peu au-delà de l'eau.
            ctx.fillStyle = 'rgba(44, 64, 52, 0.42)'
            ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
            along((x, y) => disc(ctx, x, y, 6 + rnd() * 5), 7)
            // 2) Eau : bleu du lac côté lac, plus claire côté terre.
            const grad = lakeLeft ? ctx.createLinearGradient(x0, 0, x1, 0)
                : lakeRight ? ctx.createLinearGradient(x1, 0, x0, 0)
                : lakeAbove ? ctx.createLinearGradient(0, y0, 0, y1)
                : ctx.createLinearGradient(0, y1, 0, y0)
            grad.addColorStop(0, 'rgba(82, 127, 135, 0.97)')
            grad.addColorStop(0.6, 'rgba(92, 140, 150, 0.95)')
            grad.addColorStop(1, 'rgba(110, 160, 168, 0.93)')
            ctx.fillStyle = grad
            const ix0 = x0 + (lakeLeft ? 0 : 3), ix1 = x1 - (lakeRight ? 0 : 3), iy0 = y0 + (lakeAbove ? 0 : 3), iy1 = y1 - (lakeBelow ? 0 : 3)
            ctx.fillRect(ix0, iy0, ix1 - ix0, iy1 - iy0)
            along((x, y) => { const [dx, dy] = inward(x, y, 3); disc(ctx, x + dx, y + dy, 3 + rnd() * 4) }, 6)
            // 3) Zones plus profondes, côté lac.
            ctx.fillStyle = 'rgba(46, 92, 108, 0.28)'
            for (let i = 0; i < group.length; i++) {
                const ex = lakeLeft ? x0 + 6 + rnd() * 14 : lakeRight ? x1 - 6 - rnd() * 14 : x0 + 10 + rnd() * (x1 - x0 - 20)
                const ey = lakeAbove ? y0 + 6 + rnd() * 12 : lakeBelow ? y1 - 6 - rnd() * 12 : y0 + 10 + rnd() * (y1 - y0 - 20)
                ctx.beginPath(); ctx.ellipse(ex, ey, 8 + rnd() * 6, 5 + rnd() * 4, 0, 0, Math.PI * 2); ctx.fill()
            }
            // 4) Vaguelettes en arc.
            ctx.strokeStyle = 'rgba(214, 238, 244, 0.4)'; ctx.lineWidth = 1.5
            for (let y = y0 + 14; y < y1 - 8; y += 15) {
                for (let x = x0 + 8 + rnd() * 10; x < x1 - 12; x += 20 + rnd() * 8) {
                    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y - 3, x + 8, y); ctx.stroke()
                }
            }
            // 5) Écume le long de la rive.
            along((x, y) => {
                if (rnd() < 0.35) return                                     // écume irrégulière
                ctx.fillStyle = rnd() < 0.5 ? 'rgba(240, 248, 250, 0.8)' : 'rgba(220, 238, 242, 0.5)'
                const [dx, dy] = inward(x, y, 4)
                ctx.fillRect(x + dx + (rnd() - 0.5) * 2, y + dy + (rnd() - 0.5) * 2, 2 + Math.round(rnd()), 1 + Math.round(rnd()))
            }, 6)
            wtex.refresh()
            // Reflets (calque séparé, scintillant).
            for (let i = 0; i < group.length * 4; i++) {
                gctx.fillStyle = rnd() < 0.3 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(225, 244, 250, 0.75)'
                gctx.fillRect(x0 + 6 + rnd() * (x1 - x0 - 12), y0 + 6 + rnd() * (y1 - y0 - 12), 2 + Math.round(rnd() * 3), 1)
            }
            gtex.refresh()
            // Origine sur le bord du lac : l'eau s'étale depuis lui (scaleX ou scaleY).
            const axis: 'x' | 'y' = lakeAbove || lakeBelow ? 'y' : 'x'
            const originX = lakeLeft ? 0 : lakeRight ? 1 : 0.5, originY = lakeAbove ? 0 : lakeBelow ? 1 : 0
            const px = ox + w * originX, py = oy + h * originY
            const scale = axis === 'x' ? [0.12, 1] : [1, 0.12]
            const water = this.add.image(px, py, wkey).setOrigin(originX, originY).setDepth(DEPTH_WATER).setAlpha(0).setScale(scale[0], scale[1])
            const glints = this.add.image(px, py, gkey).setOrigin(originX, originY).setDepth(DEPTH_WATER + 0.005).setAlpha(0).setScale(scale[0], scale[1])
            this.floodLayers.push({ water, glints, glintX: px, axis })
        })
    }

    /** Tours des berges sous l'eau : ronds d'eau qui ondulent autour de leur pied. */
    private syncFloodWakes(ids: Set<string>) {
        for (const [id, wake] of this.floodWakes) {
            if (ids.has(id) && this.towerSprites.has(id)) continue
            this.tweens.killTweensOf(wake)
            wake.destroy()
            this.floodWakes.delete(id)
        }
        if (ids.size === 0) return
        if (!this.textures.exists('fx-wake')) {
            const tex = this.textures.createCanvas('fx-wake', 52, 20)
            const ctx = tex?.getContext()
            if (tex && ctx) {
                ctx.fillStyle = 'rgba(120, 176, 190, 0.35)'
                ctx.beginPath(); ctx.ellipse(26, 10, 24, 8, 0, 0, Math.PI * 2); ctx.fill()
                ctx.strokeStyle = 'rgba(236, 248, 252, 0.9)'; ctx.lineWidth = 1.5
                ctx.beginPath(); ctx.ellipse(26, 10, 23, 7.5, 0, 0, Math.PI * 2); ctx.stroke()
                ctx.strokeStyle = 'rgba(236, 248, 252, 0.5)'; ctx.lineWidth = 1
                ctx.beginPath(); ctx.ellipse(26, 10, 16, 5, 0, 0, Math.PI * 2); ctx.stroke()
                tex.refresh()
            }
        }
        for (const id of ids) {
            const sprite = this.towerSprites.get(id)
            if (!sprite || this.floodWakes.has(id)) continue
            const wake = this.add.image(sprite.x, sprite.y - 5, 'fx-wake').setDepth(sprite.depth - 0.0005).setAlpha(0)
            this.tweens.add({ targets: wake, alpha: 0.9, duration: 1200 })
            this.tweens.add({ targets: wake, scaleX: 1.12, scaleY: 1.15, duration: 1300, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })
            this.floodWakes.set(id, wake)
        }
    }

    /**
     * Grêle (printemps) : grêlons qui tombent droit et rebondissent au sol. Quelques-uns
     * la vague qui l'annonce, une vraie averse de grêle pendant la vague (ennemis +25 %
     * de dégâts subis). Images réutilisées, comme la pluie.
     */
    private setHail(level: 'none' | 'light' | 'storm') {
        if (level === this.hailLevel) return
        this.hailLevel = level
        const count = level === 'storm' ? 110 : level === 'light' ? 16 : 0
        if (count > 0 && !this.textures.exists('fx-hail')) {
            // Grêlon qui tombe vite : bille blanche avec une courte traînée (≠ flocon).
            const tex = this.textures.createCanvas('fx-hail', 4, 10)
            const ctx = tex?.getContext()
            if (tex && ctx) {
                const grad = ctx.createLinearGradient(0, 0, 0, 7)
                grad.addColorStop(0, 'rgba(220, 236, 246, 0)')
                grad.addColorStop(1, 'rgba(220, 236, 246, 0.7)')
                ctx.fillStyle = grad; ctx.fillRect(1, 0, 2, 7)
                ctx.fillStyle = 'rgba(200, 222, 236, 0.95)'; ctx.fillRect(0, 7, 4, 2); ctx.fillRect(1, 6, 2, 4)
                ctx.fillStyle = '#ffffff'; ctx.fillRect(1, 7, 2, 2)
                tex.refresh()
            }
            const dot = this.textures.createCanvas('fx-hail-dot', 3, 3)
            const dctx = dot?.getContext()
            if (dot && dctx) { dctx.fillStyle = '#ffffff'; dctx.fillRect(1, 0, 1, 3); dctx.fillRect(0, 1, 3, 1); dot.refresh() }
        }
        const w = GRID_WIDTH * CELL_SIZE, h = GRID_HEIGHT * CELL_SIZE
        while (this.hailStones.length < count) {
            const img = this.add.image(0, 0, 'fx-hail').setDepth(DEPTH_RAIN).setScale(0.8 + Math.random() * 0.6)
            this.hailStones.push({ img, x: Math.random() * w, y: Math.random() * h, v: 650 + Math.random() * 250, land: 40 + Math.random() * (h - 40) })
        }
        this.hailStones.forEach((s, i) => s.img.setVisible(i < count))
        this.hailVisible = count
        if (!this.hailShade) {
            if (!this.textures.exists('fx-px')) {
                const tex = this.textures.createCanvas('fx-px', 4, 4)
                const ctx = tex?.getContext()
                if (tex && ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 4, 4); tex.refresh() }
            }
            this.hailShade = this.add.image(0, 0, 'fx-px').setOrigin(0, 0).setDisplaySize(w, h)
                .setTint(0x2c3a4a).setAlpha(0).setDepth(DEPTH_RAIN - 1)
        }
        this.tweens.killTweensOf(this.hailShade)
        this.tweens.add({ targets: this.hailShade, alpha: level === 'storm' ? 0.16 : 0, duration: 1200 })
    }

    /** Fait tomber les grêlons ; une partie rebondit en touchant le sol. */
    private updateHail(delta: number) {
        if (this.hailVisible === 0) return
        const w = GRID_WIDTH * CELL_SIZE, h = GRID_HEIGHT * CELL_SIZE
        const dt = Math.min(delta, 50) / 1000
        for (let i = 0; i < this.hailVisible; i++) {
            const s = this.hailStones[i]
            s.y += s.v * dt
            if (s.y >= s.land) {
                if (Math.random() < 0.3) this.hailBounce(s.x, s.land)
                s.y = -10 - Math.random() * 80; s.x = Math.random() * w; s.land = 40 + Math.random() * (h - 40)
            }
            s.img.setPosition(s.x, s.y)
        }
    }

    /** Petit rebond blanc là où un grêlon touche le sol. */
    private hailBounce(x: number, y: number) {
        if (this.hailBounces.length < 24) this.hailBounces.push(this.add.image(0, 0, 'fx-hail-dot').setDepth(DEPTH_PUDDLES + 0.02))
        const b = this.hailBounces[this.hailBounceNext++ % this.hailBounces.length]
        this.tweens.killTweensOf(b)
        b.setPosition(x, y).setAlpha(1).setScale(1)
        this.tweens.add({ targets: b, y: y - 7, alpha: 0, scale: 0.6, duration: 280, ease: 'Quad.easeOut' })
    }

    /** Impacts de pluie sur l'eau de crue : petits cercles qui s'élargissent pendant l'averse. */
    private setRipples(cells: Cell[]) {
        this.rippleCells = cells
        if (cells.length === 0) { this.rippleTimer?.remove(); this.rippleTimer = undefined; return }
        if (this.rippleTimer) return
        this.ensureRippleTexture()
        let next = 0
        this.rippleTimer = this.time.addEvent({
            delay: 90, loop: true, callback: () => {
                if (this.ripples.length < 16) this.ripples.push(this.add.image(0, 0, 'fx-ripple').setDepth(DEPTH_WATER + 0.01))
                const ripple = this.ripples[next++ % this.ripples.length]
                const cell = this.rippleCells[Math.floor(Math.random() * this.rippleCells.length)]
                if (!cell) return
                ripple.setPosition(cell.x * CELL_SIZE + 6 + Math.random() * (CELL_SIZE - 12), cell.y * CELL_SIZE + 9 + Math.random() * (CELL_SIZE - 18))
                    .setScale(0.3).setAlpha(0.9)
                this.tweens.killTweensOf(ripple)
                this.tweens.add({ targets: ripple, scale: 1.5, alpha: 0, duration: 650, ease: 'Quad.easeOut' })
            },
        })
    }

    /** Rond de pluie (ellipse claire), partagé par l'eau de crue et les flaques. */
    private ensureRippleTexture() {
        if (this.textures.exists('fx-ripple')) return
        const tex = this.textures.createCanvas('fx-ripple', 16, 8)
        const ctx = tex?.getContext()
        if (tex && ctx) {
            ctx.strokeStyle = 'rgba(225, 242, 250, 0.9)'
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.ellipse(8, 4, 7, 3, 0, 0, Math.PI * 2); ctx.stroke()
            tex.refresh()
        }
    }

    /**
     * Flaques (printemps) : parsèment la route et les abords quand il pleut — à moitié
     * marquées sous la bruine, franches sous l'averse — puis sèchent lentement. Dessinées
     * une seule fois (canvas), jamais sur le lac, les berges ou les arbres ; ronds de
     * pluie dessus tant qu'il pleut.
     */
    private setPuddles(level: 'none' | 'drizzle' | 'storm') {
        if (!this.puddles) {
            if (level === 'none') return
            const key = `rain-puddles-${this.activeMapId}`
            const w = GRID_WIDTH * CELL_SIZE, h = GRID_HEIGHT * CELL_SIZE
            const tex = this.textures.exists(key) ? undefined : this.textures.createCanvas(key, w, h)
            const ctx = tex?.getContext()
            this.puddleSpots = []
            let seed = 7331
            const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
            const flood = new Set(BANK_CELLS.map((c) => `${c.x},${c.y}`))
            const gates = [...mapLaneStarts(this.mapDef), mapCastle(this.mapDef)]
            const cells: Cell[] = []
            for (let tries = 0; cells.length < 34 && tries < 600; tries++) {
                const x = Math.floor(rnd() * GRID_WIDTH), y = TOP_RESERVED_ROWS + Math.floor(rnd() * (GRID_HEIGHT - TOP_RESERVED_ROWS))
                const road = mapIsCorridor(this.mapDef, x, y)
                if (!road && !mapIsBuildable(this.mapDef, x, y)) continue          // zones mortes : arbres
                if (!road && rnd() < 0.6) continue                                 // surtout dans les ornières
                const lake = this.mapDef.water.length > 0 && x >= LAKE.x0 && x <= LAKE.x1 && y >= LAKE.y0 && y <= LAKE.y1
                if (lake || (this.activeMapId === 'spring' && flood.has(`${x},${y}`))) continue
                if (gates.some((g) => Math.max(Math.abs(g.x - x), Math.abs(g.y - y)) <= 1)) continue
                if (cells.some((c) => Math.abs(c.x - x) + Math.abs(c.y - y) < 2)) continue
                cells.push({ x, y })
            }
            for (const c of cells) {
                const px = c.x * CELL_SIZE + 10 + rnd() * 20, py = c.y * CELL_SIZE + 12 + rnd() * 16
                const rw = 9 + rnd() * 10, rh = 4 + rnd() * 3
                const lobes = [[0, 0, 1], [rw * 0.55, rh * 0.4, 0.6], [-rw * 0.5, -rh * 0.3, 0.55]]
                this.puddleSpots.push({ x: px, y: py, rw, rh })
                if (!ctx) continue
                ctx.fillStyle = 'rgba(46, 58, 52, 0.5)'                             // terre mouillée
                for (const [dx, dy, k] of lobes) { ctx.beginPath(); ctx.ellipse(px + dx, py + dy, rw * k + 3, rh * k + 2, 0, 0, Math.PI * 2); ctx.fill() }
                ctx.fillStyle = this.activeMapId === 'autumn' ? 'rgba(122, 136, 130, 0.78)' : 'rgba(112, 152, 170, 0.8)' // eau : reflet du ciel (troublée en automne)
                for (const [dx, dy, k] of lobes) { ctx.beginPath(); ctx.ellipse(px + dx, py + dy, rw * k, rh * k, 0, 0, Math.PI * 2); ctx.fill() }
                ctx.fillStyle = 'rgba(214, 236, 244, 0.65)'                         // éclat
                ctx.fillRect(px - rw * 0.45, py - rh * 0.4, rw * 0.5, 1.5)
            }
            tex?.refresh()
            this.puddles = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(DEPTH_PUDDLES).setAlpha(0)
        }
        this.tweens.killTweensOf(this.puddles)
        this.tweens.add({
            targets: this.puddles, alpha: level === 'storm' ? 1 : level === 'drizzle' ? 0.55 : 0,
            duration: level === 'none' ? 6000 : 3000, ease: 'Sine.easeInOut',
        })
        this.puddleRippleTimer?.remove()
        this.puddleRippleTimer = undefined
        if (level === 'none' || this.puddleSpots.length === 0) return
        this.ensureRippleTexture()
        let next = 0
        this.puddleRippleTimer = this.time.addEvent({
            delay: level === 'storm' ? 110 : 320, loop: true, callback: () => {
                if (this.puddleRipples.length < 12) this.puddleRipples.push(this.add.image(0, 0, 'fx-ripple').setDepth(DEPTH_PUDDLES + 0.01))
                const ripple = this.puddleRipples[next++ % this.puddleRipples.length]
                const spot = this.puddleSpots[Math.floor(Math.random() * this.puddleSpots.length)]
                ripple.setPosition(spot.x + (Math.random() - 0.5) * spot.rw, spot.y + (Math.random() - 0.5) * spot.rh).setScale(0.2).setAlpha(0.8)
                this.tweens.killTweensOf(ripple)
                this.tweens.add({ targets: ripple, scale: 0.9, alpha: 0, duration: 520, ease: 'Quad.easeOut' })
            },
        })
    }

    /**
     * Pluie (printemps) : gouttes = petites Images inclinées, réutilisées (même système
     * que le sable et la neige) ; un voile sombre accompagne l'averse.
     */
    private setRain(level: 'none' | 'drizzle' | 'storm') {
        if (level === this.rainLevel) return
        this.rainLevel = level
        const count = level === 'storm' ? 170 : level === 'drizzle' ? 45 : 0
        if (count > 0 && !this.textures.exists('fx-rain')) {
            const tex = this.textures.createCanvas('fx-rain', 2, 14)
            const ctx = tex?.getContext()
            if (tex && ctx) {
                const grad = ctx.createLinearGradient(0, 0, 0, 14)
                grad.addColorStop(0, 'rgba(210, 228, 255, 0)')
                grad.addColorStop(1, 'rgba(210, 228, 255, 0.95)')
                ctx.fillStyle = grad
                ctx.fillRect(0, 0, 2, 14)
                tex.refresh()
            }
        }
        const w = GRID_WIDTH * CELL_SIZE, h = GRID_HEIGHT * CELL_SIZE
        while (this.rainDrops.length < count) {
            const x = Math.random() * (w + 40) - 20, y = Math.random() * h
            const img = this.add.image(x, y, 'fx-rain').setDepth(DEPTH_RAIN).setAngle(RAIN_ANGLE)
                .setAlpha(0.35 + Math.random() * 0.4).setScale(1, 0.8 + Math.random() * 0.6)
            this.rainDrops.push({ img, x, y, v: 520 + Math.random() * 260 })
        }
        this.rainDrops.forEach((d, i) => d.img.setVisible(i < count))
        this.rainVisible = count

        if (!this.rainShade) {
            if (!this.textures.exists('fx-px')) {
                const tex = this.textures.createCanvas('fx-px', 4, 4)
                const ctx = tex?.getContext()
                if (tex && ctx) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 4, 4); tex.refresh() }
            }
            this.rainShade = this.add.image(0, 0, 'fx-px').setOrigin(0, 0).setDisplaySize(w, h)
                .setTint(0x18263a).setAlpha(0).setDepth(DEPTH_RAIN - 1)
        }
        this.tweens.killTweensOf(this.rainShade)
        this.tweens.add({ targets: this.rainShade, alpha: level === 'storm' ? 0.22 : level === 'drizzle' ? 0.07 : 0, duration: 1500 })
        this.setPuddles(level)
    }

    /** Fait tomber les gouttes visibles (appelé chaque frame par update()). */
    private updateRain(delta: number) {
        if (this.rainVisible === 0) return
        const w = GRID_WIDTH * CELL_SIZE, h = GRID_HEIGHT * CELL_SIZE
        const dt = Math.min(delta, 50) / 1000
        const drift = Math.tan(Phaser.Math.DegToRad(RAIN_ANGLE))
        for (let i = 0; i < this.rainVisible; i++) {
            const d = this.rainDrops[i]
            d.y += d.v * dt
            d.x -= d.v * dt * drift
            if (d.y > h + 14) { d.y = -14; d.x = Math.random() * (w + 40) - 20 }
            if (d.x < -20) d.x += w + 40
            d.img.setPosition(d.x, d.y)
        }
    }

    startCoop() {
        this.coopActive = true
    }

    /**
     * Reçoit un snapshot serveur (15 Hz) : réconcilie les tours, déclenche les
     * effets de tir du tick, et met à jour le buffer d'ennemis interpolé par
     * update(). Les ennemis disparus sont classés mort/arrivée pour rejouer la
     * bonne animation (le snapshot ne porte pas l'info explicitement).
     */
    pushCoopSnapshot(
        enemies: EnemySnapshot[],
        towers: { id: string; type: string; x: number; y: number; level: number }[],
        shots: { fromX: number; fromY: number; toX: number; toY: number }[],
        terrain?: TerrainSnapshot,
    ) {
        // Tours : réutilise le rendu solo (sprites, base+arme, PV…).
        this.drawTowers(towers.map((t) => ({
            id: t.id, type: t.type as TowerData['type'], x: t.x, y: t.y, level: t.level,
        })))

        this.renderTerrainState(terrain)

        // Diff ennemis pour distinguer morts (tués) et arrivées (au château).
        const prevEnemies = this.coopCurr?.enemies ?? []
        const currIds = new Set(enemies.map((e) => e.id))
        const deaths: string[] = []
        const reached = new Set<string>()
        for (const e of prevEnemies) {
            if (currIds.has(e.id)) continue
            const distToCastle = Math.hypot(e.x - this.pathEnd.x, e.y - this.pathEnd.y)
            if (distToCastle <= 1.3) reached.add(e.id)
            else deaths.push(e.id)
        }
        this.coopDeaths = deaths
        this.coopReached = reached
        this.coopPrev = this.coopCurr
        this.coopCurr = { enemies, t: performance.now() }

        // Tirs du tick : mêmes projectiles / impacts / sons que le solo.
        const towerByCell = new Map(towers.map((t) => [`${t.x},${t.y}`, t]))
        for (const sh of shots) this.renderCoopShot(sh, towerByCell)
    }

    /** Effet visuel + sonore d'un tir coop (tour → ennemi), par type de tour. */
    private renderCoopShot(
        sh: { fromX: number; fromY: number; toX: number; toY: number },
        towerByCell: Map<string, { id: string; type: string }>,
    ) {
        const tower = towerByCell.get(`${sh.fromX},${sh.fromY}`)
        const type = tower?.type
        const fromPx = sh.fromX * CELL_SIZE + CELL_SIZE / 2
        const fromPy = sh.fromY * CELL_SIZE + CELL_SIZE / 2
        const toPx = sh.toX * CELL_SIZE + CELL_SIZE / 2
        const toPy = sh.toY * CELL_SIZE + CELL_SIZE / 2
        const angle = Phaser.Math.RadToDeg(Math.atan2(toPy - fromPy, toPx - fromPx)) + 180

        if (tower && type && ROT_WEAPON[type] && PROJECTILES[type]) {
            // Archer / Baliste : arme qui pivote + projectile volant + impact.
            this.aimAndFireWeapon(tower.id, type, toPx, toPy)
            this.playSfx(type === 'BALLISTA' ? 'shoot_bolt' : 'shoot_arrow', 40, 0.7)
            this.spawnProjectile(PROJECTILES[type].key, fromPx, fromPy, toPx, toPy,
                () => this.spawnImpact(TOWER_IMPACT[type], sh.toX, sh.toY, 0.9, angle))
        } else if (type === 'MAGE' && tower) {
            this.playTowerFire(tower.id, 'MAGE')
            this.playSfx('shoot_mage', 60, 0.6)
            this.spawnImpact('fireball', sh.toX, sh.toY, 0.9)
        } else if (type === 'CATAPULT') {
            this.playSfx('shoot_catapult', 80, 0.7)
            this.spawnImpact('explosion', sh.toX, sh.toY, 1.5)
        } else {
            // Type inconnu : impact léger orienté (fallback).
            this.spawnImpact('firearrow', sh.toX, sh.toY, 0.7, angle)
        }
    }

    drawTowers(towers: TowerData[]) {
        if (!this.towersGraphics) {
            // Scène pas encore initialisée : mémoriser pour rejouer en fin de
            // create() plutôt que de perdre silencieusement l'affichage.
            this.pendingTowers = towers
            return
        }
        this.towersGraphics.clear()

        // Pastilles : on note celles redessinées ce tour-ci, les autres sont
        // détruites en fin de méthode.
        this.pipsDrawn.clear()

        this.towersById.clear()
        // Copie défensive : playWave met à jour les PV en direct (voir renderTick)
        // sur les objets de towersById — cloner isole ces mutations d'animation
        // des données React/Zustand, qui restent la copie de référence jusqu'au
        // refetch de fin de vague.
        towers.forEach((tower) => this.towersById.set(tower.id, { ...tower }))

        // Réconcilie les sprites de tours : retire ceux dont la tour n'existe plus.
        const present = new Set(towers.map((t) => t.id))
        for (const [id, sprite] of this.towerSprites) {
            if (!present.has(id)) {
                sprite.destroy()
                this.towerSprites.delete(id)
                this.towerWeapons.get(id)?.destroy()
                this.towerWeapons.delete(id)
            }
        }

        this.towersById.forEach((tower) => {
            const px = tower.x * CELL_SIZE
            const py = tower.y * CELL_SIZE
            const hasSprite = TOWER_SPRITE_TYPES.includes(tower.type)

            if (hasSprite) {
                // Base dans towerSprites ; arme rotative éventuelle dans towerWeapons.
                let base = this.towerSprites.get(tower.id)
                if (!base) {
                    const parts = this.createTowerParts(tower.type)
                    base = parts.base
                    this.towerSprites.set(tower.id, base)
                    if (parts.weapon) this.towerWeapons.set(tower.id, parts.weapon)
                }
                const topY = this.placeTowerParts(tower.type, tower.x, tower.y, base, this.towerWeapons.get(tower.id))
                this.drawTowerMarkers(tower, px, topY)
                return
            }

            // Repli géométrique (type sans sprite) : carré coloré.
            this.towersGraphics.fillStyle(TOWER_COLORS[tower.type] ?? 0xffffff, 1)
            this.towersGraphics.fillRect(px + 4, py + 4, CELL_SIZE - 8, CELL_SIZE - 8)
            this.drawTowerMarkers(tower, px, py)
        })

        for (const [id, pips] of this.towerPips) {
            if (this.pipsDrawn.has(id)) continue
            pips.destroy()
            this.towerPips.delete(id)
        }

        // Pose, amélioration (portée), destruction en combat : la tour survolée ou
        // sélectionnée a pu changer → survol, repères et aperçu remis à jour.
        this.syncHoveredTower()
        this.refreshFocus()
        if (this.buildPreviewType) this.drawBuildPreview()
    }

    /**
     * Crée les GameObjects d'une tour, échelle et origine comprises (partagé par
     * les tours posées et la silhouette de l'aperçu) :
     * - arme rotative (Archer, Baliste, Catapulte) : base statique + arme
     *   superposée qui pivote vers la cible (voir aimAndFireWeapon) ;
     * - arme animée (Mage) : Sprite au repos sur la frame 0 ;
     * - Mur : Image statique centrée.
     */
    private createTowerParts(type: string): {
        base: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite
        weapon?: Phaser.GameObjects.Sprite
    } {
        const width = CELL_SIZE * (TOWER_WIDTH[type] ?? DEFAULT_TOWER_WIDTH)
        const rot = ROT_WEAPON[type]
        if (rot) {
            const base = this.add.image(0, 0, `tower-${type}-base`).setOrigin(0.5, 1)
            base.setScale(width / base.width)
            const weapon = this.add.sprite(0, 0, `tower-${type}-weapon`, 0).setOrigin(rot.pivotX, rot.pivotY)
            weapon.setScale(width / base.width) // même échelle que sa base
            return { base, weapon }
        }
        if (type === 'WALL') {
            const base = this.add.image(0, 0, 'tower-WALL').setOrigin(0.5, 0.5)
            base.setScale((CELL_SIZE * WALL_WIDTH) / base.width)
            return { base }
        }
        const base = TOWER_ANIM[type]
            ? this.add.sprite(0, 0, `tower-${type}-anim`, 0)
            : this.add.image(0, 0, `tower-${type}`)
        // Ancrée en bas-centre : la structure déborde vers le haut (comme les ennemis).
        base.setOrigin(0.5, 1)
        base.setScale(width / base.width)
        return { base }
    }

    /**
     * Place une tour sur sa case (position, profondeur, orientation du mur) et
     * renvoie le haut de son sprite — où se calent barre de vie, pastilles et
     * étiquette d'aperçu.
     */
    private placeTowerParts(
        type: string, cellX: number, cellY: number,
        base: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite,
        weapon?: Phaser.GameObjects.Sprite,
    ): number {
        const px = cellX * CELL_SIZE, py = cellY * CELL_SIZE
        if (type === 'WALL') {
            // Mur : barricade CENTRÉE, orientée selon la direction du chemin à sa
            // case pour que les pointes (vers le HAUT dans le sprite d'origine)
            // fassent face au flux d'ennemis. Sur le serpentin les ennemis arrivent
            // par la gauche (voie haute), la droite (voie médiane) ou le haut
            // (descentes) — l'angle s'adapte donc au lieu d'être figé.
            const { dx, dy } = mapPathDir(this.mapDef, cellX, cellY)
            // Pointes = sens OPPOSÉ au déplacement (face aux assaillants).
            base.setAngle(dx > 0 ? -90 : dx < 0 ? 90 : dy < 0 ? 180 : 0)
            // Au ras du sol : trié sur le milieu de sa case.
            base.setPosition(px + CELL_SIZE / 2, py + CELL_SIZE / 2).setDepth(unitDepth(cellY + 0.5))
            return py
        }
        // Tour : pieds au bas de SA case (1 px au-dessus du bord) et largeur < 1
        // case (TOWER_WIDTH) → elle ne mord plus sur ses voisines ; seule la
        // structure déborde vers le haut, triée en profondeur (unitDepth).
        const footY = py + CELL_SIZE - 1
        const depth = unitDepth(cellY + 1)
        base.setPosition(px + CELL_SIZE / 2, footY).setDepth(depth)
        const rot = ROT_WEAPON[type]
        if (weapon && rot) {
            weapon.setPosition(px + CELL_SIZE / 2, footY - base.displayHeight * (1 - rot.mountFrac))
            // Juste au-dessus de SA base, mais sous les tours de la rangée suivante
            // (deux rangées sont espacées de 0.01 en profondeur).
            weapon.setDepth(depth + 0.001)
        }
        return footY - base.displayHeight
    }

    /**
     * Repères au-dessus d'une structure, calés sur le HAUT de son sprite (topY)
     * plutôt que sur sa case : barre de vie si elle est endommagée, puis pastilles
     * de palier (✦) d'une tour améliorée (niveau ≥ 2), réutilisées d'un redraw à
     * l'autre (voir towerPips).
     */
    private drawTowerMarkers(tower: TowerData, px: number, topY: number) {
        const barShown = this.drawStructureHpBar(tower, px, topY - 6)
        const lvl = tower.level ?? 1
        if (lvl < 2 || tower.type === 'WALL') return
        const label = '✦'.repeat(lvl)
        let pips = this.towerPips.get(tower.id)
        if (!pips) {
            pips = this.add.text(0, 0, label, {
                fontFamily: 'monospace', fontSize: '11px', color: '#f2c94c',
            }).setOrigin(0.5, 1).setDepth(6)
            pips.setStroke('#3a2a10', 3)
            this.towerPips.set(tower.id, pips)
        } else if (pips.text !== label) {
            pips.setText(label) // setText retrace la texture : seulement si le niveau change
        }
        pips.setPosition(px + CELL_SIZE / 2, barShown ? topY - 7 : topY - 1)
        this.pipsDrawn.add(tower.id)
    }

    /**
     * Barre de vie de la structure (tour ou mur) — affichée uniquement si elle a
     * déjà subi des dégâts (Sapeur, rayon/pulse de Boss, mêlée contre un mur) ;
     * une structure intacte ou dont le backend n'envoie pas encore hp/maxHp ne
     * l'affiche pas, pour ne pas surcharger l'écran en l'absence de menace.
     * Renvoie true si la barre est dessinée.
     */
    private drawStructureHpBar(tower: TowerData, px: number, barY: number): boolean {
        if (tower.hp == null || tower.maxHp == null || tower.hp >= tower.maxHp) return false

        const hpRatio = tower.maxHp > 0 ? Math.max(0, tower.hp / tower.maxHp) : 0
        const barWidth = CELL_SIZE * 0.8
        const barX = px + CELL_SIZE / 2 - barWidth / 2

        this.towersGraphics.fillStyle(0x000000, 0.5)
        this.towersGraphics.fillRect(barX, barY, barWidth, 4)
        this.towersGraphics.fillStyle(hpRatio > 0.3 ? 0x22c55e : 0xef4444, 1)
        this.towersGraphics.fillRect(barX, barY, barWidth * hpRatio, 4)
        return true
    }

    /**
     * Rejoue le journal de ticks d'une vague reçu du backend : un tick = un instant
     * de la simulation (positions des ennemis, vie courante, dégâts au château).
     * Les ennemis sont redessinés à chaque tick à un rythme fixe (TICK_DELAY_MS).
     */
    playWave(
        ticks: TickSnapshot[],
        onTick?: (castleHp: number) => void,
        onComplete?: () => void,
        // Types d'ennemis dont le tuto n'a pas encore été vu : à leur 1re
        // apparition, la vague se met en pause et onNeedTutorial est appelé (voir
        // game/page.tsx). resumeWave() reprend l'animation après « Compris ».
        unseenEnemyTypes?: Set<string>,
        onNeedTutorial?: (type: string) => void,
    ) {
        // Scène pas (ou plus) initialisée : signaler quand même la fin plutôt que
        // de sortir en silence — sinon l'appelant ne reçoit jamais onComplete et
        // l'UI reste verrouillée en "combat en cours" (voir GameCanvas/page).
        if (!this.enemiesGraphics) {
            onComplete?.()
            return
        }
        this.waveTimer?.remove()
        // Remise à zéro de la cadence des éclats de magie : sinon les valeurs de
        // la vague précédente (grands numéros de tick) bloquent les premiers
        // éclats du Mage au début de cette vague-ci (index repart de 0).
        this.magicFxTick.clear()
        this.castleFell = false
        this.seasonalCombat = true
        this.soloPrev = null
        this.soloCurr = null

        let index = 0

        const renderTick = () => {
            if (index >= ticks.length) {
                this.enemiesGraphics.clear()
                this.enemyBarsGraphics.clear()
                this.effectsGraphics.clear()
                this.clearEnemySprites()
                this.waveTimer?.remove()
                this.waveTimer = undefined
                this.waveRender = undefined
                this.soloPrev = null
                this.soloCurr = null
                this.seasonalCombat = false
                this.renderTerrainState()
                onComplete?.()
                return
            }

            const tick = ticks[index]

            // Tuto ennemi : à la 1re apparition d'un type non encore vu, on rend
            // ce tick (l'ennemi devient visible) PUIS on met la vague en pause et
            // on prévient React d'afficher la bulle. resumeWave() reprend ensuite.
            if (unseenEnemyTypes && unseenEnemyTypes.size > 0 && onNeedTutorial) {
                const newType = tick.enemies.map((e) => e.type).find((t) => unseenEnemyTypes.has(t))
                if (newType) {
                    unseenEnemyTypes.delete(newType)
                    this.drawWaveTick(tick, index)
                    onTick?.(tick.castleHp)
                    index++
                    this.waveTimer?.remove()
                    this.waveTimer = undefined
                    onNeedTutorial(newType)
                    return
                }
            }

            this.drawWaveTick(tick, index)
            onTick?.(tick.castleHp)
            index++
        }
        this.waveRender = renderTick

        renderTick()
        if (ticks.length > 1) {
            this.waveTimer = this.time.addEvent({ delay: TICK_DELAY_MS, callback: renderTick, loop: true })
        } else if (ticks.length === 1) {
            renderTick()
        }
    }

    /** Reprend la vague mise en pause par le tuto (voir playWave / TutorialBubble). */
    resumeWave() {
        if (this.waveTimer || !this.waveRender) return
        this.waveRender()
        if (this.waveRender) {
            this.waveTimer = this.time.addEvent({ delay: TICK_DELAY_MS, callback: this.waveRender, loop: true })
        }
    }

    /** Dessine un tick de la vague (extrait de playWave pour être réutilisé). */
    private drawWaveTick(tick: TickSnapshot, index: number) {
            this.renderTerrainState(tick.terrain)
            // Dégâts de siège de ce tick (Sapeur ou pulse de Boss) : appliqués en
            // direct aux copies locales (voir towersById) pour que les jauges des
            // tours baissent PENDANT l'animation — sans ça, les dégâts du Boss
            // étaient invisibles jusqu'au refetch de fin de vague et son attaque
            // de zone passait pour purement cosmétique. Une tour détruite doit en
            // plus disparaître immédiatement de l'affichage (et de towersById,
            // sinon drawEffects continuerait de lui trouver une position).
            if (tick.towerDamageEvents.length > 0 || tick.destroyedTowers.length > 0) {
                tick.towerDamageEvents.forEach((event) => {
                    const tower = this.towersById.get(event.towerId)
                    if (tower && tower.hp != null) {
                        tower.hp = Math.max(0, tower.hp - event.damage)
                    }
                })
                tick.destroyedTowers.forEach((towerId) => {
                    // Explosion de destruction à l'emplacement de la tour (réutilise
                    // l'effet de poussière) AVANT de la retirer de l'affichage.
                    const t = this.towersById.get(towerId)
                    if (t) this.spawnImpact('destroy', t.x, t.y, 1.8) // feu = destruction (≠ poussière catapulte)
                    this.towersById.delete(towerId)
                })
                this.drawTowers(Array.from(this.towersById.values()))
                // Copies : la page ne doit pas garder de référence vers les objets
                // que l'animation continue de muter.
                this.onTowersLive?.(Array.from(this.towersById.values(), (t) => ({ ...t })))
            }

            // Ennemis qui frappent une tour ce tick (siège du Sapeur, rayon d'un
            // Chariot/Boss, ou n'importe qui bloqué contre un mur) : jouent leur
            // anim d'attaque au lieu de marcher (voir drawEnemies).
            const attackingIds = new Set(tick.towerDamageEvents.map((e) => e.enemyId))
            const reachedIds = new Set(tick.reachedCastle ?? [])

            this.effectsGraphics.clear()
            // Ennemis : dessinés par update(), interpolés depuis le tick précédent.
            this.soloPrev = this.soloCurr
            this.soloCurr = {
                enemies: tick.enemies, t: performance.now(),
                deaths: tick.deaths, attacking: attackingIds, reached: reachedIds,
            }
            this.soloSettled = false
            this.drawEffects(tick.damageEvents, tick.towerDamageEvents, tick.enemies, index)
            this.drawCastleAttacks(tick.castleAttacks ?? [], tick.enemies)
            this.drawBossAbilityEvents(tick.bossAbilityEvents)
            this.drawStunnedTowers(tick.stunnedTowers ?? [])

            // Chute du château : volée d'explosions de feu échelonnées sur la
            // forteresse d'arrivée (une seule fois, voir castleFell).
            if (tick.castleHp <= 0 && !this.castleFell) {
                this.castleFell = true
                for (let i = 0; i < 6; i++) {
                    this.time.delayedCall(i * 110, () => {
                        this.spawnImpact(
                            'bigboom',
                            this.pathEnd.x + (Math.random() * 2 - 1),
                            this.pathEnd.y + (Math.random() * 1.6 - 0.8),
                            2.6,
                        )
                    })
                }
            }
    }

    private drawEnemies(enemies: EnemySnapshot[], deaths: string[] = [], attackingIds: Set<string> = new Set(), reachedIds: Set<string> = new Set()) {
        this.enemiesGraphics.clear()
        this.enemyBarsGraphics.clear()

        const alive = new Set(enemies.map((e) => e.id))
        const dying = new Set(deaths)
        for (const [id, sprite] of this.enemySprites) {
            if (alive.has(id)) continue
            if (dying.has(id) && sprite.anims.currentAnim?.key !== sprite.getData('dieKey')) {
                // Mort ce tick : joue l'animation de mort SUR PLACE (dernière
                // position connue), puis auto-destruction à la fin — le sprite
                // n'est plus dans les ticks suivants mais son GameObject survit
                // le temps de l'agonie.
                const dieKey = sprite.getData('dieKey') as string
                sprite.setData('dying', true)
                // Pitch selon le gabarit + léger aléa (±5%) pour éviter la répétition.
                const base = DEATH_PITCH[sprite.getData('type') as string] ?? 1
                this.playSfx('enemy_death', 55, 0.7, base * (0.95 + Math.random() * 0.1))
                sprite.play(dieKey)
                sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
                    sprite.destroy()
                    this.enemySprites.delete(id)
                })
            } else if (reachedIds.has(id) && !sprite.getData('reached') && !sprite.getData('dying')) {
                // Atteint le château : joue une brève anim d'attaque sur place
                // (dernière position connue, devant les remparts) puis disparaît.
                // Purement cosmétique — les dégâts au château sont déjà appliqués
                // côté backend au tick d'arrivée (WaveSimulationService).
                const atkKey = `${sprite.getData('type')}-attack`
                sprite.setData('reached', true)
                if (this.anims.exists(atkKey)) {
                    sprite.play(atkKey)
                    this.time.delayedCall(600, () => {
                        sprite.destroy()
                        this.enemySprites.delete(id)
                    })
                } else {
                    sprite.destroy()
                    this.enemySprites.delete(id)
                }
            } else if (!dying.has(id) && !sprite.getData('dying') && !sprite.getData('reached')) {
                // Sorti du champ (fuite) sans mourir : retrait sec.
                sprite.destroy()
                this.enemySprites.delete(id)
            }
        }

        enemies.forEach((enemy) => {
            const color = ENEMY_COLORS[enemy.type] ?? 0xffffff
            const px = enemy.x * CELL_SIZE + CELL_SIZE / 2
            const py = enemy.y * CELL_SIZE + CELL_SIZE / 2
            const isBoss = enemy.type === 'BOSS_WARLORD'
            const radius = isBoss ? CELL_SIZE * 0.55 : CELL_SIZE / 3

            if (SPRITE_ENEMY_TYPES.includes(enemy.type)) {
                // Anneau arcane sous le Chevalier noir : rappelle son armure
                // enchantée (seuls les Mages le blessent, voir EnemyType.magicArmor)
                // — l'info était portée par un liseré à l'époque des cercles.
                if (enemy.type === 'DARK_KNIGHT') {
                    this.enemiesGraphics.lineStyle(2, 0xa78bfa, 0.9)
                    this.enemiesGraphics.strokeEllipse(px, py + CELL_SIZE * 0.2, CELL_SIZE * 0.7, CELL_SIZE * 0.35)
                }

                // Rendu sprite animé : réutilise ou crée le GameObject de cet ennemi.
                let sprite = this.enemySprites.get(enemy.id)
                if (!sprite) {
                    sprite = this.add.sprite(px, py, `enemy-${enemy.type}`)
                    // Le contenu utile du chibi occupe ~2/3 du cadre 96px, on
                    // surdimensionne donc. Taille PAR TYPE : la piétaille (Goblin)
                    // est la plus petite, les brutes (Orc, Troll) plus imposantes,
                    // le Boss nettement plus gros pour rester identifiable au milieu
                    // de son escorte (voir ENEMY_SCALE).
                    const scale = CELL_SIZE * (ENEMY_SCALE[enemy.type] ?? 1.6)
                    sprite.setDisplaySize(scale, scale)
                    sprite.setData('dieKey', `${enemy.type}-die`)
                    sprite.setData('type', enemy.type)
                    sprite.play(`${enemy.type}-walk`)
                    this.enemySprites.set(enemy.id, sprite)
                }
                // Marche ↔ attaque : bascule selon que l'ennemi frappe une tour ce
                // tick (towerDamageEvents). On ne relance pas l'anim si elle tourne
                // déjà (sinon elle repart à la frame 0 chaque tick, effet saccadé).
                const wantKey = attackingIds.has(enemy.id) ? `${enemy.type}-attack` : `${enemy.type}-walk`
                if (sprite.anims.currentAnim?.key !== wantKey) {
                    sprite.play(wantKey)
                }
                sprite.setPosition(px, py - CELL_SIZE * 0.25) // pieds ~au centre de la case
                // Tri en profondeur avec les tours (pieds ~aux 3/4 de la case) : un
                // ennemi qui passe devant une tour la recouvre, derrière il est masqué.
                sprite.setDepth(unitDepth(enemy.y + 0.75))
                this.drawEnemyHpBar(enemy, px, py, radius, isBoss)
                return
            }

            this.enemiesGraphics.fillStyle(color, 1)
            if (enemy.type === 'CHARIOT') {
                // Silhouette carrée : un ENGIN, pas une créature.
                this.enemiesGraphics.fillRect(px - radius, py - radius, radius * 2, radius * 2)
            } else {
                this.enemiesGraphics.fillCircle(px, py, radius)
            }
            if (isBoss) {
                this.enemiesGraphics.lineStyle(3, 0x000000, 0.8)
                this.enemiesGraphics.strokeCircle(px, py, radius)
            } else if (enemy.type === 'DARK_KNIGHT') {
                // Liseré arcane : armure enchantée (voir EnemyType.magicArmor).
                this.enemiesGraphics.lineStyle(2, 0xa78bfa, 0.9)
                this.enemiesGraphics.strokeCircle(px, py, radius + 2)
            }

            this.drawEnemyHpBar(enemy, px, py, radius, isBoss)
        })
    }

    /** Barre de vie au-dessus d'un ennemi (commune sprites et formes géométriques). */
    private drawEnemyHpBar(enemy: EnemySnapshot, px: number, py: number, radius: number, isBoss: boolean) {
        const hpRatio = enemy.maxHp > 0 ? Math.max(0, enemy.hp / enemy.maxHp) : 0
        const barWidth = isBoss ? CELL_SIZE * 1.4 : CELL_SIZE * 0.8
        const barX = px - barWidth / 2
        const barY = py - radius - 6

        this.enemyBarsGraphics.fillStyle(0x000000, 0.5)
        this.enemyBarsGraphics.fillRect(barX, barY, barWidth, 4)
        this.enemyBarsGraphics.fillStyle(hpRatio > 0.3 ? 0x22c55e : 0xef4444, 1)
        this.enemyBarsGraphics.fillRect(barX, barY, barWidth * hpRatio, 4)
    }

    /**
     * Tir défensif du château (voir castleAttacks) : une flèche de feu part de
     * l'arrivée vers chaque ennemi touché ce tick — les archers des remparts.
     */
    private drawCastleAttacks(castleAttacks: string[], enemies: EnemySnapshot[]) {
        if (castleAttacks.length === 0) return
        const enemyById = new Map(enemies.map((e) => [e.id, e]))
        const castleX = this.pathEnd.x * CELL_SIZE + CELL_SIZE / 2
        const castleY = this.pathEnd.y * CELL_SIZE + CELL_SIZE / 2

        // Les archers des remparts décochent une VRAIE flèche (plus de trait) vers
        // chaque ennemi ciblé, avec le sifflement de flèche ; l'impact enflammé
        // éclate à l'arrivée. Départ un peu au-dessus du sol = les remparts.
        const fromY = castleY - CELL_SIZE * 0.6
        this.playSfx('shoot_arrow', 45, 0.8)
        castleAttacks.forEach((id) => {
            const enemy = enemyById.get(id)
            if (!enemy) return
            const ex = enemy.x * CELL_SIZE + CELL_SIZE / 2
            const ey = enemy.y * CELL_SIZE + CELL_SIZE / 2
            const arrowAngle = Phaser.Math.RadToDeg(Math.atan2(ey - fromY, ex - castleX)) + 180
            this.spawnProjectile('arrow', castleX, fromY, ex, ey, () => {
                this.spawnImpact('firearrow', enemy.x, enemy.y, 0.9, arrowAngle)
            })
        })
    }

    /** Détruit tous les sprites d'ennemis (fin de vague / arrêt de scène). */
    private clearEnemySprites() {
        for (const sprite of this.enemySprites.values()) sprite.destroy()
        this.enemySprites.clear()
    }

    /**
     * Joue un effet d'impact one-shot à une position (case), puis s'auto-détruit.
     * scale : diamètre affiché en cases (l'explosion de Catapulte est agrandie
     * au rayon d'éclat pour signaler sa zone).
     */
    // Anti-flood : ne rejoue un même bruitage que si `gap` ms se sont écoulés.
    private sfxLast = new Map<string, number>()
    private playSfx(name: Sfx, gap = 0, vol = 1, rate = 1) {
        const now = this.time.now
        if (gap > 0 && now - (this.sfxLast.get(name) ?? -1e9) < gap) return
        this.sfxLast.set(name, now)
        audio.play(name, { volume: vol, rate })
    }

    private spawnImpact(key: string, cellX: number, cellY: number, scale = 1, angleDeg = 0) {
        const s = IMPACT_SFX[key]
        if (s) this.playSfx(s.sfx, s.gap, s.vol ?? 1)
        const fx = this.add.sprite(
            cellX * CELL_SIZE + CELL_SIZE / 2,
            cellY * CELL_SIZE + CELL_SIZE / 2,
            `fx-${key}`,
        )
        fx.setDisplaySize(CELL_SIZE * scale, CELL_SIZE * scale)
        fx.setDepth(10) // au-dessus des ennemis et du décor
        if (angleDeg) fx.setAngle(angleDeg) // impact orienté (ex. suit la trajectoire d'une flèche)
        fx.play(`fx-${key}`)
        fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy())
    }

    /**
     * Projectile volant (flèche/carreau) de la tour vers la cible. Le sprite
     * d'origine pointe vers le HAUT : on le pivote dans la direction du tir, on
     * l'anime en boucle, puis un tween l'amène à la cible en ~un tick — à
     * l'arrivée l'impact éclate et le projectile disparaît. onArrive porte
     * l'effet d'impact (pour ne le déclencher qu'au contact, pas au départ).
     */
    private spawnProjectile(
        projKey: string,
        fromPx: number,
        fromPy: number,
        toPx: number,
        toPy: number,
        onArrive: () => void,
    ) {
        const p = this.add.sprite(fromPx, fromPy, `proj-${projKey}`)
        // Sprite dessiné pointe vers le haut (−90°) : rotation = angle du vecteur + 90°.
        p.setRotation(Math.atan2(toPy - fromPy, toPx - fromPx) + Math.PI / 2)
        p.setDisplaySize(CELL_SIZE * 0.18, CELL_SIZE * 0.5)
        p.setDepth(9)
        p.play(`proj-${projKey}`)
        this.tweens.add({
            targets: p,
            x: toPx,
            y: toPy,
            duration: TICK_DELAY_MS * 0.7,
            onComplete: () => {
                onArrive()
                p.destroy()
            },
        })
    }

    /**
     * Joue l'animation de tir d'une tour (arme qui s'active). Pour un tir
     * ponctuel (Archer/Baliste/Catapulte) : rejoue depuis le début à chaque
     * salve puis revient au repos (frame 0). Pour le rayon continu (Mage,
     * loop) : lance la boucle si elle ne tourne pas déjà — resetIdleTowers la
     * coupe quand la tour ne vise plus. Renvoie true si la tour est animée.
     */
    private playTowerFire(towerId: string, type: string): boolean {
        const spec = TOWER_ANIM[type]
        if (!spec) return false
        const s = this.towerSprites.get(towerId)
        if (!(s instanceof Phaser.GameObjects.Sprite)) return false
        const key = `tower-${type}-fire`
        if (spec.loop) {
            if (s.anims.currentAnim?.key !== key || !s.anims.isPlaying) s.play(key)
        } else {
            // Tir ponctuel : on REJOUE depuis le début à chaque salve (play sans
            // ignoreIfPlaying = redémarrage), même si l'anim précédente tourne
            // encore. L'ancien garde !isPlaying sautait les tirs rapproches ->
            // animation intermittente/saccadée (surtout Baliste/Archer). Retour au
            // repos (frame 0) quand l'anim va jusqu'au bout sans être relancée.
            s.play(key, false)
            s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.setFrame(0))
        }
        return true
    }

    /**
     * Tour à arme rotative (Archer, Baliste) : pivote l'arme vers la cible et
     * rejoue son animation de tir. Le sprite d'arme pointe vers le HAUT au repos,
     * d'où le +90° sur l'angle du vecteur tour→cible.
     */
    private aimAndFireWeapon(towerId: string, type: string, targetPx: number, targetPy: number) {
        if (!ROT_WEAPON[type]) return
        const weapon = this.towerWeapons.get(towerId)
        if (!weapon) return
        weapon.setRotation(Math.atan2(targetPy - weapon.y, targetPx - weapon.x) + Math.PI / 2)
        weapon.play(`weapon-${type}-fire`)
    }

    /**
     * Coupe l'anim en boucle (Mage) des tours qui n'ont PAS tiré ce tick et les
     * remet au repos — sinon l'orbe continuerait de pulser sans cible.
     */
    private resetIdleLoopTowers(firedThisTick: Set<string>) {
        this.towersById.forEach((tower) => {
            if (!TOWER_ANIM[tower.type]?.loop || firedThisTick.has(tower.id)) return
            const s = this.towerSprites.get(tower.id)
            if (s instanceof Phaser.GameObjects.Sprite && s.anims.isPlaying) {
                s.anims.stop()
                s.setFrame(0)
            }
        })
    }

    /**
     * Voile gris sur chaque tour étourdie par le pulse d'un Boss (voir
     * TickSnapshot.stunnedTowers) : la tour est réduite au silence tant que le
     * voile est visible — le joueur doit comprendre d'un coup d'œil pourquoi
     * elle ne tire plus, sinon l'étourdissement passe pour un bug de tir.
     */
    private drawStunnedTowers(stunnedTowers: string[]) {
        stunnedTowers.forEach((towerId) => {
            const tower = this.towersById.get(towerId)
            if (!tower) return

            const px = tower.x * CELL_SIZE
            const py = tower.y * CELL_SIZE

            this.effectsGraphics.fillStyle(0x64748b, 0.55) // slate-500, voile semi-opaque
            this.effectsGraphics.fillRect(px, py, CELL_SIZE, CELL_SIZE)
            this.effectsGraphics.lineStyle(2, 0x94a3b8, 0.9) // slate-400
            this.effectsGraphics.strokeRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4)
        })
    }

    /**
     * Dessine la pulsation d'aura/AoE d'un Boss (voir BossAbilityEvent) : un
     * anneau vert qui s'étend pour le soin de zone si des alliés ont été
     * soignés, un anneau orange pour l'attaque de zone si des tours ont été
     * touchées — les deux peuvent apparaître ensemble sur le même pulse.
     */
    private drawBossAbilityEvents(events: BossAbilityEvent[]) {
        events.forEach((event) => {
            const px = event.x * CELL_SIZE + CELL_SIZE / 2
            const py = event.y * CELL_SIZE + CELL_SIZE / 2

            if (event.alliesHealed > 0) {
                this.effectsGraphics.lineStyle(3, BOSS_HEAL_PULSE_COLOR, 0.8)
                this.effectsGraphics.strokeCircle(px, py, CELL_SIZE * 1.5)
            }
            if (event.towersHit > 0) {
                this.effectsGraphics.lineStyle(3, BOSS_AOE_PULSE_COLOR, 0.8)
                this.effectsGraphics.strokeCircle(px, py, CELL_SIZE * 1.1)
            }
        })
    }

    /**
     * Matérialise visuellement chaque attaque du tick : un trait pour le
     * mono-cible, un cercle sur la cible pour la zone (rayon = splashRadius),
     * un trait épais et persistant pour le continu (redessiné chaque tick
     * tant que la tour reste en train de toucher sa cible — c'est ce qui lui
     * donne son aspect "rayon" plutôt qu'un tir isolé). Sans ça, la zone et
     * le continu sont indistinguables du mono-cible à l'écran : seule la
     * barre de vie de l'ennemi bouge, sans indice sur la cause.
     */
    private drawEffects(
        damageEvents: DamageEvent[],
        towerDamageEvents: TowerDamageEvent[],
        enemies: EnemySnapshot[],
        tickIndex = 0
    ) {
        // Note : effectsGraphics est déjà vidé une fois par tick par l'appelant
        // (renderTick, voir playWave), pour pouvoir accueillir ensuite les
        // anneaux de drawBossAbilityEvents sans que celui-ci ne les efface.
        if (damageEvents.length === 0 && towerDamageEvents.length === 0) return

        const enemyById = new Map(enemies.map((e) => [e.id, e]))

        // Ligne de siège : un ennemi qui attaque une tour — sens inverse des
        // DamageEvent habituels (ennemi → tour, pas tour → ennemi), donc tracée
        // à part. Deux menaces distinctes, deux couleurs : rouge = Sapeur au
        // corps à corps, violet = rayon continu du Boss (profil "tour Mage"
        // inversé) qui canalise à distance en avançant.
        towerDamageEvents.forEach((event) => {
            const tower = this.towersById.get(event.towerId)
            const enemy = enemyById.get(event.enemyId)
            if (!tower || !enemy) return

            const towerPx = tower.x * CELL_SIZE + CELL_SIZE / 2
            const towerPy = tower.y * CELL_SIZE + CELL_SIZE / 2
            const enemyPx = enemy.x * CELL_SIZE + CELL_SIZE / 2
            const enemyPy = enemy.y * CELL_SIZE + CELL_SIZE / 2

            // Chaque menace a sa couleur : rouge = Sapeur au corps à corps,
            // violet = rayon du Boss, sinon la couleur du type (cyan Chariot,
            // gris Troll) — on identifie l'agresseur d'une tour d'un coup d'œil.
            // Démon de givre (CHARIOT) : PAS de trait — il TIRE un dard de glace
            // (projectile icebolt) du démon vers la tour, et l'impact `frost`
            // éclate à l'arrivée (le DÉGÂT). Cadencé (toutes les 3 frames) pour ne
            // pas saturer, le rayon étant continu côté backend.
            if (enemy.type === 'CHARIOT') {
                if (tickIndex % 3 === 0) {
                    this.playSfx('shoot_frost', 300, 0.55)
                    this.spawnProjectile('icebolt', enemyPx, enemyPy, towerPx, towerPy, () => {
                        this.spawnImpact('frost', tower.x, tower.y, 1.2)
                    })
                }
                return
            }

            // Autres assaillants : trait coloré (rouge = Sapeur au corps à corps,
            // violet = rayon du Boss, sinon la couleur du type) — on identifie
            // l'agresseur d'une tour d'un coup d'œil.
            const rayColor = enemy.type === 'SAPEUR' ? SIEGE_LINE_COLOR
                : enemy.type === 'BOSS_WARLORD' ? BOSS_RAY_COLOR
                : (ENEMY_COLORS[enemy.type] ?? SIEGE_LINE_COLOR)
            this.effectsGraphics.lineStyle(3, rayColor, 0.9)
            this.effectsGraphics.lineBetween(enemyPx, enemyPy, towerPx, towerPy)
        })

        // Une tour AOE (Catapulte) génère un damageEvent par ennemi touché : on
        // ne veut qu'UN effet d'impact par tour et par tick, pas un par éclat.
        const impactSpawned = new Set<string>()
        // Tours ayant tiré ce tick : sert à couper l'anim en boucle du Mage
        // quand il n'a plus de cible (voir resetIdleLoopTowers en fin de méthode).
        const firedThisTick = new Set<string>()

        damageEvents.forEach((event) => {
            const tower = this.towersById.get(event.towerId)
            const enemy = enemyById.get(event.enemyId)
            if (!tower || !enemy) return

            const damageType = tower.damageType ?? 'SINGLE_TARGET'
            const towerPx = tower.x * CELL_SIZE + CELL_SIZE / 2
            const towerPy = tower.y * CELL_SIZE + CELL_SIZE / 2
            const targetPx = enemy.x * CELL_SIZE + CELL_SIZE / 2
            const targetPy = enemy.y * CELL_SIZE + CELL_SIZE / 2

            if (damageType === 'CONTINUOUS') {
                // Rayon continu (Mage) : plus de trait — l'orbe animé canalise
                // (anim en boucle) et un éclat de magie cadencé frappe la cible
                // (toutes les MAGIC_FX_PERIOD frames, sinon l'écran saturerait).
                this.playTowerFire(tower.id, tower.type)
                firedThisTick.add(tower.id)
                const last = this.magicFxTick.get(tower.id) ?? -99
                if (tickIndex - last >= MAGIC_FX_PERIOD) {
                    this.playSfx('shoot_mage', 300, 0.32)
                    this.spawnImpact('fireball', enemy.x, enemy.y, 1.1)
                    this.magicFxTick.set(tower.id, tickIndex)
                }
            } else if (damageType === 'AOE') {
                // Catapulte : plus de trait — le marteau s'abat (anim de tir) et
                // l'explosion éclate sur la zone touchée. Un seul tir par tour/tick.
                if (!impactSpawned.has(tower.id)) {
                    this.playSfx('shoot_catapult', 50, 0.9)
                    const diameter = Math.max((tower.splashRadius ?? 0.5) * 2, 1.2)
                    this.spawnImpact('explosion', enemy.x, enemy.y, diameter)
                    impactSpawned.add(tower.id)
                    // Marteau qui vise la zone et s'abat (arme rotative).
                    this.aimAndFireWeapon(tower.id, tower.type, targetPx, targetPy)
                    firedThisTick.add(tower.id)
                }
            } else {
                const proj = PROJECTILES[tower.type]
                const impact = TOWER_IMPACT[tower.type]
                const isBallista = tower.type === 'BALLISTA'
                if (proj) {
                    // Tour à projectile (Archer, Baliste) : plus de trait — l'arme
                    // s'anime, une flèche/carreau vole vers la cible et l'impact
                    // éclate à l'arrivée. Un seul tir par tour et par tick.
                    if (!impactSpawned.has(tower.id)) {
                        this.playSfx(tower.type === 'BALLISTA' ? 'shoot_bolt' : 'shoot_arrow', 45, 0.8)
                        this.playTowerFire(tower.id, tower.type)
                        this.aimAndFireWeapon(tower.id, tower.type, targetPx, targetPy)
                        firedThisTick.add(tower.id)
                        const originY = towerPy - CELL_SIZE * 0.45 // part de l'arme, en haut
                        // Angle de vol de la flèche → l'impact s'oriente dessus (+180 :
                        // le sprite d'impact pointe dans le sens inverse par défaut).
                        const arrowAngle = Phaser.Math.RadToDeg(Math.atan2(targetPy - originY, targetPx - towerPx)) + 180
                        this.spawnProjectile(proj.key, towerPx, originY, targetPx, targetPy, () => {
                            if (impact) this.spawnImpact(impact, enemy.x, enemy.y, isBallista ? 1.4 : 1.0, arrowAngle)
                        })
                        impactSpawned.add(tower.id)
                    }
                } else {
                    // Repli (tour sans projectile ni anim) : impact instantané.
                    if (impact && !impactSpawned.has(tower.id)) {
                        this.spawnImpact(impact, enemy.x, enemy.y, isBallista ? 1.4 : 1.0)
                        impactSpawned.add(tower.id)
                    }
                }
            }
        })

        // Mage sans cible ce tick : on coupe sa boucle et on repose l'orbe.
        this.resetIdleLoopTowers(firedThisTick)
    }

    // ── Terrain (sol + route serpentine + props) ─────────────────────────

    /** Effet d'ambiance selon le biome : neige qui tombe (snow) ou soleil tapant (desert). */
    private initWeather() {
        const w = GRID_WIDTH * CELL_SIZE, h = GRID_HEIGHT * CELL_SIZE
        if (this.mapDef.biome === 'snow') {
            // Flocons : une couche au-dessus du jeu, animée chaque frame (updateWeather).
            this.snowflakes = []
            for (let i = 0; i < 90; i++) {
                this.addWeatherGrain(60, w, h, 12 + Math.random() * 22, -6 + Math.random() * 12,
                    1 + Math.random() * 2.2, 0.35 + Math.random() * 0.5, 0xffffff)
            }
        } else if (this.mapDef.biome === 'desert') {
            // Soleil TAPANT. 1) Halo chaud vif au coin haut-droit (soleil), alpha qui
            // respire. 2) Rayons de soleil (god rays) qui balaient et pulsent. Placés
            // au-dessus du sol mais sous les unités (depth < 0) → ambiance sans gêner.
            const sunX = w * 0.85, sunY = h * 0.05
            const key = 'sun-glare'
            {
                const tex = this.textures.get(key) instanceof Phaser.Textures.CanvasTexture
                    ? this.textures.get(key) as Phaser.Textures.CanvasTexture
                    : this.textures.createCanvas(key, w, h)
                const ctx = tex?.getContext()
                if (ctx) {
                    const g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, Math.max(w, h) * 0.95)
                    g.addColorStop(0, 'rgba(255,244,190,0.70)')
                    g.addColorStop(0.18, 'rgba(255,212,120,0.32)')
                    g.addColorStop(1, 'rgba(255,170,80,0)')
                    ctx.fillStyle = g
                    ctx.fillRect(0, 0, w, h)
                    tex?.refresh()
                }
            }
            const sun = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-8).setAlpha(0.55)
            this.tweens.add({ targets: sun, alpha: { from: 0.45, to: 0.8 }, duration: 4200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' })

            // Sable soufflé : grains sable qui dérivent en biais (surtout latéral), épars
            // et translucides → vivant et lisible, sans masquer le jeu (même système que
            // la neige, voir updateWeather). Couche au-dessus du plateau.
            this.snowflakes = []
            for (let i = 0; i < 70; i++) {
                this.addWeatherGrain(55, w, h, 5 + Math.random() * 11, 40 + Math.random() * 52,
                    0.9 + Math.random() * 1.7, 0.24 + Math.random() * 0.32,
                    Math.random() < 0.5 ? 0xe7d7ac : 0xdcc790)
            }
            // Mirage : lignes chaudes ondulantes au ras du sol, animées (updateWeather).
            // Sous les unités (depth -6) → shimmer sur le sable sans masquer le jeu.
            // Une onde est dessinée UNE fois dans une petite texture, puis chaque
            // ligne la tuile sur la largeur et la fait défiler (au lieu de 10
            // polylignes de 80 points re-tracées à chaque frame).
            if (!this.textures.exists('fx-heat')) {
                const tex = this.textures.createCanvas('fx-heat', HEAT_WAVELENGTH, 12)
                const ctx = tex?.getContext()
                if (ctx) {
                    ctx.strokeStyle = '#fff2d0'
                    ctx.lineWidth = 2
                    ctx.beginPath()
                    for (let x = 0; x <= HEAT_WAVELENGTH; x += 2) {
                        const y = 6 + Math.sin((x / HEAT_WAVELENGTH) * Math.PI * 2) * HEAT_TEX_AMP
                        if (x === 0) ctx.moveTo(x, y)
                        else ctx.lineTo(x, y)
                    }
                    ctx.stroke()
                    tex?.refresh()
                }
            }
            this.heatLines = []
            const lines = 10
            for (let i = 0; i < lines; i++) {
                const y = h * 0.40 + (h * 0.55) * (i / (lines - 1))
                const amp = 2 + 1.6 * (i / lines)
                const line = this.add.tileSprite(0, y, w, 12, 'fx-heat').setOrigin(0, 0.5).setDepth(-6)
                line.setScale(1, amp / HEAT_TEX_AMP)
                this.heatLines.push(line)
            }
        }
    }

    /** Un grain d'ambiance (flocon / sable) : petite Image ronde teintée. */
    private addWeatherGrain(depth: number, w: number, h: number, vy: number, vx: number, r: number, alpha: number, color: number) {
        if (!this.textures.exists('fx-dot')) {
            const tex = this.textures.createCanvas('fx-dot', 8, 8)
            const ctx = tex?.getContext()
            if (ctx) {
                ctx.fillStyle = '#ffffff'
                ctx.beginPath()
                ctx.arc(4, 4, 4, 0, Math.PI * 2)
                ctx.fill()
                tex?.refresh()
            }
        }
        const x = Math.random() * w, y = Math.random() * h
        const img = this.add.image(x, y, 'fx-dot').setDepth(depth).setAlpha(alpha).setTint(color).setScale(r / 4)
        this.snowflakes.push({ img, x, y, vy, vx })
    }

    /** Anime les flocons (biome snow) — appelé chaque frame par update(). */
    private updateWeather(delta: number) {
        if (this.snowflakes.length === 0) return
        const w = GRID_WIDTH * CELL_SIZE, h = GRID_HEIGHT * CELL_SIZE
        const dt = Math.min(delta, 50) / 1000 // borné (onglet en arrière-plan)
        for (const f of this.snowflakes) {
            f.y += f.vy * dt
            f.x += f.vx * dt + Math.sin(f.y * 0.03) * 0.4
            if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w }
            if (f.x < -6) f.x = w + 6
            else if (f.x > w + 6) f.x = -6
            f.img.setPosition(f.x, f.y)
        }

        // Mirage / ondes de chaleur (desert) : chaque ligne fait défiler son onde
        // (même déphasage par ligne qu'avant) et respire en opacité.
        if (this.heatLines.length > 0) {
            this.heatPhase += Math.min(delta, 50) * 0.004
            const k = (Math.PI * 2) / HEAT_WAVELENGTH
            this.heatLines.forEach((line, i) => {
                line.tilePositionX = (this.heatPhase * 3 + i) / k
                line.setAlpha(0.05 + 0.06 * (0.5 + 0.5 * Math.sin(this.heatPhase * 1.6 + i * 0.7)))
            })
        }
    }

    private drawTerrain() {
        // 1+2) Terrain composé UNE fois sur un canvas (herbe partout + chemin de terre
        // incrusté) : plus fiable qu'un masque géométrique Phaser (qui laissait la terre
        // recouvrir toute l'herbe), et plus léger (une seule image au lieu de tileSprite+mask).
        this.buildBakedTerrain()

        // 3) Décor déterministe, façon TD (Kingdom Rush & co.) : GROS décor thème
        //    guerre/ruines regroupé sur le CADRE (bords + rangée du haut sacrifiée),
        //    loin des châteaux ; PETIT décor (ossements, cailloux, herbe) semé partout
        //    — y compris sur le chemin — car il passe SOUS les unités (depth), donc
        //    ne gêne pas la lecture.
        let seed = 1337
        const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
        const nearCastle = (x: number, y: number) =>
            Math.max(Math.abs(x - this.pathStart.x), Math.abs(y - this.pathStart.y)) <= 1 ||
            Math.max(Math.abs(x - this.pathEnd.x), Math.abs(y - this.pathEnd.y)) <= 1

        // Thème neige (Fourche) : décor dédié semé dans les ZONES MORTES. Sort tôt —
        // le décor terres désolées ci-dessous ne s'applique qu'aux autres cartes.
        if (['spring', 'autumn'].includes(this.activeMapId)) {
            this.addVignette()
            return
        }
        if (this.mapDef.biome === 'snow') {
            this.drawSnowDecor(rnd, nearCastle)
            this.bakeDecorShadows()
            this.addVignette()
            return
        }

        const frame: { x: number; y: number }[] = []   // cadre → gros décor
        const small: { x: number; y: number }[] = []   // partout → petit décor
        for (let x = 0; x < GRID_WIDTH; x++)
            for (let y = 0; y < GRID_HEIGHT; y++) {
                const edge = x === 0 || x === GRID_WIDTH - 1 || y === 0 || y === GRID_HEIGHT - 1
                if (edge && !mapIsCorridor(this.mapDef, x, y) && !nearCastle(x, y)) frame.push({ x, y })
                else if (!nearCastle(x, y)) small.push({ x, y })
            }

        // Sprite ancré en bas de case (déborde vers le haut) + ombre portée douce.
        // byHeight : cale la hauteur (éléments verticaux) ; sinon la largeur (éléments plats).
        const placeDecor = (key: string, cx: number, cy: number, span: number, shadowW: number, byHeight = false) => {
            this.decorShadow(cx, cy, shadowW, 0x000000, 0.22)
            const img = this.add.image(cx, cy, key).setOrigin(0.5, 0.92).setDepth(-15)
            img.setScale((CELL_SIZE * span) / (byHeight ? img.height : img.width))
        }

        // 3a) GROS décor SOBRE (pas de surcharge) : ruines + rochers sur ~40 % du cadre.
        const shuffle = (arr: { x: number; y: number }[]) => arr.sort(() => rnd() - 0.5)
        shuffle(frame)
        const nFrame = Math.floor(frame.length * 0.40)
        for (let n = 0; n < nFrame; n++) {
            const c = frame[n]
            const cx = c.x * CELL_SIZE + CELL_SIZE / 2 + (rnd() - 0.5) * 6
            const cy = c.y * CELL_SIZE + CELL_SIZE + 2
            // ruinT gardés : 1=colonne, 5/6=bannières (sans tombes, feux, ni barrière).
            const ruinTok = [1, 5, 6]
            const r = rnd()
            if (r < 0.4) placeDecor(`decor-ruinT-${ruinTok[Math.floor(rnd() * ruinTok.length)]}`, cx, cy, 1.15 + rnd() * 0.25, CELL_SIZE * 0.4, true) // colonne/bannière/palissade
            else if (r < 0.72) placeDecor(`decor-ruinF-${1 + Math.floor(rnd() * 4)}`, cx, cy, 0.95 + rnd() * 0.2, CELL_SIZE * 0.5)   // ossements/rocher/tronc/souche
            else placeDecor(`decor-rock-${1 + Math.floor(rnd() * 4)}`, cx, cy, 0.7 + rnd() * 0.3, CELL_SIZE * 0.45)                   // rochers
        }

        // 3b) PETIT décor minéral (cailloux, tas de terre) semé sobrement, cases + chemin.
        shuffle(small)
        for (let n = 0; n < 16 && n < small.length; n++) {
            const c = small[n]
            const cx = c.x * CELL_SIZE + CELL_SIZE / 2 + (rnd() - 0.5) * 12
            const cy = c.y * CELL_SIZE + CELL_SIZE * 0.85 + (rnd() - 0.5) * 8
            placeDecor(`decor-small-${1 + Math.floor(rnd() * 3)}`, cx, cy, 0.34 + rnd() * 0.18, CELL_SIZE * 0.24)
        }

        // 3c) ZONES MORTES intérieures (ni chemin ni constructible) : un peu de gros
        // décor (rochers + ruines) pour ne pas laisser de grands vides au milieu.
        // Sobre (max ~14) et sous les unités (depth) → n'entrave pas le jeu.
        const dead: { x: number; y: number }[] = []
        for (let x = 1; x < GRID_WIDTH - 1; x++)
            for (let y = 1; y < GRID_HEIGHT - 1; y++)
                if (!mapIsCorridor(this.mapDef, x, y) && !mapIsBuildable(this.mapDef, x, y) && !nearCastle(x, y))
                    dead.push({ x, y })
        shuffle(dead)
        const nDead = Math.min(14, Math.floor(dead.length * 0.5))
        for (let n = 0; n < nDead; n++) {
            const c = dead[n]
            const cx = c.x * CELL_SIZE + CELL_SIZE / 2 + (rnd() - 0.5) * 8
            const cy = c.y * CELL_SIZE + CELL_SIZE + 2
            if (rnd() < 0.5) placeDecor(`decor-rock-${1 + Math.floor(rnd() * 4)}`, cx, cy, 0.7 + rnd() * 0.35, CELL_SIZE * 0.45)
            else placeDecor(`decor-ruinF-${1 + Math.floor(rnd() * 4)}`, cx, cy, 0.85 + rnd() * 0.25, CELL_SIZE * 0.5)
        }

        this.bakeDecorShadows()
        // 4) Vignette d'ambiance : bords assombris (au-dessus du terrain, sous le jeu).
        this.addVignette()
    }

    /**
     * Décor du thème NEIGE (Fourche) : REMPLIT toutes les cases des zones mortes
     * (ni route, ni case constructible). Chaque case reçoit un SAPIN quand il a la
     * place de déborder vers le haut sans recouvrir route/tour VISIBLE (un débordement
     * hors écran — au-dessus du plateau — est permis, d'où des sapins sur les bords
     * dont on ne voit pas la cime), sinon un BUISSON bas (monticule/rocher/caillou).
     */
    private drawSnowDecor(rnd: () => number, nearCastle: (x: number, y: number) => boolean) {
        const inGrid = (x: number, y: number) => x >= 0 && x < GRID_WIDTH && y >= 0 && y < GRID_HEIGHT
        const isDead = (x: number, y: number) =>
            y >= TOP_RESERVED_ROWS && inGrid(x, y) &&
            !mapIsCorridor(this.mapDef, x, y) && !mapIsBuildable(this.mapDef, x, y)
        // Une case "bloque" un sapin seulement si c'est la ROUTE (couloir) et qu'elle
        // est visible : le décor est rendu DERRIÈRE les tours, donc déborder sur une case
        // constructible ne gêne rien — seul recouvrir le chemin des unités est interdit.
        // Hors grille (au-dessus du plateau) = hors écran = OK.
        const blocks = (x: number, y: number) =>
            inGrid(x, y) && y >= TOP_RESERVED_ROWS && mapIsCorridor(this.mapDef, x, y)
        // Sapin permis si son débordement ne couvre pas la ROUTE. Le sprite ne monte
        // que d'~1 case au-dessus de son ancrage → il suffit que la case juste au-dessus
        // (et les côtés) ne soient pas la route ; atteindre une case constructible est
        // sans effet (le décor passe derrière les tours). D'où des sapins jusque dans la
        // première ligne des zones mortes.
        const firSafe = (x: number, y: number) =>
            !blocks(x, y - 1) && !blocks(x - 1, y) && !blocks(x + 1, y)

        const place = (key: string, cx: number, cy: number, span: number, shadowW: number, byHeight = false) => {
            this.decorShadow(cx, cy, shadowW, 0x14202a, 0.20)
            const img = this.add.image(cx, cy, key).setOrigin(0.5, 0.94).setDepth(-15)
            img.setScale((CELL_SIZE * span) / (byHeight ? img.height : img.width))
        }

        const firKeys = ['snow-fir-1', 'snow-fir-2', 'snow-fir-3']
        const bushKeys = ['snow-mound-1', 'snow-mound-2', 'snow-rock-1', 'snow-pebbles']
        // Quelques accents (lanterne, statue) disséminés parmi les sapins.
        const specials = [{ k: 'snow-lantern', n: 2 }, { k: 'snow-statue', n: 2 }]

        for (let x = 0; x < GRID_WIDTH; x++)
            for (let y = TOP_RESERVED_ROWS; y < GRID_HEIGHT; y++) {
                if (!isDead(x, y) || nearCastle(x, y)) continue
                const cx = x * CELL_SIZE + CELL_SIZE / 2
                const cyBase = y * CELL_SIZE + CELL_SIZE + 2
                if (firSafe(x, y)) {
                    // Sapin par défaut ; parfois un accent (lanterne/statue) tant qu'il reste du budget.
                    const sp = specials.find((s) => s.n > 0 && rnd() < 0.05)
                    if (sp) {
                        sp.n--
                        place(sp.k, cx + (rnd() - 0.5) * 4, cyBase, 1.15 + rnd() * 0.2, CELL_SIZE * 0.45, true)
                    } else {
                        place(firKeys[Math.floor(rnd() * firKeys.length)], cx + (rnd() - 0.5) * 6, cyBase, 1.5 + rnd() * 0.55, CELL_SIZE * 0.45, true)
                    }
                } else {
                    // Un sapin déborderait sur route/tour ici → buisson bas à la place.
                    place(bushKeys[Math.floor(rnd() * bushKeys.length)], cx + (rnd() - 0.5) * 8, y * CELL_SIZE + CELL_SIZE * 0.92, 0.5 + rnd() * 0.28, CELL_SIZE * 0.32)
                }
            }

        // Lanterne repère près du château ennemi (à l'entrée, à gauche).
        const es = this.mapDef.waypoints[0]
        place('snow-lantern', (es.x + 2.5) * CELL_SIZE, (es.y + 3) * CELL_SIZE, 1.25, CELL_SIZE * 0.45, true)

        // LIGNE LIBRE DU HAUT (rangée tampon, y=0) : lisière de sapins dont la cime
        // sort de l'écran (base ancrée au bas de la rangée tampon → seul le pied est
        // visible en haut). Remplit la bande vide tout en haut du plateau.
        for (let x = 0; x < GRID_WIDTH; x++) {
            const cx = x * CELL_SIZE + CELL_SIZE / 2 + (rnd() - 0.5) * 6
            place(firKeys[Math.floor(rnd() * firKeys.length)], cx, TOP_RESERVED_ROWS * CELL_SIZE, 1.6 + rnd() * 0.5, CELL_SIZE * 0.4, true)
        }
    }

    /** Terrain "cuit" sur un canvas : herbe tuilée partout + chemin de terre serpentin
     *  incrusté (bordure sombre + terre tuilée clippée à la forme). Une seule image
     *  (depth -20), pas de masque Phaser. */
    private buildBakedTerrain() {
        // Map pré-composée (terre désolée + piste sableuse naturelle) : une seule image
        // mise à l'échelle du plateau. Rendu identique garanti, aucun masque runtime.
        const w = GRID_WIDTH * CELL_SIZE, h = GRID_HEIGHT * CELL_SIZE
        if (['spring', 'autumn'].includes(this.activeMapId)) {
            const key = `season-ground-${this.activeMapId}`
            {
                const tex = this.textures.get(key) instanceof Phaser.Textures.CanvasTexture
                    ? this.textures.get(key) as Phaser.Textures.CanvasTexture
                    : this.textures.createCanvas(key, w, h)
                const ctx = tex?.getContext()
                if (ctx && tex) {
                    const plants = this.textures.exists('season-plants') ? this.textures.get('season-plants').getSourceImage() as HTMLImageElement : undefined
                    const road = this.textures.exists('season-road') ? this.textures.get('season-road').getSourceImage() as HTMLImageElement : undefined
                    let plantIndex = 0
                    ctx.clearRect(0, 0, w, h)
                    paintSeasonalTerrain(ctx, this.mapDef, plants, road, (atlas, sprite, x, y, pw, ph) => {
                        const plantKey = `${key}-plant-${plantIndex++}`
                        if (!this.textures.exists(plantKey)) {
                            const plant = this.textures.createCanvas(plantKey, pw, ph)
                            if (plant) {
                                const pc = plant.getContext()
                                pc.imageSmoothingEnabled = false
                                pc.drawImage(atlas, sprite.sx, sprite.sy, sprite.w, sprite.h, 0, 0, pw, ph)
                                plant.refresh()
                            }
                        }
                        this.add.image(x, y, plantKey).setOrigin(0.5, 1).setDepth(unitDepth(y / CELL_SIZE))
                    }); tex.refresh()
                }
            }
            this.add.image(0, 0, key).setOrigin(0, 0).setDepth(-20)
            this.addRoadTrees()
            return
        }
        this.add.image(0, 0, `map-${this.mapDef.id}`).setOrigin(0, 0).setDepth(-20).setDisplaySize(w, h)
        // Cartes multi-voies : le sol est uni (pas de route peinte) → on trace la
        // route au runtime, exactement sur les cases des voies (union du couloir),
        // pour qu'elle colle au déplacement réel des ennemis (calculé serveur).
        if (this.mapDef.proceduralRoad) this.drawProceduralRoad()
    }

    /**
     * Arbres debout, en sprites triés en profondeur comme les unités (un ennemi passe
     * devant ou derrière le tronc) : bords de route en automne, coins de l'île du
     * château au printemps. Feuillage recoloré une fois, une texture par teinte.
     */
    private addRoadTrees() {
        const spots = [...roadTreeSpots(this.mapDef), ...castleTreeSpots(this.mapDef)]
        if (spots.length === 0 || !this.textures.exists('season-plants')) return
        const plants = this.textures.get('season-plants').getSourceImage() as HTMLImageElement
        const withFrames = (key: string) => {
            const tex = this.textures.get(key)
            TREES.forEach((t, i) => { if (!tex.has(`tree${i}`)) tex.add(`tree${i}`, 0, t.sx, t.sy, t.w, t.h) })
            return key
        }
        const keys = (FOLIAGE_TINTS[this.activeMapId] ?? []).map((tint, i) => {
            const key = `season-foliage-${this.activeMapId}-${i}`
            if (!this.textures.exists(key)) {
                // Atlas illisible (autre origine) : arbres d'origine plutôt que rien.
                try { this.textures.addCanvas(key, recolorFoliage(plants, tint)) } catch { return withFrames('season-plants') }
            }
            return withFrames(key)
        })
        const shadows = this.make.graphics({}, false)
        for (const s of spots) {
            const t = TREES[s.tree]
            shadows.fillStyle(0x1c140c, 0.3)
            shadows.fillEllipse(s.x, s.y - 2, t.w * s.scale * 0.8, t.w * s.scale * 0.3)
            this.add.image(s.x, s.y, keys[s.hue], `tree${s.tree}`).setOrigin(0.5, 1).setFlipX(s.flip)
                .setScale(s.scale).setDepth(unitDepth(s.y / CELL_SIZE))
        }
        this.bakeStatic(shadows, 'road-tree-shadows', -16)
    }

    private drawProceduralRoad() {
        const cc = CELL_SIZE
        const g = this.add.graphics().setDepth(-18)
        let seed = 4242
        const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
        const ctr = (p: { x: number; y: number }) => ({ x: (p.x + 0.5) * cc, y: (p.y + 0.5) * cc })

        // Vraie route : chaque TRONÇON droit = un rectangle épais (bords droits sur les
        // lignes), et un DISQUE à chaque virage = coin arrondi (aucun angle droit). Les
        // tronçons partagés entre voies se recouvrent (même couleur) sans jointure visible.
        const band = (color: number, width: number) => {
            g.fillStyle(color, 1)
            for (const lane of this.mapDef.lanes) {
                for (let i = 0; i < lane.length - 1; i++) {
                    const a = ctr(lane[i]), b = ctr(lane[i + 1])
                    const x0 = Math.min(a.x, b.x) - width / 2, x1 = Math.max(a.x, b.x) + width / 2
                    const y0 = Math.min(a.y, b.y) - width / 2, y1 = Math.max(a.y, b.y) + width / 2
                    g.fillRect(x0, y0, x1 - x0, y1 - y0)
                }
                for (const w of lane) { const c = ctr(w); g.fillCircle(c.x, c.y, width / 2) }
            }
            // Aires de croisement : un disque qui élargit la route à ces endroits.
            for (const wc of this.mapDef.wideSpots) { const c = ctr(wc); g.fillCircle(c.x, c.y, width * 0.62) }
        }
        band(0x7a5c39, cc * 1.08)   // épaule (terre tassée)
        band(0x93744c, cc * 0.72)   // voie de circulation, plus claire

        // Cailloux / petits éléments semés SUR la route (réalisme, pas lisse) — sous
        // les unités (depth -17). Déterministe.
        const pebbles = ['decor-small-1', 'decor-small-2', 'decor-small-3', 'snow-pebbles']
        for (const c of this.mapDef.path.corridorCells) {
            if (rnd() > 0.2) continue
            const key = pebbles[Math.floor(rnd() * pebbles.length)]
            const px = (c.x + 0.5) * cc + (rnd() - 0.5) * cc * 0.5
            const py = (c.y + 0.55) * cc + (rnd() - 0.5) * cc * 0.4
            this.add.image(px, py, key).setOrigin(0.5, 0.85).setDepth(-17)
                .setDisplaySize(cc * (0.22 + rnd() * 0.12), cc * (0.17 + rnd() * 0.1))
        }
    }

    /** Vignette : assombrit les bords du champ pour l'ambiance (texture canvas radiale,
     *  générée une seule fois). Depth -10 : au-dessus du décor, sous les tours/ennemis. */
    private addVignette() {
        const w = GRID_WIDTH * CELL_SIZE, h = GRID_HEIGHT * CELL_SIZE
        if (!this.textures.exists('vignette')) {
            const tex = this.textures.createCanvas('vignette', w, h)
            const ctx = tex?.getContext()
            if (ctx) {
                const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.62)
                g.addColorStop(0, 'rgba(0,0,0,0)')
                g.addColorStop(1, 'rgba(10,6,2,0.5)')
                ctx.fillStyle = g
                ctx.fillRect(0, 0, w, h)
                tex?.refresh()
            }
        }
        this.add.image(0, 0, 'vignette').setOrigin(0, 0).setDepth(-10)
    }

    // ── Dessin de la grille ──────────────────────────────────────────────

    /**
     * Fige un calque Graphics STATIQUE en texture, affichée comme une simple Image.
     * En WebGL, Phaser re-tessellise un Graphics à CHAQUE image, même inchangé :
     * le quadrillage des parcelles (~200 rectangles arrondis, 12 000 commandes)
     * coûtait à lui seul ~78 % du temps d'une image au banc de charge. Une Image
     * ne coûte qu'un quad.
     */
    private bakeStatic(g: Phaser.GameObjects.Graphics, key: string, depth: number) {
        if (this.textures.exists(key)) this.textures.remove(key)
        g.generateTexture(key, GRID_WIDTH * CELL_SIZE, GRID_HEIGHT * CELL_SIZE)
        g.destroy()
        return this.add.image(0, 0, key).setOrigin(0, 0).setDepth(depth)
    }

    /** Ombre portée d'un élément de décor, sur le calque commun (figé ensuite). */
    private decorShadow(cx: number, cy: number, width: number, color: number, alpha: number) {
        this.decorShadows ??= this.make.graphics({}, false)
        this.decorShadows.fillStyle(color, alpha)
        this.decorShadows.fillEllipse(cx, cy, width, width * 0.4)
    }

    /** Fige les ombres du décor (sous les éléments de décor, depth -15). */
    private bakeDecorShadows() {
        if (!this.decorShadows) return
        this.bakeStatic(this.decorShadows, 'decor-shadows', -16)
        this.decorShadows = undefined
    }

    private drawGrid() {
        // On ne quadrille PLUS tout : on marque seulement les cases
        // CONSTRUCTIBLES (hors couloir) d'un liseré clair façon "parcelle" — ça
        // montre où poser des tours et c'est plus joli qu'une grille pleine. Le
        // couloir (route) reste net. Dessiné une fois puis figé (voir bakeStatic).
        const plots = this.make.graphics({}, false)
        for (let x = 0; x < GRID_WIDTH; x++) {
            for (let y = 0; y < GRID_HEIGHT; y++) {
                // Parcelle affichée UNIQUEMENT sur les cases constructibles (bande au
                // bord des routes). Les zones mortes (loin des routes) restent nues —
                // elles accueilleront le décor. Rangée du haut = tampon réservé.
                if (!mapIsBuildable(this.mapDef, x, y) || y < TOP_RESERVED_ROWS) continue
                const px = x * CELL_SIZE
                const py = y * CELL_SIZE
                plots.fillStyle(0xffffff, 0.06)
                plots.fillRoundedRect(px + 3, py + 3, CELL_SIZE - 6, CELL_SIZE - 6, 4)
                plots.lineStyle(1, 0xf0e2c4, 0.20)
                // +0.5 : le trait de 1 px tombe pile sur la grille de pixels du canvas
                // 2D (sinon il s'étale sur 2 pixels à demi-opacité et pâlit).
                plots.strokeRoundedRect(px + 3.5, py + 3.5, CELL_SIZE - 7, CELL_SIZE - 7, 4)
            }
        }
        // Juste sous les calques de jeu (depth 0), au-dessus du terrain et de la vignette.
        this.bakeStatic(plots, 'build-plots', -1)
    }

    private drawPath() {
        // Textures natives réutilisables : même silhouette lisible, matériaux par saison.
        const keyFor = (enemy: boolean) => {
            const key = `fort-${this.activeMapId}-${enemy ? 'enemy' : 'player'}`
            if (!this.textures.exists(key)) {
                const frames = enemy ? PORTAL_FRAMES : 1
                const columns = enemy ? 8 : 1
                const tex = this.textures.createCanvas(key, FORT_WIDTH * columns, FORT_HEIGHT * Math.ceil(frames / columns))
                if (tex) {
                    const ctx = tex.getContext()
                    for (let frame = 0; frame < frames; frame++) {
                        const fx = (frame % columns) * FORT_WIDTH, fy = Math.floor(frame / columns) * FORT_HEIGHT
                        ctx.save(); ctx.translate(fx, fy)
                        paintCastle(ctx, this.activeMapId, enemy, frame / frames)
                        ctx.restore()
                        if (enemy) tex.add(frame, 0, fx, fy, FORT_WIDTH, FORT_HEIGHT)
                    }
                    tex.refresh()
                }
            }
            if (enemy && !this.anims.exists(key)) {
                this.anims.create({ key, frames: this.anims.generateFrameNumbers(key, { start: 0, end: PORTAL_FRAMES - 1 }), frameRate: 16, repeat: -1 })
            }
            return key
        }
        const uniqueStarts = mapLaneStarts(this.mapDef).filter(
            (s, i, arr) => arr.findIndex(o => o.x === s.x && o.y === s.y) === i,
        )
        for (const start of uniqueStarts) {
            const key = keyFor(true)
            this.add.sprite(Math.min(756, Math.max(44, start.x * CELL_SIZE + 20)), start.y * CELL_SIZE + 37, key, 0)
                .setOrigin(0.5, 1).setDisplaySize(88, 108).setDepth(unitDepth(start.y + 0.9)).play(key)
        }
        const end = mapCastle(this.mapDef)
        const castleWidth = this.activeMapId === 'fourche' ? 104 : 120
        const castleHeight = this.activeMapId === 'fourche' ? 127 : 147
        const halfCastle = castleWidth / 2
        this.add.image(Phaser.Math.Clamp(end.x * CELL_SIZE + 20, halfCastle, GRID_WIDTH * CELL_SIZE - halfCastle), end.y * CELL_SIZE + 37, keyFor(false))
            .setOrigin(0.5, 1).setDisplaySize(castleWidth, castleHeight).setDepth(unitDepth(end.y + 0.9))
        if (this.activeMapId === 'autumn') {
            // Brume d'ambiance seulement : discrète, sans effet de portée.
            const mistKey = 'castle-autumn-mist'
            if (!this.textures.exists(mistKey)) {
                const texture = this.textures.createCanvas(mistKey, 96, 24)
                if (texture) {
                    const ctx = texture.getContext()
                    for (let layer = 0; layer < 4; layer++) {
                        ctx.fillStyle = `rgba(211, 207, 225, ${0.025 + layer * 0.012})`
                        ctx.beginPath()
                        ctx.ellipse(48, 13, 46 - layer * 7, 10 - layer * 2, 0, 0, Math.PI * 2)
                        ctx.fill()
                    }
                    texture.refresh()
                }
            }
            for (let i = 0; i < 3; i++) {
                const mist = this.add.image(709 + i * 24, end.y * CELL_SIZE + 23 + i * 9, mistKey)
                    .setScale(0.65 + i * 0.12).setAlpha(0.6).setDepth(unitDepth(end.y + 1.1))
                this.tweens.add({ targets: mist, x: mist.x - 10, alpha: 0.95, duration: 4200 + i * 1300,
                    delay: i * 600, ease: 'Sine.easeInOut', yoyo: true, repeat: -1 })
            }
        }
    }
}
