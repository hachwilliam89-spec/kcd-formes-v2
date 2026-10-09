class_name HitDto
extends RefCounted
## Tir d'une tour sur un ennemi pendant un tick (WaveResponse.DamageEventResponse).

var tower_id: String = ""
var enemy_id: String = ""
var damage: int = 0


static func list_from(value: Variant) -> Array[HitDto]:
	var out: Array[HitDto] = []
	for item: Variant in DtoParse.array(value):
		var body: Dictionary = DtoParse.dict(item)
		var hit: HitDto = HitDto.new()
		hit.tower_id = str(body.get("towerId", ""))
		hit.enemy_id = str(body.get("enemyId", ""))
		hit.damage = int(body.get("damage", 0))
		out.append(hit)
	return out
