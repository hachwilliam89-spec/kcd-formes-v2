class_name EnemyStateDto
extends RefCounted
## Ennemi dans un tick (WaveResponse.EnemyResponse). Position en cases : un entier = centre de la case.

var id: String = ""
var type: String = ""
var pos: Vector2 = Vector2.ZERO
var hp: int = 0
var max_hp: int = 0


static func from_variant(value: Variant) -> EnemyStateDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("id"):
		return null
	var dto: EnemyStateDto = EnemyStateDto.new()
	dto.id = str(body["id"])
	dto.type = str(body.get("type", ""))
	dto.pos = Vector2(float(body.get("x", 0.0)), float(body.get("y", 0.0)))
	dto.hp = int(body.get("hp", 0))
	dto.max_hp = int(body.get("maxHp", 0))
	return dto
