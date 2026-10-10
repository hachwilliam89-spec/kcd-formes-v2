class_name VersusViewDto
extends RefCounted
## Miroir de backend/.../ws/dto/VersusPlayerView.java : état d'un duel ADRESSÉ À
## UN joueur, diffusé à chaque tick sur /topic/match/{id}/player/{playerId} :
## son plateau complet + un résumé de l'adversaire (aperçu de sa grille).


## Repère de l'aperçu adverse : ennemi (position en cases) ou tour (case).
class Blip:
	extends RefCounted
	var pos: Vector2 = Vector2.ZERO
	var type: String = ""


class Opponent:
	extends RefCounted
	var player_id: String = ""
	var username: String = ""
	var wave: int = 0
	var gold: int = 0
	var castle_hp: int = 0
	var castle_max_hp: int = 100
	## Ennemis tués.
	var score: int = 0
	var defeated: bool = false
	var enemies: Array[Blip] = []
	var towers: Array[Blip] = []


## RUNNING ou FINISHED (MatchStatus).
var status: String = ""
## Vide tant que le duel n'est pas fini.
var winner_id: String = ""
## Mon plateau (null avant le départ).
var board: MatchSnapshotDto
## Mon revenu passif par vague (grossit avec mes envois).
var income: int = 0
## Mes ennemis tués.
var score: int = 0
var defeated: bool = false
var opponent: Opponent


static func from_variant(value: Variant) -> VersusViewDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("status"):
		return null
	var dto: VersusViewDto = VersusViewDto.new()
	dto.status = str(body["status"])
	var winner: Variant = body.get("winnerId")
	dto.winner_id = "" if winner == null else str(winner)
	dto.board = MatchSnapshotDto.from_variant(body.get("board"))
	dto.income = int(body.get("income", 0))
	dto.score = int(body.get("score", 0))
	dto.defeated = bool(body.get("defeated", false))
	var raw: Dictionary = DtoParse.dict(body.get("opponent"))
	if not raw.is_empty():
		var opp: Opponent = Opponent.new()
		opp.player_id = str(raw.get("playerId", ""))
		opp.username = str(raw.get("username", ""))
		opp.wave = int(raw.get("wave", 0))
		opp.gold = int(raw.get("gold", 0))
		opp.castle_hp = int(raw.get("castleHp", 0))
		opp.castle_max_hp = int(raw.get("castleMaxHp", 100))
		opp.score = int(raw.get("score", 0))
		opp.defeated = bool(raw.get("defeated", false))
		opp.enemies = _blips(raw.get("enemies"))
		opp.towers = _blips(raw.get("towers"))
		dto.opponent = opp
	return dto


static func _blips(value: Variant) -> Array[Blip]:
	var out: Array[Blip] = []
	for item: Variant in DtoParse.array(value):
		var raw: Dictionary = DtoParse.dict(item)
		var blip: Blip = Blip.new()
		blip.pos = Vector2(float(raw.get("x", 0.0)), float(raw.get("y", 0.0)))
		blip.type = str(raw.get("type", ""))
		out.append(blip)
	return out
