import Phaser from 'phaser'
import { PATH_START, PATH_END, CORRIDOR_CELLS, pathDirectionAt } from './constants'

const CELL_SIZE = 40
const GRID_WIDTH = 20
const GRID_HEIGHT = 15
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
    private onCellClick?: (x: number, y: number) => void
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
        // Terrain : herbe (champ) + terre (couloir), textures tuilables 512x512.
        this.load.image('terrain-grass', '/sprites/terrain/grass.png')
        this.load.image('terrain-dirt', '/sprites/terrain/dirt.png')
        // Châteaux : le tien (arrivée, à défendre) + celui de l'ennemi (spawn, décoratif).
        this.load.image('castle', '/sprites/castle/castle.png')
        this.load.image('castle-enemy', '/sprites/castle/castle_enemy.png')
    }

    create() {
        // Terrain tuilé, sous tout le reste (depth très négatif) : herbe sur tout
        // le champ, puis une tuile de terre sur chaque case du couloir SERPENTIN
        // (chemin élargi d'une case, voir CORRIDOR_CELLS) — la route suit le tracé
        // en S au lieu d'une bande droite. Remplace le fond bleu nu.
        this.add.tileSprite(0, 0, GRID_WIDTH * CELL_SIZE, GRID_HEIGHT * CELL_SIZE, 'terrain-grass')
            .setOrigin(0, 0).setDepth(-20)
        for (const c of CORRIDOR_CELLS) {
            this.add.image(c.x * CELL_SIZE + CELL_SIZE / 2, c.y * CELL_SIZE + CELL_SIZE / 2, 'terrain-dirt')
                .setDisplaySize(CELL_SIZE + 1, CELL_SIZE + 1) // +1 : recouvre les joints entre tuiles
                .setDepth(-19)
        }

        this.gridGraphics = this.add.graphics()
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
    }

    update() {
        // Game loop — la boucle de combat est rejouée via playWave(), pas ici.
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
                        const { dx, dy } = pathDirectionAt(tower.x, tower.y)
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
                            PATH_END.x + (Math.random() * 2 - 1),
                            PATH_END.y + (Math.random() * 1.6 - 0.8),
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
        const castleX = PATH_END.x * CELL_SIZE + CELL_SIZE / 2
        const castleY = PATH_END.y * CELL_SIZE + CELL_SIZE / 2

        castleAttacks.forEach((id) => {
            const enemy = enemyById.get(id)
            if (!enemy) return
            const ex = enemy.x * CELL_SIZE + CELL_SIZE / 2
            const ey = enemy.y * CELL_SIZE + CELL_SIZE / 2
            this.effectsGraphics.lineStyle(2, 0xf59e0b, 0.85) // ambre = flèche du château
            this.effectsGraphics.lineBetween(castleX, castleY, ex, ey)
            this.spawnImpact('firearrow', enemy.x, enemy.y, 0.9)
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
    private spawnImpact(key: string, cellX: number, cellY: number, scale = 1) {
        const fx = this.add.sprite(
            cellX * CELL_SIZE + CELL_SIZE / 2,
            cellY * CELL_SIZE + CELL_SIZE / 2,
            `fx-${key}`,
        )
        fx.setDisplaySize(CELL_SIZE * scale, CELL_SIZE * scale)
        fx.setDepth(10) // au-dessus des ennemis et du décor
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
                    this.spawnImpact('fireball', enemy.x, enemy.y, 1.1)
                    this.magicFxTick.set(tower.id, tickIndex)
                }
            } else if (damageType === 'AOE') {
                // Catapulte : plus de trait — le marteau s'abat (anim de tir) et
                // l'explosion éclate sur la zone touchée. Un seul tir par tour/tick.
                if (!impactSpawned.has(tower.id)) {
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
                        this.playTowerFire(tower.id, tower.type)
                        this.aimAndFireWeapon(tower.id, tower.type, targetPx, targetPy)
                        firedThisTick.add(tower.id)
                        const originY = towerPy - CELL_SIZE * 0.45 // part de l'arme, en haut
                        this.spawnProjectile(proj.key, towerPx, originY, targetPx, targetPy, () => {
                            if (impact) this.spawnImpact(impact, enemy.x, enemy.y, isBallista ? 1.4 : 1.0)
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

    // ── Dessin de la grille ──────────────────────────────────────────────

    private drawGrid() {
        // Grille discrète par-dessus le terrain texturé : juste assez visible
        // pour repérer les cases constructibles, sans masquer le décor.
        this.gridGraphics.lineStyle(1, 0x000000, 0.15)

        for (let x = 0; x <= GRID_WIDTH; x++) {
            this.gridGraphics.lineBetween(
                x * CELL_SIZE, 0,
                x * CELL_SIZE, GRID_HEIGHT * CELL_SIZE
            )
        }

        for (let y = 0; y <= GRID_HEIGHT; y++) {
            this.gridGraphics.lineBetween(
                0, y * CELL_SIZE,
                GRID_WIDTH * CELL_SIZE, y * CELL_SIZE
            )
        }
    }

    private drawPath() {
        // Le couloir est matérialisé par les tuiles de terre (voir create). On
        // pose seulement les deux châteaux, à chaque extrémité du chemin serpentin :
        // celui de l'ennemi au spawn (PATH_START, décoratif) et le tien à l'arrivée
        // (PATH_END, celui qu'on défend). Forteresses compactes (~2,4 cases de
        // large), ancrées en bas de leur case, débordant vers le haut.
        const castleW = CELL_SIZE * 2.4

        // Château ennemi au spawn (clair, orienté vers la droite = vers le champ).
        const startX = PATH_START.x * CELL_SIZE + CELL_SIZE / 2
        const startGroundY = (PATH_START.y + 1) * CELL_SIZE
        const enemyCastle = this.add.image(startX, startGroundY, 'castle').setOrigin(0.35, 1).setDepth(-15)
        enemyCastle.setScale(castleW / enemyCastle.width)
        enemyCastle.setFlipX(true)

        // Ton château à l'arrivée (sombre, orienté vers la gauche = vers le champ).
        const endX = PATH_END.x * CELL_SIZE + CELL_SIZE / 2
        const endGroundY = (PATH_END.y + 1) * CELL_SIZE
        const castle = this.add.image(endX, endGroundY, 'castle-enemy').setOrigin(0.65, 1).setDepth(-15)
        castle.setScale(castleW / castle.width)
    }
}
