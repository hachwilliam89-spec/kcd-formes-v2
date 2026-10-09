class_name BattleView
extends Node2D
## Vue du combat : décor, tours, ennemis, tirs, impacts.
##
## Reproduit le rendu du jeu web (frontend-web/components/game/GameScene.ts :
## drawEnemies, placeTowerParts, drawEffects, spawnProjectile, spawnImpact)
## à partir des données du VisualCatalog et du décor exporté (DecorSet).
## Enfant de MapView : même repère que Grid (CELL_SIZE = 40, comme le web).
## Ne décide rien : elle affiche les tours reçues et ce que le TickPlayer rejoue.

## Profondeurs du web (GameScene.ts DEPTH_*) : unités = 1 + pied / 100.
const DEPTH_UNITS: float = 1.0
## Cadence d'un tick rejoué (TickPlayer) : sert à la durée de vol des projectiles (70 % d'un tick).
const PROJECTILE_FLIGHT: float = TickPlayer.TICK_SECONDS * 0.7
## Délai d'attaque d'un ennemi arrivé au château avant de disparaître.
const REACHED_SECONDS: float = 0.6
## Période (en ticks) des éclats de boule de feu du Mage.
const MAGIC_FX_PERIOD: int = 3
const BAR_HEIGHT: float = 4.0
const BAR_GAP: float = 6.0
const BAR_OK: Color = Color("22c55e")
const BAR_LOW: Color = Color("ef4444")
const BAR_BACK: Color = Color(0, 0, 0, 0.5)

@export var catalog: VisualCatalog
@export var label_color: Color = Color(0.1, 0.08, 0.06)

var _player: TickPlayer
var _decor: DecorSet
var _road_dir: Dictionary = {}       # Vector2i → Vector2i (sens de déplacement des ennemis)
var _towers: Dictionary = {}         # id → TowerDto
var _tower_fx: Dictionary = {}       # id → {aim, fired_at, channeling, channel_at}
var _enemy_fx: Dictionary = {}       # id → {state, since}
var _last_pos: Dictionary = {}       # id ennemi → Vector2 (cases)
var _types: Dictionary = {}          # id ennemi → type
var _magic_tick: Dictionary = {}     # id tour → index du dernier éclat
var _dying: Array[Dictionary] = []   # {visual, pos, since, frames, fps}
var _projectiles: Array[Dictionary] = []
var _impacts: Array[Dictionary] = []
var _tick_index: int = 0
var _time: float = 0.0
## Temps CPU passé dans cette vue (rejeu + animation + dessin), en µs, cumulé
## depuis la dernière lecture (banc de perf : take_cpu_usec).
var _cpu_usec: int = 0


func bind(player: TickPlayer) -> void:
	_player = player
	_player.tick_played.connect(_on_tick)


## Décor exporté (peut être null) et sens de la route (orientation des murs).
func setup(layout: MapLayoutDto, decor: DecorSet) -> void:
	_decor = decor
	_road_dir.clear()
	for lane: Array in layout.lane_paths:
		for i: int in range(lane.size() - 1):
			var cell: Vector2i = lane[i]
			_road_dir[cell] = (lane[i + 1] as Vector2i) - cell
	queue_redraw()


func show_towers(towers: Array[TowerDto]) -> void:
	_towers.clear()
	for tower: TowerDto in towers:
		_towers[tower.id] = tower
		if not _tower_fx.has(tower.id):
			_tower_fx[tower.id] = {"aim": 0.0, "fired_at": -INF, "channeling": false, "channel_at": 0.0}
	queue_redraw()


## Renvoie le temps CPU cumulé de la vue depuis le dernier appel, puis le remet à zéro.
func take_cpu_usec() -> int:
	var value: int = _cpu_usec
	_cpu_usec = 0
	return value


## Nombre d'ennemis affichés (compteur de perf).
func enemy_count() -> int:
	return _player.current.enemies.size() if _player != null and _player.current != null and _player.playing else 0


# --- Rejeu d'un tick (GameScene.playWave → drawEnemies + drawEffects) --------

func _on_tick(tick: TickDto) -> void:
	var started: int = Time.get_ticks_usec()
	_replay_tick(tick)
	_cpu_usec += Time.get_ticks_usec() - started


