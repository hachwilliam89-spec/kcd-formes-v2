class_name MatchStateDto
extends RefCounted
## Miroir de backend/.../ws/dto/MatchStateResponse.java : état du lobby d'un match
## (reçu sur /user/queue/match à la création ou à la jonction, puis /topic/match/{id}).


class Player:
	extends RefCounted
	var id: String = ""
	var username: String = ""
	var ready: bool = false
	var connected: bool = false


var id: String = ""
## Code à donner aux autres joueurs pour rejoindre.
var code: String = ""
## LOBBY, RUNNING, PAUSED ou FINISHED (MatchStatus).
var status: String = ""
## COOP ou VERSUS.
var mode: String = ""
var max_players: int = 0
## Vrai quand tous les joueurs sont prêts : l'hôte peut démarrer.
var can_start: bool = false
var map_id: String = ""
## Vague atteinte, 0 avant le départ (bilan d'une partie rejointe une fois terminée).
var wave: int = 0
var players: Array[Player] = []


static func from_variant(value: Variant) -> MatchStateDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("id"):
		return null
	var dto: MatchStateDto = MatchStateDto.new()
	dto.id = str(body["id"])
	dto.code = str(body.get("code", ""))
	dto.status = str(body.get("status", ""))
	dto.mode = str(body.get("mode", ""))
	dto.max_players = int(body.get("maxPlayers", 0))
	dto.can_start = bool(body.get("canStart", false))
	var map_value: Variant = body.get("mapId")
	dto.map_id = "desert" if map_value == null else str(map_value)
	dto.wave = int(body.get("wave", 0))
	for item: Variant in DtoParse.array(body.get("players")):
		var raw: Dictionary = DtoParse.dict(item)
		var player: Player = Player.new()
		player.id = str(raw.get("playerId", ""))
		player.username = str(raw.get("username", ""))
		player.ready = bool(raw.get("ready", false))
		player.connected = bool(raw.get("connected", false))
		dto.players.append(player)
	return dto


## Le premier joueur de la liste est l'hôte (créateur du match).
func is_host(player_id: String) -> bool:
	return not players.is_empty() and players[0].id == player_id


func player(player_id: String) -> Player:
	for p: Player in players:
		if p.id == player_id:
			return p
	return null
