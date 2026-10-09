class_name WaveResultDto
extends RefCounted
## Miroir de backend/.../web/dto/WaveResponse.java : la vague entière, déjà jouée par le serveur.

var number: int = 0
var gold_earned: int = 0
var castle_hp: int = 0
var castle_max_hp: int = 0
var castle_destroyed: bool = false
var game_status: String = ""
var ticks: Array[TickDto] = []
var awaiting_bonus_choice: bool = false
var available_bonuses: Array[BonusOptionDto] = []


static func from_variant(value: Variant) -> WaveResultDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("ticks"):
		return null
	var dto: WaveResultDto = WaveResultDto.new()
	dto.number = int(body.get("number", 0))
	dto.gold_earned = int(body.get("goldEarned", 0))
	dto.castle_hp = int(body.get("castleHp", 0))
	dto.castle_max_hp = int(body.get("castleMaxHp", 0))
	dto.castle_destroyed = bool(body.get("castleDestroyed", false))
	dto.game_status = str(body.get("gameStatus", ""))
	for item: Variant in DtoParse.array(body["ticks"]):
		var tick: TickDto = TickDto.from_variant(item)
		if tick != null:
			dto.ticks.append(tick)
	dto.awaiting_bonus_choice = bool(body.get("awaitingBonusChoice", false))
	dto.available_bonuses = BonusOptionDto.list_from(body.get("availableBonuses"))
	return dto