func _replay_tick(tick: TickDto) -> void:
	_tick_index += 1
	var attacking: Dictionary = {}
	for enemy_id: String in tick.attackers:
		attacking[enemy_id] = true
	var by_id: Dictionary = {}
	for enemy: EnemyStateDto in tick.enemies:
		by_id[enemy.id] = enemy
		_types[enemy.id] = enemy.type
		var wanted: String = "attack" if attacking.has(enemy.id) else "walk"
		var fx: Dictionary = _enemy_fx.get(enemy.id, {})
		if fx.is_empty() or str(fx["state"]) != wanted:
			_enemy_fx[enemy.id] = {"state": wanted, "since": _time}
	# Morts : animation de mort sur place. Arrivés au château : brève attaque puis disparition.
	for enemy_id: String in tick.deaths:
		_start_leaving(enemy_id, "die")
	for enemy_id: String in tick.reached_castle:
		_start_leaving(enemy_id, "attack")
	for enemy: EnemyStateDto in tick.enemies:
		_last_pos[enemy.id] = enemy.pos
	for tower_id: String in tick.destroyed_towers:
		_towers.erase(tower_id)
	_play_effects(tick, by_id)


func _start_leaving(enemy_id: String, kind: String) -> void:
	if not _last_pos.has(enemy_id):
		return
	var visual: EnemyVisual = catalog.enemy(str(_types.get(enemy_id, "")))
	_enemy_fx.erase(enemy_id)
	if visual.texture() == null:
		return
	var dying: bool = kind == "die"
	_dying.append({
		"visual": visual, "pos": _last_pos[enemy_id], "since": _time,
		"frames": visual.die_frames if dying else visual.attack_frames,
		"fps": visual.die_fps if dying else visual.attack_fps,
		"loop": not dying,
		"until": visual.die_duration() if dying else REACHED_SECONDS,
	})
	_last_pos.erase(enemy_id)


## Tirs du tick, comme GameScene.drawEffects : un seul tir visible par tour et par tick.
func _play_effects(tick: TickDto, enemies: Dictionary) -> void:
	var fired: Dictionary = {}
	for hit: HitDto in tick.hits:
		var tower: TowerDto = _towers.get(hit.tower_id)
		var enemy: EnemyStateDto = enemies.get(hit.enemy_id)
		if tower == null or enemy == null:
			continue
		var visual: TowerVisual = catalog.tower(tower.type)
		var target: Vector2 = Grid.grid_to_local(enemy.pos)
		var state: Dictionary = _tower_fx[tower.id]
		match tower.damage_type:
			"CONTINUOUS":
				# Mage : l'orbe canalise (anim en boucle) ; un éclat tous les MAGIC_FX_PERIOD ticks.
				if not bool(state["channeling"]):
					state["channeling"] = true
					state["channel_at"] = _time
				fired[tower.id] = true
				if _tick_index - int(_magic_tick.get(tower.id, -99)) >= MAGIC_FX_PERIOD:
					_spawn_impact(visual.impact, enemy.pos, visual.impact_scale, 0.0)
					_magic_tick[tower.id] = _tick_index
			"AOE":
				if fired.has(tower.id):
					continue
				fired[tower.id] = true
				_spawn_impact(visual.impact, enemy.pos, maxf(tower.splash_radius * 2.0, 1.2), 0.0)
				_aim(tower, visual, target)
			_:
				if fired.has(tower.id):
					continue
				fired[tower.id] = true
				var projectile: EffectVisual = catalog.effect(visual.projectile)
				if projectile != null:
					_aim(tower, visual, target)
					var origin: Vector2 = Grid.cell_center(tower.cell) - Vector2(0, Grid.CELL_SIZE * 0.45)
					var angle: float = rad_to_deg((target - origin).angle()) + 180.0
					_projectiles.append({"effect": projectile, "from": origin, "to": target, "since": _time,
						"impact": visual.impact, "impact_at": enemy.pos, "impact_scale": visual.impact_scale,
						"impact_angle": angle})
				else:
					_spawn_impact(visual.impact, enemy.pos, visual.impact_scale, 0.0)
	# Mage sans cible ce tick : l'orbe revient au repos.
	for tower_id: String in _tower_fx:
		if not fired.has(tower_id):
			(_tower_fx[tower_id] as Dictionary)["channeling"] = false


## Oriente l'arme vers la cible et relance son animation de tir (aimAndFireWeapon).
func _aim(tower: TowerDto, visual: TowerVisual, target: Vector2) -> void:
	if visual.weapon_texture() == null:
		return
	var state: Dictionary = _tower_fx[tower.id]
	state["aim"] = (target - _weapon_pivot(tower, visual)).angle() + PI / 2.0
	state["fired_at"] = _time


func _spawn_impact(key: String, cell_pos: Vector2, scale_cells: float, angle_deg: float) -> void:
	var effect: EffectVisual = catalog.effect(key)
	if effect == null or effect.texture() == null:
		return
	_impacts.append({"effect": effect, "at": Grid.grid_to_local(cell_pos), "size": Grid.CELL_SIZE * scale_cells,
		"angle": deg_to_rad(angle_deg), "since": _time})


