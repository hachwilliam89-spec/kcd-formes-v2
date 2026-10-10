class_name SeasonView
extends Node2D
## Terrain saisonnier (printemps, automne) : reproduit GameScene.renderTerrainState
## du web et ses calques — crue, berges annoncées, pluie, flaques et grêle au
## printemps ; boue (avec son averse) et brume à l'automne ; tours suspendues par
## la crue (estompées, ronds d'eau à leur pied).
##
## Le serveur décide de tout : la vue montre l'état du tick (TerrainSnapshotDto) ou,
## entre deux vagues, l'annonce de la suivante (TerrainForecastDto). Chaque calque
## n'est repeint que quand cet état change.
##
## Enfant de MapView placé AVANT BattleView : les calques de sol passent sous les
## unités ; la brume (z 1) et la météo (z 2) au-dessus, comme les profondeurs du web
## (DEPTH_PUDDLES -1.5, sol 0.3, DEPTH_WATER 0.35, DEPTH_FOG 3, DEPTH_RAIN 58).
## Mêmes graines que le web là où il en a une : mêmes flaques, même boue, même eau.

const CELL: float = Grid.CELL_SIZE
const RAIN_ANGLE_DEG: float = 12.0
## Rangée du haut réservée (constants.ts TOP_RESERVED_ROWS) : jamais de flaque.
const TOP_RESERVED_ROWS: int = 1
## Brume peinte en basse résolution puis agrandie avec lissage (bords flous).
const FOG_SCALE: int = 4
const FOG_COLOR: Color = Color(236 / 255.0, 240 / 255.0, 240 / 255.0)
const DIM_ALPHA: float = 0.72
## Le web pose les flaques SOUS les calques de route et de parcelles (DEPTH_PUDDLES),
## ce qui les rend grisées et discrètes. Le sol exporté est d'une seule pièce : on
## obtient le même rendu en atténuant les flaques (mesuré sur captures web / Godot).
const PUDDLE_VEIL: float = 0.4


## Calque dessiné par une fonction (peinte une fois, ou à chaque image s'il bouge).
class Layer:
	extends Node2D
	var painter: Callable
	## Décalage du dessin dans le calque (origine des nappes de crue).
	var offset: Vector2 = Vector2.ZERO

	func _draw() -> void:
		if offset != Vector2.ZERO:
			draw_set_transform(offset)
		if painter.is_valid():
			painter.call(self)


## Générateur pseudo-aléatoire du web : (seed * 1103515245 + 12345) & 0x7fffffff,
## calculé comme en JavaScript (produit en flottant double) pour tirer les mêmes valeurs.
class Lcg:
	extends RefCounted
	var state: int

	func _init(seed_value: int) -> void:
		state = seed_value

	func next() -> float:
		var product: float = float(state) * 1103515245.0 + 12345.0
		state = int(fmod(product, 4294967296.0)) & 0x7fffffff
		return float(state) / float(0x7fffffff)


var _layout: MapLayoutDto
var _battle: BattleView
## "SPRING", "AUTUMN" ou "" (carte sans saison : la vue ne fait rien).
var _season: String = ""
var _key: String = ""
var _time: float = 0.0
var _size: Vector2 = Vector2.ZERO
var _current_fog: Dictionary = {}

# Conteneurs, dans l'ordre des profondeurs du web.
var _puddle_root: Node2D
var _mud_root: Node2D
var _alert: Layer
var _flood_root: Node2D
var _ground_fx: Layer
var _fog_root: Node2D
var _sky_root: Node2D
var _rain_shade: Layer
var _hail_shade: Layer
var _sky: Layer

# Printemps : berges annoncées, crue, ronds de pluie sur l'eau.
var _alert_cells: Array[Vector2i] = []
var _alert_tween: Tween
var _flood_signature: String = ""
var _flood_layers: Array[Dictionary] = []
var _ripple_cells: Array[Vector2i] = []
var _ripple_clock: float = 0.0
var _ripples: Array[Dictionary] = []

# Pluie, flaques, grêle.
var _rain_level: String = "none"
var _drops: Array[Dictionary] = []
var _rain_visible: int = 0
var _puddles: Layer
var _puddle_spots: Array[Dictionary] = []
var _puddle_level: String = "none"
var _puddle_clock: float = 0.0
var _puddle_ripples: Array[Dictionary] = []
var _hail_level: String = "none"
var _stones: Array[Dictionary] = []
var _hail_visible: int = 0
var _bounces: Array[Dictionary] = []

# Automne : boue, averse passagère, brume.
var _mud: Layer
var _mud_signature: String = ""
var _shower_left: float = 0.0
var _fog_sprites: Array[Sprite2D] = []
var _fog_signature: String = ""

# Tours suspendues par la crue : id → instant d'apparition du rond d'eau.
var _wakes: Dictionary = {}


func setup(layout: MapLayoutDto, battle: BattleView) -> void:
	_layout = layout
	_battle = battle
	_season = layout.terrain if layout.terrain in ["SPRING", "AUTUMN"] else ""
	_size = Vector2(layout.width, layout.height) * CELL
	_reset()


## Affiche l'état du tick ; sans état (entre deux vagues), l'annonce de la prochaine.
func render(state: TerrainSnapshotDto, forecast: TerrainForecastDto = null) -> void:
	if _layout == null or _season.is_empty():
		return
	var key: String = _signature(state, forecast)
	if key == _key:
		return
	_key = key
	if _season == "SPRING":
		var flooded: bool = state != null and state.flooded
		var forecast_flood: bool = state == null and forecast != null and forecast.flooded
		var flood_cells: Array[Vector2i] = []
		if state != null:
			flood_cells = state.flood if not state.flood.is_empty() or not flooded else _layout.bank_cells
		_set_alert(forecast.affected_cells if forecast_flood else ([] as Array[Vector2i]))
		_set_flood_water(flood_cells)
		_set_rain("storm" if flooded else "drizzle" if forecast_flood else "none")
		var forecast_hail: bool = state == null and forecast != null and forecast.hail
		_set_hail("storm" if state != null and state.hail else "light" if forecast_hail else "none")
	else:
		var mud: Array[Vector2i] = state.mud if state != null else (forecast.affected_cells if forecast != null else ([] as Array[Vector2i]))
		var fog: Array[Vector2i] = state.fog if state != null else (forecast.fog_cells if forecast != null else ([] as Array[Vector2i]))
		_set_mud(mud)
		_set_fog(fog)
	var disabled: Array[String] = state.disabled_towers if state != null else ([] as Array[String])
	if _battle != null:
		_battle.set_dimmed_towers(disabled, DIM_ALPHA)
	_sync_wakes(disabled)


