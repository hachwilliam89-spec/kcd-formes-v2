class_name MapLayoutDto
extends RefCounted
## Miroir de backend/.../web/dto/MapLayoutResponse.java (GET /api/v1/maps/{id}).
##
## Données calculées par le domaine : le client ne les recalcule jamais
## (docs/CLIENT_GODOT.md §3, règle 7). `kind_at` ne fait que les relire.

## Nature d'une case, d'après les listes renvoyées par le serveur.
enum CellKind { OUTSIDE, DEAD, ROAD, BUILDABLE, WATER, SPAWN, CASTLE }

var id: String = ""
var width: int = 0
var height: int = 0
var terrain: String = "NONE"
var castle: Vector2i = Vector2i(-1, -1)
var spawns: Array[Vector2i] = []
## Une entrée par voie : Array[Vector2i] case par case, de l'entrée au château.
var lane_paths: Array[Array] = []
var corridor_cells: Array[Vector2i] = []
var buildable_cells: Array[Vector2i] = []
var water_cells: Array[Vector2i] = []
## Berges que la crue peut noyer (printemps), vide ailleurs.
var bank_cells: Array[Vector2i] = []
var seasonal_rules: SeasonalRules = SeasonalRules.new()


## Effets chiffrés des saisons (GetMapLayoutUseCase.SeasonalRules) : affichage
## seulement, le serveur les applique.
class SeasonalRules:
	extends RefCounted
	## Une crue toutes les N vagues (printemps).
	var flood_interval: int = 0
	var mud_speed_factor: float = 1.0
	## Portée perdue par une tour dans la brume (automne).
	var fog_range_penalty: float = 0.0
	var hail_damage_factor: float = 1.0
	var fertile_gold_factor: float = 1.0
	var fog_damage_taken_factor: float = 1.0

# Index pour des lectures en O(1) : Vector2i → true.
var _road: Dictionary = {}
var _buildable: Dictionary = {}
var _water: Dictionary = {}
var _spawn: Dictionary = {}


## Renvoie null si la réponse n'a pas la forme attendue.
static func from_variant(value: Variant) -> MapLayoutDto:
	if not value is Dictionary:
		return null
	var body: Dictionary = value
	var dto: MapLayoutDto = MapLayoutDto.new()
	dto.id = str(body.get("id", ""))
	dto.width = int(body.get("width", 0))
	dto.height = int(body.get("height", 0))
	dto.terrain = str(body.get("terrain", "NONE"))
	dto.castle = _to_cell(body.get("castle"))
	dto.spawns = _to_cells(body.get("spawns"))
	dto.corridor_cells = _to_cells(body.get("corridorCells"))
	dto.buildable_cells = _to_cells(body.get("buildableCells"))
	dto.water_cells = _to_cells(body.get("waterCells"))
	dto.bank_cells = _to_cells(body.get("bankCells"))
	var rules: Dictionary = DtoParse.dict(body.get("seasonalRules"))
	dto.seasonal_rules.flood_interval = int(rules.get("floodInterval", 0))
	dto.seasonal_rules.mud_speed_factor = float(rules.get("mudSpeedFactor", 1.0))
	dto.seasonal_rules.fog_range_penalty = float(rules.get("fogRangePenalty", 0.0))
	dto.seasonal_rules.hail_damage_factor = float(rules.get("hailDamageFactor", 1.0))
	dto.seasonal_rules.fertile_gold_factor = float(rules.get("fertileGoldFactor", 1.0))
	dto.seasonal_rules.fog_damage_taken_factor = float(rules.get("fogDamageTakenFactor", 1.0))
	var lanes: Variant = body.get("lanePaths")
	if lanes is Array:
		for lane: Variant in lanes:
			dto.lane_paths.append(_to_cells(lane))
	if dto.id.is_empty() or dto.width <= 0 or dto.height <= 0 or not dto.contains(dto.castle):
		return null
	dto._index()
	return dto


func contains(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < width and cell.y < height


func kind_at(cell: Vector2i) -> CellKind:
	if not contains(cell):
		return CellKind.OUTSIDE
	if cell == castle:
		return CellKind.CASTLE
	if _spawn.has(cell):
		return CellKind.SPAWN
	if _water.has(cell):
		return CellKind.WATER
	if _road.has(cell):
		return CellKind.ROAD
	if _buildable.has(cell):
		return CellKind.BUILDABLE
	return CellKind.DEAD


func is_buildable(cell: Vector2i) -> bool:
	return _buildable.has(cell)


## Case du couloir des ennemis : la seule zone où se pose le Mur.
func is_corridor(cell: Vector2i) -> bool:
	return _road.has(cell)


func size() -> Vector2i:
	return Vector2i(width, height)


## Berge inondable (printemps).
func is_bank(cell: Vector2i) -> bool:
	return bank_cells.has(cell)


## Rectangle du lac (cases d'eau), vide sans eau.
func lake_rect() -> Rect2i:
	if water_cells.is_empty():
		return Rect2i()
	var box: Rect2i = Rect2i(water_cells[0], Vector2i.ONE)
	for cell: Vector2i in water_cells:
		box = box.expand(cell).expand(cell + Vector2i.ONE)
	return box


## Entrées des voies (départ de chaque chemin).
func lane_starts() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for lane: Array in lane_paths:
		if not lane.is_empty():
			out.append(lane[0])
	return out


## Crues annoncées : « 3, 6, 9… » (floodWavesLabel du web).
func flood_waves_label() -> String:
	var n: int = seasonal_rules.flood_interval
	return "%d, %d, %d…" % [n, 2 * n, 3 * n] if n > 0 else "—"


func _index() -> void:
	for cell: Vector2i in corridor_cells:
		_road[cell] = true
	for cell: Vector2i in buildable_cells:
		_buildable[cell] = true
	for cell: Vector2i in water_cells:
		_water[cell] = true
	for cell: Vector2i in spawns:
		_spawn[cell] = true


static func _to_cell(value: Variant) -> Vector2i:
	if value is Dictionary:
		var d: Dictionary = value
		if d.has("x") and d.has("y"):
			return Vector2i(int(d["x"]), int(d["y"]))
	return Vector2i(-1, -1)


## Liste de positions {x, y} du serveur ; les entrées illisibles sont ignorées.
static func _to_cells(value: Variant) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	if value is Array:
		for item: Variant in value:
			var cell: Vector2i = _to_cell(item)
			if cell.x >= 0:
				cells.append(cell)
	return cells
