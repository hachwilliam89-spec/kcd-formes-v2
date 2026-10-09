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


static func _to_cells(value: Variant) -> Array[Vector2i]:
	var cells: Array[Vector2i] = []
	if value is Array:
		for item: Variant in value:
			var cell: Vector2i = _to_cell(item)
			if cell.x >= 0:
				cells.append(cell)
	return cells
