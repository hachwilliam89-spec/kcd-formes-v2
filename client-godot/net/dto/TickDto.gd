class_name TickDto
extends RefCounted
## Un tick de vague tel que simulé par le serveur (WaveResponse.TickResponse).
## Champs pas encore exploités par le client (siège, boss, terrain…) : à ajouter
## ici quand une vue en aura besoin.

var tick: int = 0
var enemies: Array[EnemyStateDto] = []
var hits: Array[HitDto] = []
var deaths: Array[String] = []
var reached_castle: Array[String] = []
var destroyed_towers: Array[String] = []
var castle_hp: int = 0


static func from_variant(value: Variant) -> TickDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("tick"):
		return null
	var dto: TickDto = TickDto.new()
	dto.tick = int(body["tick"])
	for item: Variant in DtoParse.array(body.get("enemies")):
		var enemy: EnemyStateDto = EnemyStateDto.from_variant(item)
		if enemy != null:
			dto.enemies.append(enemy)
	dto.hits = HitDto.list_from(body.get("damageEvents"))
	dto.deaths = DtoParse.strings(body.get("deaths"))
	dto.reached_castle = DtoParse.strings(body.get("reachedCastle"))
	dto.destroyed_towers = DtoParse.strings(body.get("destroyedTowers"))
	dto.castle_hp = int(body.get("castleHp", 0))
	return dto
