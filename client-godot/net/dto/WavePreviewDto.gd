class_name WavePreviewDto
extends RefCounted
## Miroir de backend/.../web/dto/WavePreviewResponse.java (GET /api/v1/games/{id}/waves/next) :
## aperçu de la prochaine vague — types présents (pas les effectifs), ceux jamais
## croisés dans la partie, Boss, annonce saisonnière.

var wave_number: int = 0
var enemy_types: Array[String] = []
var new_enemy_types: Array[String] = []
var boss_wave: bool = false
## Null hors printemps / automne.
var terrain: TerrainForecastDto


static func from_variant(value: Variant) -> WavePreviewDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("waveNumber"):
		return null
	var dto: WavePreviewDto = WavePreviewDto.new()
	dto.wave_number = int(body["waveNumber"])
	dto.enemy_types = DtoParse.strings(body.get("enemyTypes"))
	dto.new_enemy_types = DtoParse.strings(body.get("newEnemyTypes"))
	dto.boss_wave = bool(body.get("bossWave", false))
	dto.terrain = TerrainForecastDto.from_variant(body.get("terrain"))
	return dto


## Nouveautés à signaler : à la vague 1, tout est nouveau et le dire n'apprend rien.
func is_new(type: String) -> bool:
	return wave_number > 1 and new_enemy_types.has(type)