## Précision sur une case pour le joueur : berge inondable, brume (vide sinon).
func cell_note(cell: Vector2i) -> String:
	if _layout == null or _season.is_empty():
		return ""
	var notes: PackedStringArray = []
	if _layout.is_bank(cell):
		notes.append("berge inondable (crues v. %s)" % _layout.flood_waves_label())
	var penalty: float = fog_penalty_at(cell)
	if penalty > 0.0:
		notes.append("brume : −%s portée" % format_cells(penalty))
	return "" if notes.is_empty() else " · " + " · ".join(notes)


## Nombre de cases sans décimale inutile (1.0 → « 1 », 1.5 → « 1.5 »).
static func format_cells(value: float) -> String:
	return str(int(value)) if is_equal_approx(value, roundf(value)) else "%.1f" % value


## Portée perdue par une tour posée sur cette case (brume affichée).
func fog_penalty_at(cell: Vector2i) -> float:
	return _layout.seasonal_rules.fog_range_penalty if _current_fog.has(cell) else 0.0


func _process(delta: float) -> void:
	if _season.is_empty():
		return
	_time += delta
	if _shower_left > 0.0:
		_shower_left -= delta
		if _shower_left <= 0.0:
			_set_rain("none")
	_update_rain(delta)
	_update_hail(delta)
	_update_ripples(delta)
	if _rain_visible > 0 or _hail_visible > 0:
		_sky.queue_redraw()
	if not _ripples.is_empty() or not _puddle_ripples.is_empty() or not _bounces.is_empty() or not _wakes.is_empty() \
			or not _ripple_cells.is_empty() or _puddle_level != "none":
		_ground_fx.queue_redraw()


# --- Mise en place -------------------------------------------------------------
# Chaque animation est rattachée au calque qu'elle anime : elle disparaît avec lui
# (changement de carte, nappe de crue remplacée).

func _reset() -> void:
	for child: Node in get_children():
		remove_child(child)
		child.queue_free()
	_key = ""
	_current_fog.clear()
	_alert_cells = []
	_flood_signature = ""
	_flood_layers.clear()
	_ripple_cells = []
	_ripples.clear()
	_rain_level = "none"
	_drops.clear()
	_rain_visible = 0
	_puddles = null
	_puddle_spots.clear()
	_puddle_level = "none"
	_puddle_ripples.clear()
	_hail_level = "none"
	_stones.clear()
	_hail_visible = 0
	_bounces.clear()
	_mud = null
	_mud_signature = ""
	_shower_left = 0.0
	_fog_sprites.clear()
	_fog_signature = ""
	_wakes.clear()
	if _season.is_empty():
		return
	_puddle_root = _node("Puddles")
	_mud_root = _node("Mud")
	_alert = _layer("BankAlert", _paint_alert)
	_flood_root = _node("Flood")
	_ground_fx = _layer("GroundFx", _paint_ground_fx)
	_fog_root = _node("Fog")
	_fog_root.z_index = 1
	_sky_root = _node("Sky")
	_sky_root.z_index = 2
	_rain_shade = _layer("RainShade", _paint_shade.bind(Color("18263a")), _sky_root)
	_rain_shade.modulate.a = 0.0
	_hail_shade = _layer("HailShade", _paint_shade.bind(Color("2c3a4a")), _sky_root)
	_hail_shade.modulate.a = 0.0
	_sky = _layer("Weather", _paint_sky, _sky_root)


func _node(node_name: String, parent: Node = self) -> Node2D:
	var node: Node2D = Node2D.new()
	node.name = node_name
	parent.add_child(node)
	return node


func _layer(node_name: String, painter: Callable, parent: Node = self) -> Layer:
	var layer: Layer = Layer.new()
	layer.name = node_name
	layer.painter = painter
	parent.add_child(layer)
	return layer


func _signature(state: TerrainSnapshotDto, forecast: TerrainForecastDto) -> String:
	var parts: Array = []
	if state != null:
		parts.append([state.flooded, state.fog, state.mud, state.disabled_towers, state.flood, state.hail])
	else:
		parts.append(null)
		if forecast != null:
			parts.append([forecast.flooded, forecast.affected_cells, forecast.fog_cells, forecast.hail])
	return str(parts)


# --- Printemps : berges annoncées ----------------------------------------------

## Berges que la prochaine crue noiera : surbrillance qui pulse.
func _set_alert(cells: Array[Vector2i]) -> void:
	_alert_cells = cells
	_alert.queue_redraw()
	if _alert_tween != null:
		_alert_tween.kill()
	_alert.modulate.a = 1.0
	if cells.is_empty():
		return
	_alert_tween = _alert.create_tween().set_loops()
	_alert_tween.tween_property(_alert, "modulate:a", 0.25, 0.8).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_alert_tween.tween_property(_alert, "modulate:a", 1.0, 0.8).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


func _paint_alert(c: Layer) -> void:
	for p: Vector2i in _alert_cells:
		var r: Rect2 = Rect2(Vector2(p) * CELL + Vector2(2, 2), Vector2(36, 36))
		_rounded_rect(c, r, 5.0, Color("9fd8e8", 0.22), true)
		_rounded_rect(c, Rect2(Vector2(p) * CELL + Vector2(3, 3), Vector2(34, 34)), 5.0, Color("e8f8ff", 0.95), false, 2.0)


# --- Printemps : crue ------------------------------------------------------------

