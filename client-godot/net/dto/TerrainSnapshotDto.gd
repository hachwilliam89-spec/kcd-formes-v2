class_name TerrainSnapshotDto
extends RefCounted
## Miroir de SeasonalTerrain.Snapshot (backend) : état saisonnier d'un tick, porté
## par chaque tick d'une vague solo (WaveResponse) et par chaque snapshot live.

var flooded: bool = false
## Bancs de brume (automne).
var fog: Array[Vector2i] = []
## Flaques de boue (automne).
var mud: Array[Vector2i] = []
## Tours suspendues par la crue (pieds dans l'eau).
var disabled_towers: Array[String] = []
var fogged_towers: Array[String] = []
## Berges noyées par la crue en cours (printemps).
var flood: Array[Vector2i] = []
var hail: bool = false


static func from_variant(value: Variant) -> TerrainSnapshotDto:
	if not value is Dictionary:
		return null
	var body: Dictionary = value
	var dto: TerrainSnapshotDto = TerrainSnapshotDto.new()
	dto.flooded = bool(body.get("flooded", false))
	dto.fog = DtoParse.cells(body.get("fog"))
	dto.mud = DtoParse.cells(body.get("mud"))
	dto.disabled_towers = DtoParse.strings(body.get("disabledTowers"))
	dto.fogged_towers = DtoParse.strings(body.get("foggedTowers"))
	dto.flood = DtoParse.cells(body.get("flood"))
	dto.hail = bool(body.get("hail", false))
	return dto
