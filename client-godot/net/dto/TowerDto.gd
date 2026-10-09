class_name TowerDto
extends RefCounted
## Miroir de backend/.../web/dto/TowerResponse.java.

var id: String = ""
var type: String = ""
var cell: Vector2i = Vector2i(-1, -1)
var level: int = 1
var damage: int = 0
var range_cells: float = 0.0
var damage_type: String = ""
var splash_radius: float = 0.0
var hp: int = 0
var max_hp: int = 0


static func from_variant(value: Variant) -> TowerDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("id"):
		return null
	var dto: TowerDto = TowerDto.new()
	dto.id = str(body["id"])
	dto.type = str(body.get("type", ""))
	dto.cell = Vector2i(int(body.get("x", -1)), int(body.get("y", -1)))
	dto.level = int(body.get("level", 1))
	dto.damage = int(body.get("damage", 0))
	dto.range_cells = float(body.get("range", 0.0))
	dto.damage_type = str(body.get("damageType", ""))
	dto.splash_radius = float(body.get("splashRadius", 0.0))
	dto.hp = int(body.get("hp", 0))
	dto.max_hp = int(body.get("maxHp", 0))
	return dto
