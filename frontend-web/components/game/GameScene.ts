import Phaser from 'phaser'
import type { Cell } from './constants'
import { TOP_RESERVED_ROWS } from './constants'
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

// Portée de chaque tour (cases), reprise de TowerType.baseRange côté backend :
// sert au cercle de portée de l'aperçu de pose (voir setBuildPreview). 0 = mur.
const TOWER_RANGE: Record<string, number> = {
    ARCHER: 3.0, MAGE: 2.5, CATAPULT: 4.0, BALLISTA: 5.0, WALL: 0,
}

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
    private gridGraphics!: Phaser.GameObjects.Graphics
    private towersGraphics!: Phaser.GameObjects.Graphics
    private enemiesGraphics!: Phaser.GameObjects.Graphics
    // Calque dédié aux effets de combat (rayon continu, cercle de zone, tir
    // mono-cible) — séparé de enemiesGraphics pour pouvoir le vider/redessiner
    // indépendamment à chaque tick sans repasser par drawEnemies.
    private effectsGraphics!: Phaser.GameObjects.Graphics
    // Aperçu de pose (multi) : surbrillance verte/rouge de la case survolée + cercle
    // de portée de la tour sélectionnée. Actif seulement si buildPreviewType est posé
    // (via setBuildPreview) — le solo ne l'utilise pas, donc rien ne change côté solo.
    private previewGraphics!: Phaser.GameObjects.Graphics
    private buildPreviewType: string | null = null
    private hoverCell: { x: number; y: number } | null = null

    // Map active (tracé + biome). Fixée par le canvas AVANT le boot de la scène
    // (setActiveMap) ; create() rend alors le bon terrain/décor. Défaut = désert.
    private activeMapId: string = DEFAULT_MAP_ID
    setActiveMap(id: string) { this.activeMapId = id }
    private get mapDef() { return getMapDef(this.activeMapId) }
    private get pathStart(): Cell { return this.mapDef.waypoints[0] }
    private get pathEnd(): Cell { return this.mapDef.waypoints[this.mapDef.waypoints.length - 1] }
    private onCellClick?: (x: number, y: number) => void
    // Effet d'ambiance neige (biome snow) : flocons mis à jour chaque frame.
    private snowGfx?: Phaser.GameObjects.Graphics
    private snowflakes: { x: number; y: number; vy: number; vx: number; r: number; a: number; c: number }[] = []
    private waveTimer?: Phaser.Time.TimerEvent
    // Fonction de rendu du tick courant, conservée pour reprendre après une pause
    // de tuto (voir playWave / resumeWave).
    private waveRender?: () => void
    // Évite de rejouer la volée d'explosions du château plusieurs fois (une seule
    // chute par vague).
    private castleFell = false
    // Indexées par id pour retrouver rapidement la tour à l'origine d'un
    // DamageEvent pendant playWave (position + profil de dégâts). Contient des
    // COPIES des données React (voir drawTowers) : les PV y sont décrémentés en
    // direct pendant l'animation (voir renderTick) sans toucher au store.
    private towersById = new Map<string, TowerData>()
    // Lettres des tours : GameObjects indépendants de towersGraphics, à détruire
    // explicitement à chaque redraw (voir drawTowers) sous peine de fuite.
    private towerTexts: Phaser.GameObjects.Text[] = []
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
        for (const m of GAME_MAPS) this.load.image(`map-${m.id}`, m.image)
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
        // Châteaux : le tien (arrivée, à défendre) + celui de l'ennemi (spawn, décoratif).
        this.load.image('castle', '/sprites/castle/castle.png')
        this.load.image('castle-enemy', '/sprites/castle/castle_enemy.png')
    }

    create() {
        this.drawTerrain()
        this.initWeather()

        this.gridGraphics = this.add.graphics()
        this.previewGraphics = this.add.graphics() // sous les tours/ennemis (aperçu de pose)
        this.towersGraphics = this.add.graphics()
        this.enemiesGraphics = this.add.graphics()
        this.effectsGraphics = this.add.graphics()

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

        // Aperçu de pose : suit le curseur (multi uniquement, voir setBuildPreview).
        this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
            if (!this.buildPreviewType) return
            this.hoverCell = { x: Math.floor(pointer.x / CELL_SIZE), y: Math.floor(pointer.y / CELL_SIZE) }
            this.drawBuildPreview()
        })
        this.input.on('pointerout', () => {
            this.hoverCell = null
            this.previewGraphics?.clear()
        })

        // Coop : signale que la scène est prête (textures chargées, calques créés)
        // pour que le canvas commence à pousser les snapshots serveur.
        this.onCoopReady?.()
    }

    update(_time: number, delta: number) {
        // Effet d'ambiance (neige qui tombe) — avant tout return, sinon coupé en solo.
        this.updateWeather(delta)

        // Solo : la boucle de combat est rejouée via playWave(), pas ici.
        // Coop : on interpole les ennemis entre les deux derniers snapshots
        // serveur (15 Hz) pour un mouvement fluide à 60 fps.
        if (!this.coopActive || !this.coopCurr) return
        const curr = this.coopCurr, prev = this.coopPrev
        const alpha = prev ? Math.min(1, (performance.now() - curr.t) / GameScene.COOP_TICK_MS) : 1
        const prevById = new Map((prev?.enemies ?? []).map((e) => [e.id, e]))
        const interp = curr.enemies.map((e) => {
            const p = prevById.get(e.id)
            return p ? { ...e, x: p.x + (e.x - p.x) * alpha, y: p.y + (e.y - p.y) * alpha } : e
        })
        this.drawEnemies(interp, this.coopDeaths, new Set(), this.coopReached)
    }

    shutdown() {
        this.waveTimer?.remove()
        this.clearEnemySprites()
        for (const sprite of this.towerSprites.values()) sprite.destroy()
        this.towerSprites.clear()
    }

    // ── API publique appelée depuis React ────────────────────────────────

    setOnCellClick(callback: (x: number, y: number) => void) {
        this.onCellClick = callback
    }

    /**
     * Aperçu de pose (multi) : type de tour sélectionné → cercle de portée + case
     * verte/rouge au survol. null = désactive (ex. hors partie). Le solo n'appelle
     * jamais cette méthode, son rendu est donc inchangé.
     */
    setBuildPreview(type: string | null) {
        this.buildPreviewType = type
        if (!this.previewGraphics) return
        if (!type) { this.hoverCell = null; this.previewGraphics.clear(); return }
        this.drawBuildPreview()
    }

    /** Dessine la case survolée (verte si posable, rouge sinon) + le cercle de portée. */
    private drawBuildPreview() {
        if (!this.previewGraphics) return
        this.previewGraphics.clear()
        const type = this.buildPreviewType
        const cell = this.hoverCell
        if (!type || !cell) return

        const inGrid = cell.x >= 0 && cell.x < GRID_WIDTH && cell.y >= 0 && cell.y < GRID_HEIGHT
        if (!inGrid) return
        const corridor = mapIsCorridor(this.mapDef, cell.x, cell.y)
        const buildable = mapIsBuildable(this.mapDef, cell.x, cell.y)
        const occupied = [...this.towersById.values()].some((t) => t.x === cell.x && t.y === cell.y)
        // Mur : sur le couloir ; tours : bande constructible (bord des routes) — pas
        // les zones mortes. Case libre + hors rangée réservée.
        const ok = !occupied && cell.y >= TOP_RESERVED_ROWS && (type === 'WALL' ? corridor : buildable)

        const px = cell.x * CELL_SIZE, py = cell.y * CELL_SIZE
        const color = ok ? 0x5bbd3a : 0xd64545
        this.previewGraphics.fillStyle(color, 0.3)
        this.previewGraphics.fillRect(px, py, CELL_SIZE, CELL_SIZE)
        this.previewGraphics.lineStyle(2, color, 0.9)
        this.previewGraphics.strokeRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2)

        // Cercle de portée (tours à tir uniquement).
        const range = TOWER_RANGE[type] ?? 0
        if (range > 0) {
            const cx = px + CELL_SIZE / 2, cy = py + CELL_SIZE / 2
            this.previewGraphics.fillStyle(0xffe066, 0.06)
            this.previewGraphics.fillCircle(cx, cy, range * CELL_SIZE)
            this.previewGraphics.lineStyle(2, 0xffe066, 0.6)
            this.previewGraphics.strokeCircle(cx, cy, range * CELL_SIZE)
        }
    }

    // ── API coop (rendu du flux serveur) ─────────────────────────────────

    setOnCoopReady(callback: () => void) {
        this.onCoopReady = callback
        // La scène est peut-être déjà créée (callback branché tardivement) : dans
        // ce cas on l'appelle tout de suite.
        if (this.enemiesGraphics) callback()
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
    ) {
        // Tours : réutilise le rendu solo (sprites, base+arme, PV…).
        this.drawTowers(towers.map((t) => ({
            id: t.id, type: t.type as TowerData['type'], x: t.x, y: t.y, level: t.level,
        })))

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

        // Les textes Phaser sont des GameObjects indépendants du Graphics : sans
        // destruction explicite, chaque redraw empilait de nouvelles lettres sur
        // les anciennes (leak), et une tour détruite laissait sa lettre fantôme
        // à l'écran.
        this.towerTexts.forEach((text) => text.destroy())
        this.towerTexts = []

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

            // Repère de palier : pastilles dorées (✦) au-dessus d'une tour améliorée
            // (niveau ≥ 2) pour distinguer d'un coup d'œil les tours évoluées. Texte
            // indépendant, poussé dans towerTexts → détruit/reconstruit à chaque redraw.
            const lvl = tower.level ?? 1
            if (lvl >= 2 && tower.type !== 'WALL') {
                const pips = this.add.text(px + CELL_SIZE / 2, py - 3, '✦'.repeat(lvl), {
                    fontFamily: 'monospace', fontSize: '11px', color: '#f2c94c',
                }).setOrigin(0.5, 1).setDepth(6)
                pips.setStroke('#3a2a10', 3)
                this.towerTexts.push(pips)
            }

            if (hasSprite) {
                const isWall = tower.type === 'WALL'
                const rot = ROT_WEAPON[tower.type]
                if (rot) {
                    // Tour à arme rotative : base statique + arme superposée qui
                    // pivote (voir aimWeapon / drawEffects). La base est stockée
                    // dans towerSprites, l'arme dans towerWeapons.
                    let base = this.towerSprites.get(tower.id)
                    if (!base) {
                        base = this.add.image(0, 0, `tower-${tower.type}-base`).setOrigin(0.5, 1)
                        base.setScale((CELL_SIZE * 1.25) / base.width)
                        this.towerSprites.set(tower.id, base)
                    }
                    base.setPosition(px + CELL_SIZE / 2, py + CELL_SIZE + 2)
                    let weapon = this.towerWeapons.get(tower.id)
                    if (!weapon) {
                        weapon = this.add.sprite(0, 0, `tower-${tower.type}-weapon`, 0).setOrigin(rot.pivotX, rot.pivotY)
                        weapon.setScale((CELL_SIZE * 1.25) / base.width)
                        weapon.setDepth(1) // au-dessus de la base
                        this.towerWeapons.set(tower.id, weapon)
                    }
                    const mountY = (py + CELL_SIZE + 2) - base.displayHeight * (1 - rot.mountFrac)
                    weapon.setPosition(px + CELL_SIZE / 2, mountY)
                    this.drawStructureHpBar(tower, px, py)
                    return
                }
                const isAnimated = TOWER_ANIM[tower.type] != null
                let sprite = this.towerSprites.get(tower.id)
                if (!sprite) {
                    // Tour à arme animée (Archer, Baliste, Mage, Catapulte) :
                    // Sprite au repos sur la frame 0 ; les autres (Mur) restent
                    // des Images statiques.
                    sprite = isAnimated
                        ? this.add.sprite(0, 0, `tower-${tower.type}-anim`, 0)
                        : this.add.image(0, 0, `tower-${tower.type}`)
                    if (isWall) {
                        // Mur : barricade CENTRÉE, orientée selon la direction du
                        // chemin à sa case pour que les pointes (vers le HAUT dans le
                        // sprite d'origine) fassent face au flux d'ennemis. Sur le
                        // serpentin les ennemis arrivent par la gauche (voie haute),
                        // la droite (voie médiane) ou le haut (descentes) — l'angle
                        // s'adapte donc au lieu d'être figé.
                        sprite.setOrigin(0.5, 0.5)
                        const { dx, dy } = mapPathDir(this.mapDef, tower.x, tower.y)
                        // Pointes = sens OPPOSÉ au déplacement (face aux assaillants).
                        const angle = dx > 0 ? -90 : dx < 0 ? 90 : dy < 0 ? 180 : 0
                        sprite.setAngle(angle)
                        sprite.setScale((CELL_SIZE * 1.3) / sprite.width)
                    } else {
                        // Tour : ancrée en bas-centre, base au bas de la case, la
                        // structure déborde vers le haut (comme les ennemis).
                        sprite.setOrigin(0.5, 1)
                        sprite.setScale((CELL_SIZE * 1.25) / sprite.width)
                    }
                    this.towerSprites.set(tower.id, sprite)
                }
                sprite.setPosition(
                    px + CELL_SIZE / 2,
                    isWall ? py + CELL_SIZE / 2 : py + CELL_SIZE + 2,
                )
                this.drawStructureHpBar(tower, px, py)
                return
            }

            // Repli géométrique (type sans sprite) : carré coloré.
            this.towersGraphics.fillStyle(TOWER_COLORS[tower.type] ?? 0xffffff, 1)
            this.towersGraphics.fillRect(px + 4, py + 4, CELL_SIZE - 8, CELL_SIZE - 8)
            this.drawStructureHpBar(tower, px, py)
        })
    }

    /**
     * Barre de vie de la structure (tour ou mur) — affichée uniquement si elle a
     * déjà subi des dégâts (Sapeur, rayon/pulse de Boss, mêlée contre un mur) ;
     * une structure intacte ou dont le backend n'envoie pas encore hp/maxHp ne
     * l'affiche pas, pour ne pas surcharger l'écran en l'absence de menace.
     */
    private drawStructureHpBar(tower: TowerData, px: number, py: number) {
        if (tower.hp == null || tower.maxHp == null || tower.hp >= tower.maxHp) return

        const hpRatio = tower.maxHp > 0 ? Math.max(0, tower.hp / tower.maxHp) : 0
        const barWidth = CELL_SIZE * 0.8
        const barX = px + CELL_SIZE / 2 - barWidth / 2
        const barY = py - 6

        this.towersGraphics.fillStyle(0x000000, 0.5)
        this.towersGraphics.fillRect(barX, barY, barWidth, 4)
        this.towersGraphics.fillStyle(hpRatio > 0.3 ? 0x22c55e : 0xef4444, 1)
        this.towersGraphics.fillRect(barX, barY, barWidth * hpRatio, 4)
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

        let index = 0

        const renderTick = () => {
            if (index >= ticks.length) {
                this.enemiesGraphics.clear()
                this.effectsGraphics.clear()
                this.clearEnemySprites()
                this.waveTimer?.remove()
                this.waveTimer = undefined
                this.waveRender = undefined
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
        } else {
            onComplete?.()
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
            }

            // Ennemis qui frappent une tour ce tick (siège du Sapeur, rayon d'un
            // Chariot/Boss, ou n'importe qui bloqué contre un mur) : jouent leur
            // anim d'attaque au lieu de marcher (voir drawEnemies).
            const attackingIds = new Set(tick.towerDamageEvents.map((e) => e.enemyId))
            const reachedIds = new Set(tick.reachedCastle ?? [])

            this.effectsGraphics.clear()
            this.drawEnemies(tick.enemies, tick.deaths, attackingIds, reachedIds)
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

        this.enemiesGraphics.fillStyle(0x000000, 0.5)
        this.enemiesGraphics.fillRect(barX, barY, barWidth, 4)
        this.enemiesGraphics.fillStyle(hpRatio > 0.3 ? 0x22c55e : 0xef4444, 1)
        this.enemiesGraphics.fillRect(barX, barY, barWidth * hpRatio, 4)
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
            const color = TOWER_COLORS[tower.type] ?? 0xffffff
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
            // Flocons : une couche au-dessus du jeu, redessinée chaque frame (updateWeather).
            this.snowGfx = this.add.graphics().setDepth(60)
            this.snowflakes = []
            for (let i = 0; i < 90; i++) {
                this.snowflakes.push({
                    x: Math.random() * w, y: Math.random() * h,
                    vy: 12 + Math.random() * 22, vx: -6 + Math.random() * 12,
                    r: 1 + Math.random() * 2.2, a: 0.35 + Math.random() * 0.5, c: 0xffffff,
                })
            }
        } else if (this.mapDef.biome === 'desert') {
            // Soleil TAPANT. 1) Halo chaud vif au coin haut-droit (soleil), alpha qui
            // respire. 2) Rayons de soleil (god rays) qui balaient et pulsent. Placés
            // au-dessus du sol mais sous les unités (depth < 0) → ambiance sans gêner.
            const sunX = w * 0.85, sunY = h * 0.05
            const key = 'sun-glare'
            if (!this.textures.exists(key)) {
                const tex = this.textures.createCanvas(key, w, h)
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
            this.snowGfx = this.add.graphics().setDepth(55)
            this.snowflakes = []
            for (let i = 0; i < 48; i++) {
                this.snowflakes.push({
                    x: Math.random() * w, y: Math.random() * h,
                    vy: 4 + Math.random() * 10, vx: 34 + Math.random() * 46,
                    r: 0.8 + Math.random() * 1.4, a: 0.18 + Math.random() * 0.28,
                    c: Math.random() < 0.5 ? 0xe4d3a6 : 0xd8c188,
                })
            }
        }
    }

    /** Anime les flocons (biome snow) — appelé chaque frame par update(). */
    private updateWeather(delta: number) {
        if (!this.snowGfx || this.snowflakes.length === 0) return
        const w = GRID_WIDTH * CELL_SIZE, h = GRID_HEIGHT * CELL_SIZE
        const dt = Math.min(delta, 50) / 1000 // borné (onglet en arrière-plan)
        const g = this.snowGfx
        g.clear()
        for (const f of this.snowflakes) {
            f.y += f.vy * dt
            f.x += f.vx * dt + Math.sin(f.y * 0.03) * 0.4
            if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w }
            if (f.x < -6) f.x = w + 6
            else if (f.x > w + 6) f.x = -6
            g.fillStyle(f.c, f.a)
            g.fillCircle(f.x, f.y, f.r)
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
        if (this.mapDef.biome === 'snow') {
            this.drawSnowDecor(rnd, nearCastle)
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
            const sh = this.add.graphics().setDepth(-16)
            sh.fillStyle(0x000000, 0.22)
            sh.fillEllipse(cx, cy, shadowW, shadowW * 0.4)
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
            const sh = this.add.graphics().setDepth(-16)
            sh.fillStyle(0x14202a, 0.20)
            sh.fillEllipse(cx, cy, shadowW, shadowW * 0.4)
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
        this.add.image(0, 0, `map-${this.mapDef.id}`).setOrigin(0, 0).setDepth(-20).setDisplaySize(w, h)
        // Cartes multi-voies : le sol est uni (pas de route peinte) → on trace la
        // route au runtime, exactement sur les cases des voies (union du couloir),
        // pour qu'elle colle au déplacement réel des ennemis (calculé serveur).
        if (this.mapDef.proceduralRoad) this.drawProceduralRoad()
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

    private drawGrid() {
        // On ne quadrille PLUS tout : on marque seulement les cases
        // CONSTRUCTIBLES (hors couloir) d'un liseré clair façon "parcelle" — ça
        // montre où poser des tours et c'est plus joli qu'une grille pleine. Le
        // couloir (route) reste net.
        for (let x = 0; x < GRID_WIDTH; x++) {
            for (let y = 0; y < GRID_HEIGHT; y++) {
                // Parcelle affichée UNIQUEMENT sur les cases constructibles (bande au
                // bord des routes). Les zones mortes (loin des routes) restent nues —
                // elles accueilleront le décor. Rangée du haut = tampon réservé.
                if (!mapIsBuildable(this.mapDef, x, y) || y < TOP_RESERVED_ROWS) continue
                const px = x * CELL_SIZE
                const py = y * CELL_SIZE
                this.gridGraphics.fillStyle(0xffffff, 0.06)
                this.gridGraphics.fillRoundedRect(px + 3, py + 3, CELL_SIZE - 6, CELL_SIZE - 6, 4)
                this.gridGraphics.lineStyle(1, 0xf0e2c4, 0.20)
                this.gridGraphics.strokeRoundedRect(px + 3, py + 3, CELL_SIZE - 6, CELL_SIZE - 6, 4)
            }
        }
    }

    private drawPath() {
        // Le couloir est matérialisé par les tuiles de terre (voir create). On
        // pose seulement les deux châteaux, à chaque extrémité du chemin serpentin :
        // celui de l'ennemi au spawn (PATH_START, décoratif) et le tien à l'arrivée
        // (PATH_END, celui qu'on défend). Forteresses compactes (~2,4 cases de
        // large), ancrées en bas de leur case, débordant vers le haut.
        const castleW = CELL_SIZE * 2.4

        // Un château ennemi par ENTRÉE UNIQUE : plusieurs voies peuvent partager le
        // même départ (une route qui fourche) → un seul château ; deux entrées
        // distinctes → deux châteaux. Clair, orienté vers la droite = vers le champ.
        const uniqueStarts = mapLaneStarts(this.mapDef).filter(
            (s, i, arr) => arr.findIndex((o) => o.x === s.x && o.y === s.y) === i,
        )
        for (const start of uniqueStarts) {
            const startX = start.x * CELL_SIZE + CELL_SIZE / 2
            const startGroundY = (start.y + 2) * CELL_SIZE // +2 : descendu d'une case
            const enemyCastle = this.add.image(startX, startGroundY, 'castle').setOrigin(0.35, 1).setDepth(-15)
            enemyCastle.setScale(castleW / enemyCastle.width)
            enemyCastle.setFlipX(true)
        }

        // Ton château à l'arrivée commune (sombre, orienté vers la gauche = vers le champ).
        const end = mapCastle(this.mapDef)
        const endX = end.x * CELL_SIZE + CELL_SIZE / 2
        const endGroundY = (end.y + 2) * CELL_SIZE // +2 : descendu d'une case
        const castle = this.add.image(endX, endGroundY, 'castle-enemy').setOrigin(0.65, 1).setDepth(-15)
        castle.setScale(castleW / castle.width)
    }
}
