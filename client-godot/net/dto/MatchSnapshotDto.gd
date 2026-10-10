class_name MatchSnapshotDto
extends RefCounted
## Miroir de backend/.../ws/dto/MatchSnapshotResponse.java : état d'une partie live,
## diffusé à chaque tick serveur (120 ms) sur /topic/match/{id}/state.


## Tir d'une tour vers un ennemi pendant le tick (positions en cases).
class Shot:
	extends RefCounted
	var from: Vector2 = Vector2.ZERO
	var to: Vector2 = Vector2.ZERO


## Tour posée, telle que le snapshot la décrit (type, case, niveau).
class TowerView:
	extends RefCounted
	var id: String = ""
	var type: String = ""
	var cell: Vector2i = Vector2i(-1, -1)
	var level: int = 1


var tick: int = 0
var wave: int = 0
var gold: int = 0
var castle_hp: int = 0
var castle_max_hp: int = 0
## Bonus gagnés en attente de choix (or partagé en coop).
var pending_bonuses: int = 0
## Options proposées (libellés du serveur), vide tant qu'aucun bonus n'attend.
var bonus_options: Array[BonusOptionDto] = []
var status: String = ""
var enemies: Array[EnemyStateDto] = []
var towers: Array[TowerView] = []
var shots: Array[Shot] = []


static func from_variant(value: Variant) -> MatchSnapshotDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("tick"):
		return null
	var dto: MatchSnapshotDto = MatchSnapshotDto.new()
	dto.tick = int(body["tick"])
	dto.wave = int(body.get("wave", 0))
	dto.gold = int(body.get("gold", 0))
	dto.castle_hp = int(body.get("castleHp", 0))
	dto.castle_max_hp = int(body.get("castleMaxHp", 0))
	dto.pending_bonuses = int(body.get("pendingBonuses", 0))
	dto.bonus_options = BonusOptionDto.list_from(body.get("bonusOptions"))
	dto.status = str(body.get("status", ""))
	for item: Variant in DtoParse.array(body.get("enemies")):
		var enemy: EnemyStateDto = EnemyStateDto.from_variant(item)
		if enemy != null:
			dto.enemies.append(enemy)
	for item: Variant in DtoParse.array(body.get("towers")):
		var raw: Dictionary = DtoParse.dict(item)
		var tower: TowerView = TowerView.new()
		tower.id = str(raw.get("id", ""))
		tower.type = str(raw.get("type", ""))
		tower.cell = Vector2i(int(raw.get("x", -1)), int(raw.get("y", -1)))
		tower.level = int(raw.get("level", 1))
		dto.towers.append(tower)
	for item: Variant in DtoParse.array(body.get("shots")):
		var raw: Dictionary = DtoParse.dict(item)
		var shot: Shot = Shot.new()
		shot.from = Vector2(float(raw.get("fromX", 0.0)), float(raw.get("fromY", 0.0)))
		shot.to = Vector2(float(raw.get("toX", 0.0)), float(raw.get("toY", 0.0)))
		dto.shots.append(shot)
	return dto
