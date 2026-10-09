class_name TowerSpecDto
extends RefCounted
## Miroir de backend/.../web/dto/TowerSpecResponse.java (GET /api/v1/towers).
##
## Valeurs du domaine : le client les affiche, il ne les recalcule jamais
## (docs/CLIENT_GODOT.md §3, règle 7). Le serveur revalide tout à la pose.


## Caractéristiques à un niveau donné.
class Level:
	extends RefCounted
	var level: int = 1
	var damage: int = 0
	var range_cells: float = 0.0
	var max_hp: int = 0
	## Prix du niveau suivant, 0 au niveau max.
	var upgrade_cost: int = 0


var type: String = ""
var cost: int = 0
var damage_type: String = ""
var attack_speed: float = 0.0
var splash_radius: float = 0.0
var heavy_target_multiplier: float = 1.0
## Meilleure vague du compte requise (bestWave de /players/me), 0 = d'office.
var unlock_wave: int = 0
## Se pose sur le couloir des ennemis (Mur) au lieu des cases constructibles.
var on_corridor: bool = false
## Nombre maximum posé en même temps sur la carte, 0 = illimité.
var max_count: int = 0
var levels: Array[Level] = []


static func from_variant(value: Variant) -> TowerSpecDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("type"):
		return null
	var dto: TowerSpecDto = TowerSpecDto.new()
	dto.type = str(body["type"])
	dto.cost = int(body.get("cost", 0))
	dto.damage_type = str(body.get("damageType", ""))
	dto.attack_speed = float(body.get("attackSpeed", 0.0))
	dto.splash_radius = float(body.get("splashRadius", 0.0))
	dto.heavy_target_multiplier = float(body.get("heavyTargetMultiplier", 1.0))
	dto.unlock_wave = int(body.get("unlockWave", 0))
	dto.on_corridor = str(body.get("placement", "")) == "ON_CORRIDOR"
	dto.max_count = int(body.get("maxCount", 0))
	for item: Variant in DtoParse.array(body.get("levels")):
		var raw: Dictionary = DtoParse.dict(item)
		var stats: Level = Level.new()
		stats.level = int(raw.get("level", 1))
		stats.damage = int(raw.get("damage", 0))
		stats.range_cells = float(raw.get("range", 0.0))
		stats.max_hp = int(raw.get("maxHp", 0))
		stats.upgrade_cost = int(raw.get("upgradeCost", 0))
		dto.levels.append(stats)
	return dto


static func list_from(value: Variant) -> Array[TowerSpecDto]:
	var specs: Array[TowerSpecDto] = []
	for item: Variant in DtoParse.array(value):
		var spec: TowerSpecDto = from_variant(item)
		if spec != null:
			specs.append(spec)
	return specs


## Stats au niveau donné (borné aux niveaux connus) ; null si le catalogue n'en donne aucun.
func level(n: int) -> Level:
	if levels.is_empty():
		return null
	return levels[clampi(n - 1, 0, levels.size() - 1)]


## Lecture du déblocage renvoyé par le serveur (qui refuse de toute façon une tour verrouillée).
func is_unlocked(best_wave: int) -> bool:
	return best_wave >= unlock_wave