# --- Animation -----------------------------------------------------------------

func _process(delta: float) -> void:
	var started: int = Time.get_ticks_usec()
	_animate(delta)
	_cpu_usec += Time.get_ticks_usec() - started


func _animate(delta: float) -> void:
	_time += delta
	var arrived: Array[Dictionary] = []
	for p: Dictionary in _projectiles:
		if _time - float(p["since"]) >= PROJECTILE_FLIGHT:
			arrived.append(p)
	for p: Dictionary in arrived:
		_projectiles.erase(p)
		_spawn_impact(str(p["impact"]), p["impact_at"], float(p["impact_scale"]), float(p["impact_angle"]))
	_impacts.assign(_impacts.filter(func(fx: Dictionary) -> bool:
		return _time - float(fx["since"]) < (fx["effect"] as EffectVisual).duration()))
	_dying.assign(_dying.filter(func(fx: Dictionary) -> bool:
		return _time - float(fx["since"]) < float(fx["until"])))
	# Le décor animé (portails) et les tours en action demandent un rendu continu.
	queue_redraw()


# --- Rendu (un seul _draw, trié par profondeur comme les GameObjects Phaser) ---

func _draw() -> void:
	var started: int = Time.get_ticks_usec()
	_render()
	_cpu_usec += Time.get_ticks_usec() - started


func _render() -> void:
	if catalog == null:
		return
	var items: Array[Dictionary] = []
	if _decor != null:
		for item: DecorSet.Item in _decor.items:
			items.append({"depth": item.depth, "decor": item})
	for tower: TowerDto in _towers.values():
		var visual: TowerVisual = catalog.tower(tower.type)
		var foot: float = 0.5 if visual.centered_on_road else 1.0
		items.append({"depth": _unit_depth(tower.cell.y + foot), "tower": tower})
	var positions: Dictionary = {}
	if _player != null and _player.current != null and _player.playing:
		positions = _player.enemy_positions()
		for enemy: EnemyStateDto in _player.current.enemies:
			var pos: Vector2 = positions.get(enemy.id, enemy.pos)
			items.append({"depth": _unit_depth(pos.y + 0.75), "enemy": enemy, "pos": pos})
	for fx: Dictionary in _dying:
		items.append({"depth": _unit_depth((fx["pos"] as Vector2).y + 0.75), "dying": fx})
	items.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a["depth"]) < float(b["depth"]))

	# Repères au sol des unités (profondeur 0 du web), sous tout ce qui est trié.
	if _decor == null or not _decor.ground_covers_depth0:
		for item: Dictionary in items:
			if item.has("enemy"):
				_draw_ring(catalog.enemy((item["enemy"] as EnemyStateDto).type), Grid.grid_to_local(item["pos"]))

	var bars: Array[Dictionary] = []
	for item: Dictionary in items:
		if item.has("decor"):
			_draw_decor(item["decor"])
		elif item.has("tower"):
			var tower: TowerDto = item["tower"]
			var top: float = _draw_tower(tower)
			if tower.max_hp > 0 and tower.hp < tower.max_hp:
				var x: float = Grid.cell_center(tower.cell).x
				bars.append({"x": x, "y": top - BAR_GAP, "w": Grid.CELL_SIZE * 0.8, "ratio": float(tower.hp) / tower.max_hp})
		elif item.has("enemy"):
			var enemy: EnemyStateDto = item["enemy"]
			var visual: EnemyVisual = catalog.enemy(enemy.type)
			var center: Vector2 = Grid.grid_to_local(item["pos"])
			_draw_enemy(enemy, visual, center)
			bars.append({"x": center.x, "y": center.y - Grid.CELL_SIZE * visual.bar_radius_cells - BAR_GAP,
				"w": Grid.CELL_SIZE * visual.bar_cells, "ratio": float(enemy.hp) / maxf(1.0, float(enemy.max_hp))})
		elif item.has("dying"):
			_draw_leaving(item["dying"])
	for bar: Dictionary in bars:
		_draw_bar(bar)
	for p: Dictionary in _projectiles:
		_draw_projectile(p)
	for fx: Dictionary in _impacts:
		var effect: EffectVisual = fx["effect"]
		var size: float = fx["size"]
		_draw_region(effect.texture(), TextureCache.frame_rect(effect.texture(), effect.frame_size,
			effect.frame_at(_time - float(fx["since"]))), fx["at"], Vector2(size, size), Vector2(0.5, 0.5), fx["angle"])


