class_name LeaderboardDto
extends RefCounted
## Miroir de backend/.../web/dto/LeaderboardResponse.java (GET /api/v1/leaderboard) :
## le haut du classement par meilleure vague, et le rang du joueur (même hors du top).


class Entry:
	extends RefCounted
	var rank: int = 0
	var username: String = ""
	var best_wave: int = 0


var top: Array[Entry] = []
## Null si le joueur n'est pas classé.
var me: Entry


static func from_variant(value: Variant) -> LeaderboardDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("top"):
		return null
	var dto: LeaderboardDto = LeaderboardDto.new()
	for item: Variant in DtoParse.array(body["top"]):
		dto.top.append(_entry(DtoParse.dict(item)))
	var me: Dictionary = DtoParse.dict(body.get("me"))
	dto.me = _entry(me) if not me.is_empty() else null
	return dto


static func _entry(raw: Dictionary) -> Entry:
	var entry: Entry = Entry.new()
	entry.rank = int(raw.get("rank", 0))
	entry.username = str(raw.get("username", ""))
	entry.best_wave = int(raw.get("bestWave", 0))
	return entry