## Le lac déborde sur les berges noyées de cette crue : une nappe par groupe de
## berges, qui s'étale depuis le lac à la montée et s'y retire à la décrue.
func _set_flood_water(cells: Array[Vector2i]) -> void:
	var on: bool = not cells.is_empty()
	var signature: String = _cells_key(cells)
	if on and signature != _flood_signature:
		for layer: Dictionary in _flood_layers:
			_kill_tweens(layer)
			(layer["water"] as Node).queue_free()
			(layer["glints"] as Node).queue_free()
		_flood_layers.clear()
		_flood_signature = signature
		_build_flood_layers(cells)
	for layer: Dictionary in _flood_layers:
		_kill_tweens(layer)
		var water: Layer = layer["water"]
		var glints: Layer = layer["glints"]
		var axis_x: bool = str(layer["axis"]) == "x"
		var tweens: Array[Tween] = []
		var grow: Tween = water.create_tween().set_parallel()
		tweens.append(grow)
		if on:
			var full: Vector2 = Vector2.ONE
			grow.tween_property(water, "scale", full, 2.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			grow.tween_property(water, "modulate:a", 1.0, 2.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			grow.tween_property(glints, "scale", full, 2.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			grow.tween_property(glints, "modulate:a", 0.9, 2.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
			# Une fois l'eau montée, les reflets se mettent à scintiller.
			var starter: Tween = glints.create_tween()
			starter.tween_interval(2.2)
			starter.tween_callback(_start_glints.bind(layer))
			tweens.append(starter)
		else:
			var shrink: Vector2 = Vector2(0.12, 1.0) if axis_x else Vector2(1.0, 0.12)
			for node: Layer in [water, glints]:
				grow.tween_property(node, "scale", shrink, 1.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
				grow.tween_property(node, "modulate:a", 0.0, 1.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
		layer["tweens"] = tweens
	_ripple_cells = cells


## Reflets : scintillent et glissent doucement, comme sur une eau qui bouge.
func _start_glints(layer: Dictionary) -> void:
	var glints: Layer = layer["glints"]
	var glint_x: float = float(layer["glint_x"])
	var twinkle: Tween = glints.create_tween().set_loops()
	twinkle.tween_property(glints, "modulate:a", 0.3, 1.3).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	twinkle.tween_property(glints, "modulate:a", 0.9, 1.3).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	var slide: Tween = glints.create_tween().set_loops()
	slide.tween_property(glints, "position:x", glint_x + 3.0, 3.2).from(glint_x - 3.0).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	slide.tween_property(glints, "position:x", glint_x - 3.0, 3.2).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	(layer["tweens"] as Array).append_array([twinkle, slide])


func _kill_tweens(layer: Dictionary) -> void:
	for tween: Tween in layer.get("tweens", [] as Array[Tween]):
		if tween != null:
			tween.kill()


## Peint les nappes de crue (une par groupe de berges voisines), cachées au départ.
func _build_flood_layers(cells: Array[Vector2i]) -> void:
	var lake: Dictionary = {}
	for cell: Vector2i in _layout.water_cells:
		lake[cell] = true
	var rnd: Lcg = Lcg.new(5309)
	for group: Array[Vector2i] in _groups(cells):
		var lo: Vector2i = group[0]
		var hi: Vector2i = group[0]
		for c: Vector2i in group:
			lo = Vector2i(mini(lo.x, c.x), mini(lo.y, c.y))
			hi = Vector2i(maxi(hi.x, c.x), maxi(hi.y, c.y))
		const M: float = 12.0
		var origin: Vector2 = Vector2(lo) * CELL - Vector2(M, M)
		var rw: float = (hi.x - lo.x + 1) * CELL
		var rh: float = (hi.y - lo.y + 1) * CELL
		var w: float = rw + 2.0 * M
		var h: float = rh + 2.0 * M
		# De quel côté est le lac ? L'eau s'étale depuis ce bord.
		var lake_right: bool = group.any(func(c: Vector2i) -> bool: return lake.has(c + Vector2i(1, 0)))
		var lake_left: bool = group.any(func(c: Vector2i) -> bool: return lake.has(c + Vector2i(-1, 0)))
		var lake_below: bool = not lake_left and not lake_right and group.any(func(c: Vector2i) -> bool: return lake.has(c + Vector2i(0, 1)))
		var lake_above: bool = not lake_left and not lake_right and not lake_below and group.any(func(c: Vector2i) -> bool: return lake.has(c + Vector2i(0, -1)))
		var shape: Dictionary = {
			"x0": M - (8.0 if lake_left else 0.0), "x1": M + rw + (8.0 if lake_right else 0.0),
			"y0": M - (8.0 if lake_above else 0.0), "y1": M + rh + (8.0 if lake_below else 0.0),
			"left": lake_left, "right": lake_right, "above": lake_above, "below": lake_below,
			"count": group.size(),
		}
		# Tirages faits ici, une fois et dans l'ordre du web : le dessin les rejoue.
		shape["water"] = _flood_water_strokes(shape, rnd)
		shape["glints"] = _flood_glint_strokes(shape, rnd)
		var origin_x: float = 0.0 if lake_left else 1.0 if lake_right else 0.5
		var origin_y: float = 0.0 if lake_above else 1.0 if lake_below else 0.0
		var axis: String = "y" if lake_above or lake_below else "x"
		var pivot: Vector2 = origin + Vector2(w * origin_x, h * origin_y)
		var start: Vector2 = Vector2(0.12, 1.0) if axis == "x" else Vector2(1.0, 0.12)
		var water: Layer = _layer("Water", _paint_strokes.bind(shape["water"]), _flood_root)
		var glints: Layer = _layer("Glints", _paint_strokes.bind(shape["glints"]), _flood_root)
		for node: Layer in [water, glints]:
			node.position = pivot
			node.offset = -Vector2(w * origin_x, h * origin_y)
			node.scale = start
			node.modulate.a = 0.0
		_flood_layers.append({"water": water, "glints": glints, "glint_x": pivot.x, "axis": axis, "tweens": [] as Array[Tween]})


## Nappe d'une crue (buildFloodLayers du web) : liste de traits à rejouer.
func _flood_water_strokes(s: Dictionary, rnd: Lcg) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var x0: float = s["x0"]
	var x1: float = s["x1"]
	var y0: float = s["y0"]
	var y1: float = s["y1"]
	var left: bool = s["left"]
	var right: bool = s["right"]
	var above: bool = s["above"]
	var below: bool = s["below"]
	var edges: Array[PackedFloat32Array] = []
	if not above:
		edges.append(PackedFloat32Array([x0, y0, x1, y0]))
	if not below:
		edges.append(PackedFloat32Array([x0, y1, x1, y1]))
	if not left:
		edges.append(PackedFloat32Array([x0, y0, x0, y1]))
	if not right:
		edges.append(PackedFloat32Array([x1, y0, x1, y1]))
	var inward: Callable = func(p: Vector2, d: float) -> Vector2:
		return Vector2(d if p.x <= x0 + 0.5 else -d if p.x >= x1 - 0.5 else 0.0,
			d if p.y <= y0 + 0.5 else -d if p.y >= y1 - 0.5 else 0.0)
	# 1) Terre mouillée, un peu au-delà de l'eau.
	out.append({"rect": Rect2(x0, y0, x1 - x0, y1 - y0), "color": Color(44 / 255.0, 64 / 255.0, 52 / 255.0, 0.42)})
	for p: Vector2 in _along(edges, 7.0):
		out.append({"disc": p, "r": 6.0 + rnd.next() * 5.0, "color": Color(44 / 255.0, 64 / 255.0, 52 / 255.0, 0.42)})
	# 2) Eau : bleu du lac côté lac, plus claire côté terre.
	var ix0: float = x0 + (0.0 if left else 3.0)
	var ix1: float = x1 - (0.0 if right else 3.0)
	var iy0: float = y0 + (0.0 if above else 3.0)
	var iy1: float = y1 - (0.0 if below else 3.0)
	var from_side: String = "left" if left else "right" if right else "top" if above else "bottom"
	out.append({"gradient": Rect2(ix0, iy0, ix1 - ix0, iy1 - iy0), "from": from_side})
	var water: Color = Color(110 / 255.0, 160 / 255.0, 168 / 255.0, 0.93)
	for p: Vector2 in _along(edges, 6.0):
		out.append({"disc": p + (inward.call(p, 3.0) as Vector2), "r": 3.0 + rnd.next() * 4.0, "color": water})
	# 3) Zones plus profondes, côté lac.
	for i: int in range(int(s["count"])):
		var ex: float = x0 + 6.0 + rnd.next() * 14.0 if left else x1 - 6.0 - rnd.next() * 14.0 if right else x0 + 10.0 + rnd.next() * (x1 - x0 - 20.0)
		var ey: float = y0 + 6.0 + rnd.next() * 12.0 if above else y1 - 6.0 - rnd.next() * 12.0 if below else y0 + 10.0 + rnd.next() * (y1 - y0 - 20.0)
		var erx: float = 8.0 + rnd.next() * 6.0
		var ery: float = 5.0 + rnd.next() * 4.0
		out.append({"ellipse": Vector2(ex, ey), "rx": erx, "ry": ery, "color": Color(46 / 255.0, 92 / 255.0, 108 / 255.0, 0.28)})
	# 4) Vaguelettes en arc.
	var y: float = y0 + 14.0
	while y < y1 - 8.0:
		var x: float = x0 + 8.0 + rnd.next() * 10.0
		while x < x1 - 12.0:
			out.append({"arc": Vector2(x, y), "color": Color(214 / 255.0, 238 / 255.0, 244 / 255.0, 0.4)})
			x += 20.0 + rnd.next() * 8.0
		y += 15.0
	# 5) Écume le long de la rive.
	for p: Vector2 in _along(edges, 6.0):
		if rnd.next() < 0.35:
			continue
		var foam: Color = Color(240 / 255.0, 248 / 255.0, 250 / 255.0, 0.8) if rnd.next() < 0.5 else Color(220 / 255.0, 238 / 255.0, 242 / 255.0, 0.5)
		var d: Vector2 = inward.call(p, 4.0)
		var fx: float = p.x + d.x + (rnd.next() - 0.5) * 2.0
		var fy: float = p.y + d.y + (rnd.next() - 0.5) * 2.0
		var fw: float = 2.0 + roundf(rnd.next())
		var fh: float = 1.0 + roundf(rnd.next())
		out.append({"rect": Rect2(fx, fy, fw, fh), "color": foam})
	return out


## Reflets (calque séparé, scintillant).
func _flood_glint_strokes(s: Dictionary, rnd: Lcg) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var x0: float = s["x0"]
	var x1: float = s["x1"]
	var y0: float = s["y0"]
	var y1: float = s["y1"]
	for i: int in range(int(s["count"]) * 4):
		var color: Color = Color(1, 1, 1, 0.95) if rnd.next() < 0.3 else Color(225 / 255.0, 244 / 255.0, 250 / 255.0, 0.75)
		var gx: float = x0 + 6.0 + rnd.next() * (x1 - x0 - 12.0)
		var gy: float = y0 + 6.0 + rnd.next() * (y1 - y0 - 12.0)
		var gw: float = 2.0 + roundf(rnd.next() * 3.0)
		out.append({"rect": Rect2(gx, gy, gw, 1.0), "color": color})
	return out


## Points le long des bords côté terre, tous les `step` pixels (along du web).
func _along(edges: Array[PackedFloat32Array], step: float) -> Array[Vector2]:
	var out: Array[Vector2] = []
	for e: PackedFloat32Array in edges:
		var a: Vector2 = Vector2(e[0], e[1])
		var b: Vector2 = Vector2(e[2], e[3])
		var length: float = a.distance_to(b)
		var d: float = 0.0
		while d <= length:
			out.append(a + (b - a) * (d / length))
			d += step
	return out


func _paint_strokes(c: Layer, strokes: Array[Dictionary]) -> void:
	for s: Dictionary in strokes:
		if s.has("rect"):
			c.draw_rect(s["rect"], s["color"])
		elif s.has("disc"):
			c.draw_circle(s["disc"], float(s["r"]), s["color"])
		elif s.has("ellipse"):
			_ellipse(c, s["ellipse"], float(s["rx"]), float(s["ry"]), s["color"])
		elif s.has("arc"):
			var p: Vector2 = s["arc"]
			var points: PackedVector2Array = []
			for i: int in range(7):
				var t: float = i / 6.0
				# Courbe quadratique (x, y) → (x + 4, y − 3) → (x + 8, y).
				points.append(Vector2(p.x + 8.0 * t, p.y - 6.0 * t * (1.0 - t)))
			c.draw_polyline(points, s["color"], 1.5)
		elif s.has("gradient"):
			_paint_water_gradient(c, s["gradient"], str(s["from"]))


## Eau : trois teintes du lac (côté lac) vers la terre, comme le dégradé du web.
func _paint_water_gradient(c: Layer, r: Rect2, from_side: String) -> void:
	var stops: Array[Color] = [
		Color(82 / 255.0, 127 / 255.0, 135 / 255.0, 0.97),
		Color(92 / 255.0, 140 / 255.0, 150 / 255.0, 0.95),
		Color(110 / 255.0, 160 / 255.0, 168 / 255.0, 0.93),
	]
	var ts: Array[float] = [0.0, 0.6, 1.0]
	for i: int in range(2):
		var a: float = ts[i]
		var b: float = ts[i + 1]
		var quad: PackedVector2Array
		var colors: PackedColorArray
		match from_side:
			"left":
				quad = [Vector2(r.position.x + r.size.x * a, r.position.y), Vector2(r.position.x + r.size.x * b, r.position.y),
					Vector2(r.position.x + r.size.x * b, r.end.y), Vector2(r.position.x + r.size.x * a, r.end.y)]
				colors = [stops[i], stops[i + 1], stops[i + 1], stops[i]]
			"right":
				quad = [Vector2(r.end.x - r.size.x * a, r.position.y), Vector2(r.end.x - r.size.x * b, r.position.y),
					Vector2(r.end.x - r.size.x * b, r.end.y), Vector2(r.end.x - r.size.x * a, r.end.y)]
				colors = [stops[i], stops[i + 1], stops[i + 1], stops[i]]
			"top":
				quad = [Vector2(r.position.x, r.position.y + r.size.y * a), Vector2(r.end.x, r.position.y + r.size.y * a),
					Vector2(r.end.x, r.position.y + r.size.y * b), Vector2(r.position.x, r.position.y + r.size.y * b)]
				colors = [stops[i], stops[i], stops[i + 1], stops[i + 1]]
			_:
				quad = [Vector2(r.position.x, r.end.y - r.size.y * a), Vector2(r.end.x, r.end.y - r.size.y * a),
					Vector2(r.end.x, r.end.y - r.size.y * b), Vector2(r.position.x, r.end.y - r.size.y * b)]
				colors = [stops[i], stops[i], stops[i + 1], stops[i + 1]]
		c.draw_polygon(quad, colors)


# --- Pluie, flaques et ronds d'eau ---------------------------------------------

## Pluie : gouttes inclinées qui tombent, voile sombre pendant l'averse.
func _set_rain(level: String) -> void:
	if level == _rain_level:
		return
	_rain_level = level
	var count: int = 170 if level == "storm" else 45 if level == "drizzle" else 0
	while _drops.size() < count:
		_drops.append({"x": randf() * (_size.x + 40.0) - 20.0, "y": randf() * _size.y, "v": 520.0 + randf() * 260.0,
			"alpha": 0.35 + randf() * 0.4, "scale": 0.8 + randf() * 0.6})
	_rain_visible = count
	var shade: float = 0.22 if level == "storm" else 0.07 if level == "drizzle" else 0.0
	_rain_shade.create_tween().tween_property(_rain_shade, "modulate:a", shade, 1.5)
	_set_puddles(level)
	_sky.queue_redraw()


func _update_rain(delta: float) -> void:
	if _rain_visible == 0:
		return
	var dt: float = minf(delta, 0.05)
	var drift: float = tan(deg_to_rad(RAIN_ANGLE_DEG))
	for i: int in range(_rain_visible):
		var d: Dictionary = _drops[i]
		d["y"] = float(d["y"]) + float(d["v"]) * dt
		d["x"] = float(d["x"]) - float(d["v"]) * dt * drift
		if float(d["y"]) > _size.y + 14.0:
			d["y"] = -14.0
			d["x"] = randf() * (_size.x + 40.0) - 20.0
		if float(d["x"]) < -20.0:
			d["x"] = float(d["x"]) + _size.x + 40.0


## Flaques : parsèment la route et les abords quand il pleut (à moitié sous la
## bruine, franches sous l'averse), puis sèchent lentement.
func _set_puddles(level: String) -> void:
	if _puddles == null:
		if level == "none":
			return
		_build_puddles()
	_puddle_level = level
	var target: float = (1.0 if level == "storm" else 0.55 if level == "drizzle" else 0.0) * PUDDLE_VEIL
	_puddles.create_tween().tween_property(_puddles, "modulate:a", target, 6.0 if level == "none" else 3.0) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


func _build_puddles() -> void:
	var rnd: Lcg = Lcg.new(7331)
	var lake: Rect2i = _layout.lake_rect()
	var gates: Array[Vector2i] = _layout.lane_starts()
	gates.append(_layout.castle)
	var cells: Array[Vector2i] = []
	var tries: int = 0
	while cells.size() < 34 and tries < 600:
		tries += 1
		var x: int = floori(rnd.next() * _layout.width)
		var y: int = TOP_RESERVED_ROWS + floori(rnd.next() * (_layout.height - TOP_RESERVED_ROWS))
		var cell: Vector2i = Vector2i(x, y)
		var road: bool = _layout.is_corridor(cell)
		if not road and not _layout.is_buildable(cell):
			continue # zones mortes : arbres
		if not road and rnd.next() < 0.6:
			continue # surtout dans les ornières
		if lake.has_area() and lake.has_point(cell):
			continue
		if _season == "SPRING" and _layout.is_bank(cell):
			continue
		if gates.any(func(g: Vector2i) -> bool: return maxi(absi(g.x - x), absi(g.y - y)) <= 1):
			continue
		if cells.any(func(c: Vector2i) -> bool: return absi(c.x - x) + absi(c.y - y) < 2):
			continue
		cells.append(cell)
	var strokes: Array[Dictionary] = []
	var water: Color = Color(122 / 255.0, 136 / 255.0, 130 / 255.0, 0.78) if _season == "AUTUMN" else Color(112 / 255.0, 152 / 255.0, 170 / 255.0, 0.8)
	for c: Vector2i in cells:
		var px: float = c.x * CELL + 10.0 + rnd.next() * 20.0
		var py: float = c.y * CELL + 12.0 + rnd.next() * 16.0
		var rw: float = 9.0 + rnd.next() * 10.0
		var rh: float = 4.0 + rnd.next() * 3.0
		var lobes: Array[Vector3] = [Vector3(0, 0, 1), Vector3(rw * 0.55, rh * 0.4, 0.6), Vector3(-rw * 0.5, -rh * 0.3, 0.55)]
		_puddle_spots.append({"pos": Vector2(px, py), "rw": rw, "rh": rh})
		for l: Vector3 in lobes: # terre mouillée
			strokes.append({"ellipse": Vector2(px + l.x, py + l.y), "rx": rw * l.z + 3.0, "ry": rh * l.z + 2.0, "color": Color(46 / 255.0, 58 / 255.0, 52 / 255.0, 0.5)})
		for l: Vector3 in lobes: # eau : reflet du ciel (troublée en automne)
			strokes.append({"ellipse": Vector2(px + l.x, py + l.y), "rx": rw * l.z, "ry": rh * l.z, "color": water})
		strokes.append({"rect": Rect2(px - rw * 0.45, py - rh * 0.4, rw * 0.5, 1.5), "color": Color(214 / 255.0, 236 / 255.0, 244 / 255.0, 0.65)})
	_puddles = _layer("PuddleSpots", _paint_strokes.bind(strokes), _puddle_root)
	_puddles.modulate.a = 0.0


## Ronds de pluie : sur l'eau de crue (toutes les 90 ms) et dans les flaques.
func _update_ripples(delta: float) -> void:
	if not _ripple_cells.is_empty():
		_ripple_clock += delta
		while _ripple_clock >= 0.09:
			_ripple_clock -= 0.09
			var cell: Vector2i = _ripple_cells[randi() % _ripple_cells.size()]
			_ripples.append({"pos": Vector2(cell.x * CELL + 6.0 + randf() * (CELL - 12.0), cell.y * CELL + 9.0 + randf() * (CELL - 18.0)),
				"since": _time, "s0": 0.3, "s1": 1.5, "a0": 0.9, "dur": 0.65})
			if _ripples.size() > 16:
				_ripples.pop_front()
	if _puddle_level != "none" and not _puddle_spots.is_empty():
		var period: float = 0.11 if _puddle_level == "storm" else 0.32
		_puddle_clock += delta
		while _puddle_clock >= period:
			_puddle_clock -= period
			var spot: Dictionary = _puddle_spots[randi() % _puddle_spots.size()]
			var pos: Vector2 = spot["pos"]
			_puddle_ripples.append({"pos": pos + Vector2((randf() - 0.5) * float(spot["rw"]), (randf() - 0.5) * float(spot["rh"])),
				"since": _time, "s0": 0.2, "s1": 0.9, "a0": 0.8 * PUDDLE_VEIL, "dur": 0.52})
			if _puddle_ripples.size() > 12:
				_puddle_ripples.pop_front()
	for list: Array[Dictionary] in [_ripples, _puddle_ripples, _bounces]:
		list.assign(list.filter(func(r: Dictionary) -> bool: return _time - float(r["since"]) < float(r["dur"])))


## Effets de sol animés : ronds de pluie, rebonds de grêle, ronds d'eau des tours.
func _paint_ground_fx(c: Layer) -> void:
	for r: Dictionary in _puddle_ripples + _ripples:
		var t: float = _ease_out_quad((_time - float(r["since"])) / float(r["dur"]))
		var s: float = lerpf(float(r["s0"]), float(r["s1"]), t)
		var a: float = lerpf(float(r["a0"]), 0.0, t)
		_ellipse(c, r["pos"], 7.0 * s, 3.0 * s, Color(225 / 255.0, 242 / 255.0, 250 / 255.0, 0.9 * a), false, 1.0)
	for b: Dictionary in _bounces:
		var t: float = _ease_out_quad((_time - float(b["since"])) / float(b["dur"]))
		var pos: Vector2 = (b["pos"] as Vector2) + Vector2(0, -7.0 * t)
		var s: float = lerpf(1.0, 0.6, t)
		var white: Color = Color(1, 1, 1, 1.0 - t)
		c.draw_rect(Rect2(pos + Vector2(-0.5, -1.5) * s, Vector2(1, 3) * s), white)
		c.draw_rect(Rect2(pos + Vector2(-1.5, -0.5) * s, Vector2(3, 1) * s), white)
	for id: String in _wakes:
		var cell: Vector2i = _battle.tower_cell(id) if _battle != null else Vector2i(-1, -1)
		if cell.x < 0:
			continue
		var age: float = _time - float(_wakes[id])
		var alpha: float = clampf(age / 1.2, 0.0, 1.0) * 0.9
		var pulse: float = 0.5 - 0.5 * cos(age * PI / 1.3)
		var scale: Vector2 = Vector2(1.0 + 0.12 * pulse, 1.0 + 0.15 * pulse)
		var center: Vector2 = Vector2(cell.x * CELL + CELL * 0.5, cell.y * CELL + CELL - 1.0 - 5.0)
		_ellipse(c, center, 24.0 * scale.x, 8.0 * scale.y, Color(120 / 255.0, 176 / 255.0, 190 / 255.0, 0.35 * alpha))
		_ellipse(c, center, 23.0 * scale.x, 7.5 * scale.y, Color(236 / 255.0, 248 / 255.0, 252 / 255.0, 0.9 * alpha), false, 1.5)
		_ellipse(c, center, 16.0 * scale.x, 5.0 * scale.y, Color(236 / 255.0, 248 / 255.0, 252 / 255.0, 0.5 * alpha), false, 1.0)


## Tours des berges sous l'eau : rond d'eau qui ondule autour de leur pied.
func _sync_wakes(ids: Array[String]) -> void:
	for id: String in _wakes.keys():
		if not ids.has(id):
			_wakes.erase(id)
	for id: String in ids:
		if not _wakes.has(id):
			_wakes[id] = _time
	_ground_fx.queue_redraw()


# --- Grêle -------------------------------------------------------------------------

## Grêle (printemps) : quelques grêlons l'annoncent, une vraie averse pendant la vague.
func _set_hail(level: String) -> void:
	if level == _hail_level:
		return
	_hail_level = level
	var count: int = 110 if level == "storm" else 16 if level == "light" else 0
	while _stones.size() < count:
		_stones.append({"x": randf() * _size.x, "y": randf() * _size.y, "v": 650.0 + randf() * 250.0,
			"land": 40.0 + randf() * (_size.y - 40.0), "scale": 0.8 + randf() * 0.6})
	_hail_visible = count
	_hail_shade.create_tween().tween_property(_hail_shade, "modulate:a", 0.16 if level == "storm" else 0.0, 1.2)
	_sky.queue_redraw()


func _update_hail(delta: float) -> void:
	if _hail_visible == 0:
		return
	var dt: float = minf(delta, 0.05)
	for i: int in range(_hail_visible):
		var s: Dictionary = _stones[i]
		s["y"] = float(s["y"]) + float(s["v"]) * dt
		if float(s["y"]) >= float(s["land"]):
			if randf() < 0.3:
				_bounces.append({"pos": Vector2(float(s["x"]), float(s["land"])), "since": _time, "dur": 0.28})
				if _bounces.size() > 24:
					_bounces.pop_front()
			s["y"] = -10.0 - randf() * 80.0
			s["x"] = randf() * _size.x
			s["land"] = 40.0 + randf() * (_size.y - 40.0)


# --- Météo (au-dessus des unités) --------------------------------------------------

func _paint_shade(c: Layer, color: Color) -> void:
	c.draw_rect(Rect2(Vector2.ZERO, _size), color)


func _paint_sky(c: Layer) -> void:
	var top: Color = Color(210 / 255.0, 228 / 255.0, 1.0, 0.0)
	var angle: float = deg_to_rad(RAIN_ANGLE_DEG)
	for i: int in range(_rain_visible):
		var d: Dictionary = _drops[i]
		var half: float = 7.0 * float(d["scale"])
		var bottom: Color = Color(210 / 255.0, 228 / 255.0, 1.0, 0.95 * float(d["alpha"]))
		c.draw_set_transform(Vector2(float(d["x"]), float(d["y"])), angle)
		c.draw_polygon([Vector2(-1, -half), Vector2(1, -half), Vector2(1, half), Vector2(-1, half)],
			[top, top, bottom, bottom])
	for i: int in range(_hail_visible):
		var s: Dictionary = _stones[i]
		var k: float = float(s["scale"])
		c.draw_set_transform(Vector2(float(s["x"]), float(s["y"])), 0.0, Vector2(k, k))
		# Grêlon : courte traînée puis bille blanche (texture 4 × 10 du web, centrée).
		var trail: Color = Color(220 / 255.0, 236 / 255.0, 246 / 255.0, 0.7)
		c.draw_polygon([Vector2(-1, -5), Vector2(1, -5), Vector2(1, 2), Vector2(-1, 2)],
			[Color(trail, 0.0), Color(trail, 0.0), trail, trail])
		var bead: Color = Color(200 / 255.0, 222 / 255.0, 236 / 255.0, 0.95)
		c.draw_rect(Rect2(-2, 2, 4, 2), bead)
		c.draw_rect(Rect2(-1, 1, 2, 4), bead)
		c.draw_rect(Rect2(-1, 2, 2, 2), Color.WHITE)
	c.draw_set_transform_matrix(Transform2D.IDENTITY)


# --- Automne : boue ----------------------------------------------------------------

## Boue de la vague : quand ses flaques changent de place, une averse passe quelques
## secondes ; l'ancienne boue s'efface pendant que la nouvelle se forme. Au premier
## affichage, elle est simplement posée.
func _set_mud(cells: Array[Vector2i]) -> void:
	var signature: String = _cells_key(cells)
	if signature == _mud_signature:
		return
	var first: bool = _mud_signature.is_empty() and _mud == null
	_mud_signature = signature
	var old: Layer = _mud
	_mud = null
	if not cells.is_empty():
		var strokes: Array[Dictionary] = _mud_strokes(cells)
		_mud = _layer("MudPatch", _paint_strokes.bind(strokes), _mud_root)
		if not first:
			_mud.modulate.a = 0.0
			_mud.create_tween().tween_property(_mud, "modulate:a", 1.0, 1.8).set_delay(0.9).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	if old != null:
		var fade: Tween = old.create_tween()
		fade.tween_property(old, "modulate:a", 0.0, 1.8).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		fade.tween_callback(old.queue_free)
	if not first:
		# Averse passagère : pluie forte quelques secondes, puis éclaircie.
		_set_rain("storm")
		_shower_left = 4.2


## Une flaque organique par groupe de cases de boue voisines (paintMud du web) :
## bord détrempé, creux humides, reflets, empreintes et feuilles mortes collées.
func _mud_strokes(cells: Array[Vector2i]) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for patch: Array[Vector2i] in _groups(cells):
		var lo: Vector2i = patch[0]
		var hi: Vector2i = patch[0]
		for c: Vector2i in patch:
			lo = Vector2i(mini(lo.x, c.x), mini(lo.y, c.y))
			hi = Vector2i(maxi(hi.x, c.x), maxi(hi.y, c.y))
		var x0: float = lo.x * CELL + 6.0
		var x1: float = (hi.x + 1) * CELL - 6.0
		var y0: float = lo.y * CELL + 6.0
		var y1: float = (hi.y + 1) * CELL - 6.0
		var w: float = x1 - x0
		var h: float = y1 - y0
		var area: float = w * h
		var rnd: Lcg = Lcg.new(int(x0) * 7919 + int(y0) * 104729)
		var at: Callable = func(margin: float) -> Vector2:
			var px: float = x0 + margin + rnd.next() * (w - 2.0 * margin)
			var py: float = y0 + margin + rnd.next() * (h - 2.0 * margin)
			return Vector2(px, py)
		var blobs: Array[Rect2] = []
		var y: float = y0 + 10.0
		while y <= y1 - 10.0:
			var x: float = x0 + 10.0
			while x <= x1 - 10.0:
				var bx: float = x + (rnd.next() - 0.5) * 4.0
				var by: float = y + (rnd.next() - 0.5) * 4.0
				var bw: float = 20.0 + rnd.next() * 12.0
				var bh: float = 18.0 + rnd.next() * 10.0
				blobs.append(Rect2(bx, by, bw, bh))
				x += 9.0
			y += 9.0
		for b: Rect2 in blobs: # bord : terre détrempée
			out.append({"ellipse": b.position, "rx": (b.size.x + 7.0) / 2.0, "ry": (b.size.y + 6.0) / 2.0, "color": Color("3a2718", 0.85)})
		for b: Rect2 in blobs: # boue
			out.append({"ellipse": b.position, "rx": b.size.x / 2.0, "ry": b.size.y / 2.0, "color": Color("573c25")})
		var i: int = 0
		while i < 2.0 + area / 900.0: # creux humides
			var p: Vector2 = at.call(12.0)
			var ew: float = 12.0 + rnd.next() * 16.0
			var eh: float = 7.0 + rnd.next() * 6.0
			out.append({"ellipse": p, "rx": ew / 2.0, "ry": eh / 2.0, "color": Color("432d1b")})
			i += 1
		i = 0
		while i < 2.0 + area / 1300.0: # reflets d'eau stagnante
			var p: Vector2 = at.call(12.0)
			var ew: float = 5.0 + rnd.next() * 7.0
			out.append({"ellipse": p, "rx": ew / 2.0, "ry": 0.8, "color": Color("c2aa86", 0.45)})
			i += 1
		i = 0
		while i < 3.0 + area / 700.0: # empreintes des ennemis
			var p: Vector2 = at.call(8.0)
			out.append({"ellipse": p, "rx": 2.5, "ry": 1.75, "color": Color("2c1d12", 0.8)})
			out.append({"ellipse": p + Vector2(7, 4), "rx": 2.5, "ry": 1.75, "color": Color("2c1d12", 0.8)})
			i += 1
		i = 0
		var leaves: Array[Color] = [Color("c8642a", 0.9), Color("e2a548", 0.9), Color("9a3b1d", 0.9)]
		while i < 2.0 + area / 1000.0: # feuilles mortes collées
			var p: Vector2 = at.call(6.0)
			var leaf: Color = leaves[floori(rnd.next() * 3.0)]
			out.append({"rect": Rect2(roundf(p.x), roundf(p.y), 3, 2), "color": leaf})
			i += 1
	return out


# --- Automne : brume ---------------------------------------------------------------

## Brume : voile blanc sur les cases qu'elle couvre, au-dessus des tours qu'elle
## pénalise ; le chemin n'en garde qu'un léger voile. Peinte en basse résolution puis
## agrandie avec lissage, en deux couches qui dérivent en sens contraires.
func _set_fog(cells: Array[Vector2i]) -> void:
	_current_fog.clear()
	for c: Vector2i in cells:
		_current_fog[c] = true
	var visible: Array[Vector2i] = cells.filter(func(c: Vector2i) -> bool: return not _layout.is_corridor(c))
	var signature: String = _cells_key(visible)
	if signature == _fog_signature:
		return
	_fog_signature = signature
	var old: Array[Sprite2D] = _fog_sprites.duplicate()
	_fog_sprites.clear()
	if not visible.is_empty():
		var texture: ImageTexture = ImageTexture.create_from_image(_fog_image(visible))
		var drifts: Array[Dictionary] = [
			{"alpha": 0.42, "from": Vector2(-6, 0), "to": Vector2(6, 0), "duration": 7.0},
			{"alpha": 0.26, "from": Vector2(6, -4), "to": Vector2(-6, 4), "duration": 9.5},
		]
		for drift: Dictionary in drifts:
			var sprite: Sprite2D = Sprite2D.new()
			sprite.texture = texture
			sprite.centered = false
			sprite.scale = Vector2(FOG_SCALE, FOG_SCALE)
			sprite.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
			sprite.modulate.a = 0.0
			sprite.position = drift["from"]
			_fog_root.add_child(sprite)
			sprite.create_tween().tween_property(sprite, "modulate:a", float(drift["alpha"]), 1.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
			var move: Tween = sprite.create_tween().set_loops()
			move.tween_property(sprite, "position", drift["to"], float(drift["duration"])).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
			move.tween_property(sprite, "position", drift["from"], float(drift["duration"])).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
			_fog_sprites.append(sprite)
	for sprite: Sprite2D in old:
		var fade: Tween = sprite.create_tween()
		fade.tween_property(sprite, "modulate:a", 0.0, 1.4).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		fade.tween_callback(sprite.queue_free)


## Nappe de brume : taches radiales sur chaque case, trouées au hasard, presque
## effacée sur le chemin (setFog du web, même découpage en quart de résolution).
func _fog_image(cells: Array[Vector2i]) -> Image:
	var cs: float = CELL / FOG_SCALE
	var w: int = int(_size.x / FOG_SCALE)
	var h: int = int(_size.y / FOG_SCALE)
	var alpha: PackedFloat32Array = PackedFloat32Array()
	alpha.resize(w * h)
	for c: Vector2i in cells:
		_fog_blob(alpha, w, h, Vector2((c.x + 0.5) * cs, (c.y + 0.5) * cs), cs * 0.95, 1.0, false)
	for c: Vector2i in cells: # trouées : nappe irrégulière
		if randf() < 0.45:
			_fog_blob(alpha, w, h, Vector2((c.x + randf()) * cs, (c.y + randf()) * cs), cs * (0.4 + randf() * 0.4), 0.5, true)
	for cell: Vector2i in _layout.corridor_cells: # chemin : léger voile seulement
		for py: int in range(int(cell.y * cs), int((cell.y + 1) * cs)):
			for px: int in range(int(cell.x * cs), int((cell.x + 1) * cs)):
				if px < w and py < h:
					alpha[py * w + px] *= 0.25
	var image: Image = Image.create(w, h, false, Image.FORMAT_RGBA8)
	for py: int in range(h):
		for px: int in range(w):
			image.set_pixel(px, py, Color(FOG_COLOR, alpha[py * w + px]))
	return image


## Tache radiale : pleine jusqu'à 55 % du rayon puis fondu ; `erase` la retire.
func _fog_blob(alpha: PackedFloat32Array, w: int, h: int, center: Vector2, radius: float, strength: float, erase: bool) -> void:
	for py: int in range(maxi(0, floori(center.y - radius)), mini(h, ceili(center.y + radius))):
		for px: int in range(maxi(0, floori(center.x - radius)), mini(w, ceili(center.x + radius))):
			var t: float = Vector2(px + 0.5, py + 0.5).distance_to(center) / radius
			if t >= 1.0:
				continue
			var a: float = strength if t <= 0.55 else strength * (1.0 - (t - 0.55) / 0.45)
			var i: int = py * w + px
			alpha[i] = alpha[i] * (1.0 - a) if erase else alpha[i] + a * (1.0 - alpha[i])


# --- Outils --------------------------------------------------------------------

## Groupes de cases voisines (4-connexité), dans l'ordre de la liste reçue.
func _groups(cells: Array[Vector2i]) -> Array[Array]:
	var left: Dictionary = {}
	for c: Vector2i in cells:
		left[c] = true
	var groups: Array[Array] = []
	for c: Vector2i in cells:
		if not left.has(c):
			continue
		left.erase(c)
		var group: Array[Vector2i] = [c]
		var queue: Array[Vector2i] = [c]
		while not queue.is_empty():
			var p: Vector2i = queue.pop_back()
			for d: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
				if left.has(p + d):
					left.erase(p + d)
					group.append(p + d)
					queue.append(p + d)
		groups.append(group)
	return groups


func _cells_key(cells: Array[Vector2i]) -> String:
	var keys: PackedStringArray = []
	for c: Vector2i in cells:
		keys.append("%d,%d" % [c.x, c.y])
	keys.sort()
	return ";".join(keys)


static func _ease_out_quad(t: float) -> float:
	var x: float = clampf(t, 0.0, 1.0)
	return 1.0 - (1.0 - x) * (1.0 - x)


static func _ellipse(c: CanvasItem, center: Vector2, rx: float, ry: float, color: Color, filled: bool = true, width: float = 1.0) -> void:
	var segments: int = clampi(int((rx + ry) * 0.8), 12, 48)
	var points: PackedVector2Array = []
	for i: int in range(segments):
		var a: float = TAU * i / segments
		points.append(center + Vector2(cos(a) * rx, sin(a) * ry))
	if filled:
		c.draw_colored_polygon(points, color)
	else:
		points.append(points[0])
		c.draw_polyline(points, color, width)


static func _rounded_rect(c: CanvasItem, r: Rect2, radius: float, color: Color, filled: bool, width: float = 1.0) -> void:
	var box: StyleBoxFlat = StyleBoxFlat.new()
	box.set_corner_radius_all(int(radius))
	if filled:
		box.bg_color = color
	else:
		box.draw_center = false
		box.border_color = color
		box.set_border_width_all(int(width))
	box.draw(c.get_canvas_item(), r)
