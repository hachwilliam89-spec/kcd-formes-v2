class_name BonusOptionDto
extends RefCounted
## Miroir de backend/.../web/dto/BonusOptionResponse.java (libellés fournis par le serveur).

var type: String = ""
var label: String = ""
var description: String = ""


static func list_from(value: Variant) -> Array[BonusOptionDto]:
	var out: Array[BonusOptionDto] = []
	for item: Variant in DtoParse.array(value):
		var body: Dictionary = DtoParse.dict(item)
		if not body.has("type"):
			continue
		var dto: BonusOptionDto = BonusOptionDto.new()
		dto.type = str(body["type"])
		dto.label = str(body.get("label", dto.type))
		dto.description = str(body.get("description", ""))
		out.append(dto)
	return out
