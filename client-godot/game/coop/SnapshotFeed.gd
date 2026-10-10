class_name SnapshotFeed
extends RefCounted
## Adapte le flux de snapshots live (MatchSnapshotDto, un par tick serveur) au format
## des ticks rejoués par TickPlayer et BattleView, pour réutiliser le même rendu
## qu'en solo (docs/CLIENT_GODOT.md §3, règle 5 : réutilisation avant duplication).
##
## Présentation uniquement : le snapshot ne dit pas pourquoi un ennemi a disparu ni
## quelle tour a tiré sur quel ennemi ; on le déduit pour choisir l'animation
## (mort ou attaque du château) et l'effet de tir. Aucune règle de jeu n'en dépend.

## Un ennemi disparu à cette distance du château (en cases), quand ses PV baissent,
## est compté comme arrivé (animation d'attaque) plutôt que tué.
const CASTLE_REACH: float = 1.5
## Au-delà de cet écart entre deux snapshots reçus (≈ 1 s), le flux a été coupé
## (reconnexion, appli en arrière-plan) : on resynchronise sans rien déduire.
const RESYNC_TICKS: int = 8

var castle: Vector2i = Vector2i(-1, -1)

var _previous: Dictionary = {} # id → EnemyStateDto du snapshot précédent
var _castle_hp: int = -1
var _tower_key: String = ""
var _last_tick: int = -1


## Vrai si les tours posées (ids et niveaux) ont changé depuis le dernier appel :
## le rendu des tours n'est reconstruit qu'à ce moment-là, pas à chaque tick.
func towers_changed(snap: MatchSnapshotDto) -> bool:
	var key: String = ""
	for view: MatchSnapshotDto.TowerView in snap.towers:
		key += "%s:%d;" % [view.id, view.level]
	if key == _tower_key:
		return false
	_tower_key = key
	return true


## Tours du snapshot au format du rendu (profil de tir, portée et PV : catalogue serveur).
static func towers_of(snap: MatchSnapshotDto, specs: Array[TowerSpecDto]) -> Array[TowerDto]:
	var out: Array[TowerDto] = []
	for view: MatchSnapshotDto.TowerView in snap.towers:
		out.append(_tower_from(view, specs))
	return out


## Vrai si ce snapshot ne suit pas le précédent (trou dans le flux, ou nouvelle
## partie) : l'écran repart alors de zéro au lieu d'interpoler par-dessus le trou.
func is_gap(snap: MatchSnapshotDto) -> bool:
	return _last_tick >= 0 and (snap.tick < _last_tick or snap.tick - _last_tick > RESYNC_TICKS)


func to_tick(snap: MatchSnapshotDto, towers: Array[TowerDto]) -> TickDto:
	var tick: TickDto = TickDto.new()
	tick.tick = snap.tick
	tick.enemies = snap.enemies
	tick.castle_hp = snap.castle_hp
	var present: Dictionary = {}
	for enemy: EnemyStateDto in snap.enemies:
		present[enemy.id] = enemy
	# Après un trou, les ennemis disparus entre-temps ne sont pas « morts sous nos
	# yeux » : pas d'animation de mort ni d'attaque du château pour eux.
	var resync: bool = is_gap(snap)
	var castle_hit: bool = not resync and _castle_hp >= 0 and snap.castle_hp < _castle_hp
	for enemy_id: String in _previous:
		if resync or present.has(enemy_id):
			continue
		var gone: EnemyStateDto = _previous[enemy_id]
		if castle_hit and gone.pos.distance_to(Vector2(castle)) <= CASTLE_REACH:
			tick.reached_castle.append(enemy_id)
		else:
			tick.deaths.append(enemy_id)
	# Tirs : la tour est sur la case de départ du tir, la cible est l'ennemi le plus
	# proche du point d'arrivée.
	var by_cell: Dictionary = {}
	for tower: TowerDto in towers:
		by_cell[tower.cell] = tower
	for shot: MatchSnapshotDto.Shot in snap.shots:
		var tower: TowerDto = by_cell.get(Vector2i(roundi(shot.from.x), roundi(shot.from.y)))
		var target: EnemyStateDto = _nearest(snap.enemies, shot.to)
		if tower == null or target == null:
			continue
		var hit: HitDto = HitDto.new()
		hit.tower_id = tower.id
		hit.enemy_id = target.id
		tick.hits.append(hit)
	_previous = present
	_castle_hp = snap.castle_hp
	_last_tick = snap.tick
	return tick


static func _nearest(enemies: Array[EnemyStateDto], point: Vector2) -> EnemyStateDto:
	var best: EnemyStateDto = null
	var best_d: float = 0.5 # au-delà d'une demi-case, le tir ne vise aucun ennemi connu
	for enemy: EnemyStateDto in enemies:
		var d: float = enemy.pos.distance_to(point)
		if d <= best_d:
			best = enemy
			best_d = d
	return best


static func _tower_from(view: MatchSnapshotDto.TowerView, specs: Array[TowerSpecDto]) -> TowerDto:
	var tower: TowerDto = TowerDto.new()
	tower.id = view.id
	tower.type = view.type
	tower.cell = view.cell
	tower.level = view.level
	for spec: TowerSpecDto in specs:
		if spec.type == view.type:
			tower.damage_type = spec.damage_type
			tower.splash_radius = spec.splash_radius
			var stats: TowerSpecDto.Level = spec.level(view.level)
			if stats != null:
				tower.damage = stats.damage
				tower.range_cells = stats.range_cells
				tower.hp = stats.max_hp
				tower.max_hp = stats.max_hp
			break
	return tower