func _unit_depth(foot_cell_y: float) -> float:
	return DEPTH_UNITS + foot_cell_y / 100.0


func _draw_decor(item: DecorSet.Item) -> void:
	_draw_region(item.texture, item.frame_at(_time), item.position, item.size, item.origin, item.rotation,
		item.flip_x, item.flip_y, item.modulate)


## Dessine une tour (placeTowerParts) et renvoie le haut de son sprite (pour la barre de vie).
func _draw_tower(tower: TowerDto) -> float:
	var visual: TowerVisual = catalog.tower(tower.type)
	var origin: Vector2 = Grid.cell_origin(tower.cell)
	var width: float = Grid.CELL_SIZE * visual.width_cells
	var center_x: float = origin.x + Grid.CELL_SIZE * 0.5
	var foot_y: float = origin.y + Grid.CELL_SIZE - 1.0
	var state: Dictionary = _tower_fx.get(tower.id, {})

	if visual.centered_on_road and visual.base_texture() != null:
		var tex: Texture2D = visual.base_texture()
		var size: Vector2 = Vector2(width, width * tex.get_height() / tex.get_width())
		var dir: Vector2i = _road_dir_at(tower.cell)
		var angle: float = -90.0 if dir.x > 0 else 90.0 if dir.x < 0 else 180.0 if dir.y < 0 else 0.0
		_draw_region(tex, Rect2(Vector2.ZERO, tex.get_size()), Grid.cell_center(tower.cell), size, Vector2(0.5, 0.5), deg_to_rad(angle))
		return origin.y

	if visual.anim_texture() != null:
		var sheet: Texture2D = visual.anim_texture()
		var frame: int = 0
		if bool(state.get("channeling", false)):
			frame = int((_time - float(state["channel_at"])) * visual.anim_fps) % TextureCache.frame_count(sheet, visual.anim_frame_size)
		var size: Vector2 = Vector2(width, width * visual.anim_frame_size.y / visual.anim_frame_size.x)
		_draw_region(sheet, TextureCache.frame_rect(sheet, visual.anim_frame_size, frame), Vector2(center_x, foot_y), size, Vector2(0.5, 1.0))
		return foot_y - size.y

	var base: Texture2D = visual.base_texture()
	if base == null:
		return _draw_tower_fallback(tower, visual)
	var scale: float = width / base.get_width()
	var base_size: Vector2 = base.get_size() * scale
	_draw_region(base, Rect2(Vector2.ZERO, base.get_size()), Vector2(center_x, foot_y), base_size, Vector2(0.5, 1.0))
	var weapon: Texture2D = visual.weapon_texture()
	if weapon != null:
		var count: int = TextureCache.frame_count(weapon, visual.weapon_frame_size)
		var fired_at: float = float(state.get("fired_at", -INF))
		var frame: int = 0 if fired_at == -INF else mini(int((_time - fired_at) * visual.weapon_fps), count - 1)
		_draw_region(weapon, TextureCache.frame_rect(weapon, visual.weapon_frame_size, frame), _weapon_pivot(tower, visual),
			Vector2(visual.weapon_frame_size) * scale, visual.weapon_pivot, float(state.get("aim", 0.0)))
	return foot_y - base_size.y


## Point de rotation de l'arme sur son socle (mountFrac depuis le haut du socle).
func _weapon_pivot(tower: TowerDto, visual: TowerVisual) -> Vector2:
	var base: Texture2D = visual.base_texture()
	var origin: Vector2 = Grid.cell_origin(tower.cell)
	var foot_y: float = origin.y + Grid.CELL_SIZE - 1.0
	var base_height: float = 0.0
	if base != null:
		base_height = Grid.CELL_SIZE * visual.width_cells * base.get_height() / base.get_width()
	return Vector2(origin.x + Grid.CELL_SIZE * 0.5, foot_y - base_height * (1.0 - visual.mount_frac))


func _road_dir_at(cell: Vector2i) -> Vector2i:
	if _road_dir.has(cell):
		return _road_dir[cell]
	for dy: int in [-1, 0, 1]:
		for dx: int in [-1, 0, 1]:
			var near: Vector2i = cell + Vector2i(dx, dy)
			if _road_dir.has(near):
				return _road_dir[near]
	return Vector2i.ZERO


func _draw_tower_fallback(tower: TowerDto, visual: TowerVisual) -> float:
	var side: float = Grid.CELL_SIZE * 0.7
	var center: Vector2 = Grid.cell_center(tower.cell)
	draw_rect(Rect2(center - Vector2(side, side) * 0.5, Vector2(side, side)), visual.color)
	if not visual.short_label.is_empty():
		var font: Font = ThemeDB.fallback_font
		var text_size: Vector2 = font.get_string_size(visual.short_label, HORIZONTAL_ALIGNMENT_LEFT, -1, 20)
		draw_string(font, center + Vector2(-text_size.x * 0.5, text_size.y * 0.3), visual.short_label,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 20, label_color)
	return center.y - side * 0.5


