class_name TerrainForecastDto
extends RefCounted
## Miroir de SeasonalTerrain.Forecast (backend) : annonce saisonnière d'une vague à
## venir (aperçu GET /api/v1/games/{id}/waves/next, ou /api/v1/maps/{id}/forecast).

var type: String = ""
var flooded: bool = false
## Berges que la crue noiera (printemps) ou flaques de boue (automne).
var affected_cells: Array[Vector2i] = []
var fog_cells: Array[Vector2i] = []
var hail: bool = false


static func from_variant(value: Variant) -> TerrainForecastDto:
	if not value is Dictionary:
		return null
	var body: Dictionary = value
	var dto: TerrainForecastDto = TerrainForecastDto.new()
	dto.type = str(body.get("type", ""))
	dto.flooded = bool(body.get("flooded", false))
	dto.affected_cells = DtoParse.cells(body.get("affectedCells"))
	dto.fog_cells = DtoParse.cells(body.get("fogCells"))
	dto.hail = bool(body.get("hail", false))
	return dto
