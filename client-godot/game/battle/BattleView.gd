class_name BattleView
extends Node2D
## Vue provisoire du combat : tours, ennemis, tirs et morts en formes colorées.
##
## Enfant de MapView (même repère local que Grid). Ne décide rien : elle
## affiche les tours qu'on lui donne et ce que le TickPlayer rejoue.

const FLASH_SECONDS: float = 0.12
const BURST_SECONDS: float = 0.35

@export var catalog: UnitCatalog
@export var hp_back: Color = Color(0, 0, 0, 0.6)
@export var hp_front: Color = Color(0.4, 0.85, 0.35)
@export var shot_color: Color = Color(1, 0.95, 0.6, 0.9)
@export var burst_color: Color = Color(1, 0.6, 0.3)
@export var label_color: Color = Color(0.1, 0.08, 0.06)

var _player: TickPlayer
var _towers: Dictionary = {}          # id → TowerDto
var _last_positions: Dictionary = {}  # id ennemi → Vector2 (cases), pour placer l'effet de mort
var _flashes: Array[Dictionary] = []  # {from, to, ttl}
var _bursts: Array[Dictionary] = []   # {at, ttl}


func bind(player: TickPlayer) -> void:
	_player = player
	_player.tick_played.connect(_on_tick)


func show_towers(towers: Array[TowerDto]) -> void:
	_towers.clear()
	for tower: TowerDto in towers:
		_towers[tower.id] = tower
	queue_redraw()


func _on_tick(tick: TickDto) -> void:
	for enemy: EnemyStateDto in tick.enemies:
		_last_positions[enemy.id] = enemy.pos
	for hit: HitDto in tick.hits:
		var tower: TowerDto = _towers.get(hit.tower_id)
		if tower != null and _last_positions.has(hit.enemy_id):
			_flashes.append({
				"from": Grid.cell_center(tower.cell),
				"to": Grid.grid_to_local(_last_positions[hit.enemy_id]),
				"ttl": FLASH_SECONDS,
			})
	for enemy_id: String in tick.deaths:
		if _last_positions.has(enemy_id):
			_bursts.append({"at": Grid.grid_to_local(_last_positions[enemy_id]), "ttl": BURST_SECONDS})
	for tower_id: String in tick.destroyed_towers:
		_towers.erase(tower_id)


func _process(delta: float) -> void:
	var animating: bool = _player != null and _player.playing
	for fx: Dictionary in _flashes:
		fx["ttl"] = float(fx["ttl"]) - delta
	for fx: Dictionary in _bursts:
		fx["ttl"] = float(fx["ttl"]) - delta
	_flashes.assign(_flashes.filter(func(fx: Dictionary) -> bool: return float(fx["ttl"]) > 0.0))
	_bursts.assign(_bursts.filter(func(fx: Dictionary) -> bool: return float(fx["ttl"]) > 0.0))
	if animating or not _flashes.is_empty() or not _bursts.is_empty():
		queue_redraw()


func _draw() -> void:
	if catalog == null:
		return
	for tower: TowerDto in _towers.values():
		_draw_tower(tower)
	if _player != null and _player.current != null and _player.playing:
		var positions: Dictionary = _player.enemy_positions()
		for enemy: EnemyStateDto in _player.current.enemies:
			_draw_enemy(enemy, positions.get(enemy.id, enemy.pos))
	for fx: Dictionary in _flashes:
		draw_line(fx["from"], fx["to"], shot_color, 1.0)
	for fx: Dictionary in _bursts:
		var progress: float = 1.0 - float(fx["ttl"]) / BURST_SECONDS
		var color: Color = burst_color
		color.a = 1.0 - progress
		draw_arc(fx["at"], 2.0 + progress * Grid.CELL_SIZE * 0.5, 0.0, TAU, 16, color, 1.0)


func _draw_tower(tower: TowerDto) -> void:
	var visual: UnitVisual = catalog.get_visual(tower.type)
	var side: float = Grid.CELL_SIZE * visual.size
	var center: Vector2 = Grid.cell_center(tower.cell)
	var rect: Rect2 = Rect2(center - Vector2(side, side) * 0.5, Vector2(side, side))
	draw_rect(rect, visual.color)
	if not visual.short_label.is_empty():
		var font: Font = ThemeDB.fallback_font
		var font_size: int = 9
		var text_size: Vector2 = font.get_string_size(visual.short_label, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
		draw_string(font, center + Vector2(-text_size.x * 0.5, text_size.y * 0.3), visual.short_label,
			HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, label_color)
	if tower.max_hp > 0 and tower.hp < tower.max_hp:
		_draw_hp_bar(rect, float(tower.hp) / tower.max_hp)


func _draw_enemy(enemy: EnemyStateDto, pos: Vector2) -> void:
	var visual: UnitVisual = catalog.get_visual(enemy.type)
	var center: Vector2 = Grid.grid_to_local(pos)
	var radius: float = Grid.CELL_SIZE * visual.size * 0.5
	draw_circle(center, radius, visual.color)
	if enemy.max_hp > 0 and enemy.hp < enemy.max_hp:
		var rect: Rect2 = Rect2(center - Vector2(radius, radius), Vector2(radius, radius) * 2.0)
		_draw_hp_bar(rect, float(enemy.hp) / enemy.max_hp)


func _draw_hp_bar(target: Rect2, ratio: float) -> void:
	var bar: Rect2 = Rect2(target.position + Vector2(0, -3), Vector2(target.size.x, 2))
	draw_rect(bar, hp_back)
	draw_rect(Rect2(bar.position, Vector2(bar.size.x * clampf(ratio, 0.0, 1.0), bar.size.y)), hp_front)
