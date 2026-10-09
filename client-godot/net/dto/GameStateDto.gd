class_name GameStateDto
extends RefCounted
## Miroir de backend/.../web/dto/GameResponse.java (état d'une partie solo).

const STATUS_IN_PROGRESS: String = "IN_PROGRESS"

var game_id: String = ""
var status: String = ""
var wave_number: int = 0
var gold: int = 0
var castle_hp: int = 0
var castle_max_hp: int = 0
var towers: Array[TowerDto] = []
var awaiting_bonus_choice: bool = false
var available_bonuses: Array[BonusOptionDto] = []


static func from_variant(value: Variant) -> GameStateDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("gameId"):
		return null
	var dto: GameStateDto = GameStateDto.new()
	dto.game_id = str(body["gameId"])
	dto.status = str(body.get("status", ""))
	dto.wave_number = int(body.get("waveNumber", 0))
	dto.gold = int(body.get("gold", 0))
	dto.castle_hp = int(body.get("castleHp", 0))
	dto.castle_max_hp = int(body.get("castleMaxHp", 0))
	for item: Variant in DtoParse.array(DtoParse.dict(body.get("map")).get("towers")):
		var tower: TowerDto = TowerDto.from_variant(item)
		if tower != null:
			dto.towers.append(tower)
	dto.awaiting_bonus_choice = bool(body.get("awaitingBonusChoice", false))
	dto.available_bonuses = BonusOptionDto.list_from(body.get("availableBonuses"))
	return dto


func is_over() -> bool:
	return status != STATUS_IN_PROGRESS


func tower_at(cell: Vector2i) -> TowerDto:
	for tower: TowerDto in towers:
		if tower.cell == cell:
			return tower
	return null