func _draw_enemy(enemy: EnemyStateDto, visual: EnemyVisual, center: Vector2) -> void:
	var tex: Texture2D = visual.texture()
	if tex == null:
		draw_circle(center, Grid.CELL_SIZE * visual.radius_cells, visual.color)
		return
	var fx: Dictionary = _enemy_fx.get(enemy.id, {"state": "walk", "since": _time})
	var elapsed: float = _time - float(fx["since"])
	var frame: int = EnemyVisual.anim_frame(visual.attack_frames, visual.attack_fps, elapsed, true) \
		if str(fx["state"]) == "attack" else EnemyVisual.anim_frame(visual.walk_frames, visual.walk_fps, elapsed, true)
	var side: float = Grid.CELL_SIZE * visual.display_cells
	_draw_region(tex, visual.frame_rect(frame), center + Vector2(0, Grid.CELL_SIZE * visual.offset_cells),
		Vector2(side, side), Vector2(0.5, 0.5))


## Anneau au sol (GameScene.drawEnemies : strokeEllipse sous le Chevalier noir).
func _draw_ring(visual: EnemyVisual, center: Vector2) -> void:
	if visual.ring_color.a <= 0.0:
		return
	var radii: Vector2 = visual.ring_size_cells * Grid.CELL_SIZE * 0.5
	var at: Vector2 = center + Vector2(0, Grid.CELL_SIZE * visual.ring_offset_cells)
	var points: PackedVector2Array = PackedVector2Array()
	for i: int in range(33):
		var a: float = TAU * i / 32.0
		points.append(at + Vector2(cos(a) * radii.x, sin(a) * radii.y))
	draw_polyline(points, visual.ring_color, visual.ring_width)


func _draw_leaving(fx: Dictionary) -> void:
	var visual: EnemyVisual = fx["visual"]
	var frame: int = EnemyVisual.anim_frame(fx["frames"], float(fx["fps"]), _time - float(fx["since"]), bool(fx["loop"]))
	var side: float = Grid.CELL_SIZE * visual.display_cells
	var center: Vector2 = Grid.grid_to_local(fx["pos"])
	_draw_region(visual.texture(), visual.frame_rect(frame), center + Vector2(0, Grid.CELL_SIZE * visual.offset_cells),
		Vector2(side, side), Vector2(0.5, 0.5))


func _draw_projectile(p: Dictionary) -> void:
	var effect: EffectVisual = p["effect"]
	var from: Vector2 = p["from"]
	var to: Vector2 = p["to"]
	var t: float = clampf((_time - float(p["since"])) / PROJECTILE_FLIGHT, 0.0, 1.0)
	# Sprite dessiné pointe vers le haut : rotation = angle du vecteur + 90°.
	_draw_region(effect.texture(), TextureCache.frame_rect(effect.texture(), effect.frame_size, effect.frame_at(_time - float(p["since"]))),
		from.lerp(to, t), Vector2(Grid.CELL_SIZE * 0.18, Grid.CELL_SIZE * 0.5), Vector2(0.5, 0.5), (to - from).angle() + PI / 2.0)


func _draw_bar(bar: Dictionary) -> void:
	var ratio: float = clampf(float(bar["ratio"]), 0.0, 1.0)
	var x: float = float(bar["x"]) - float(bar["w"]) * 0.5
	var y: float = bar["y"]
	draw_rect(Rect2(x, y, bar["w"], BAR_HEIGHT), BAR_BACK)
	draw_rect(Rect2(x, y, float(bar["w"]) * ratio, BAR_HEIGHT), BAR_OK if ratio > 0.3 else BAR_LOW)


## Dessine une zone de texture comme un GameObject Phaser : position, taille
## affichée, ancrage (origin, fraction de la taille), rotation, miroirs, teinte.
func _draw_region(texture: Texture2D, source: Rect2, at: Vector2, size: Vector2, origin: Vector2,
		rotation: float = 0.0, flip_x: bool = false, flip_y: bool = false, modulate: Color = Color.WHITE) -> void:
	if texture == null:
		return
	draw_set_transform(at, rotation, Vector2(-1.0 if flip_x else 1.0, -1.0 if flip_y else 1.0))
	draw_texture_rect_region(texture, Rect2(-size * origin, size), source, modulate)
	draw_set_transform_matrix(Transform2D.IDENTITY)
