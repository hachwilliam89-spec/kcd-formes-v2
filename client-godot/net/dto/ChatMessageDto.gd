class_name ChatMessageDto
extends RefCounted
## Miroir de backend/.../ws/dto/ChatMessageResponse.java : un message du chat de match,
## diffusé sur /topic/match/{id}/chat.

var sender_id: String = ""
var username: String = ""
var text: String = ""
## Horodatage serveur (ms depuis l'epoch).
var ts: int = 0


static func from_variant(value: Variant) -> ChatMessageDto:
	var body: Dictionary = DtoParse.dict(value)
	if not body.has("text"):
		return null
	var dto: ChatMessageDto = ChatMessageDto.new()
	dto.sender_id = str(body.get("senderId", ""))
	dto.username = str(body.get("username", ""))
	dto.text = str(body["text"])
	dto.ts = int(body.get("ts", 0))
	return dto
