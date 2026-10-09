class_name AuthResponseDto
extends RefCounted
## Miroir de backend/.../web/dto/AuthResponse.java.

var token: String = ""
var player_id: String = ""
var username: String = ""


## Renvoie null si la réponse n'a pas la forme attendue.
static func from_variant(value: Variant) -> AuthResponseDto:
	if not value is Dictionary:
		return null
	var body: Dictionary = value
	var dto: AuthResponseDto = AuthResponseDto.new()
	dto.token = str(body.get("token", ""))
	dto.player_id = str(body.get("playerId", ""))
	dto.username = str(body.get("username", ""))
	if dto.token.is_empty() or dto.player_id.is_empty():
		return null
	return dto
