class_name SendSpecDto
extends RefCounted
## Miroir de backend/.../web/dto/SendSpecResponse.java : un envoi du versus
## (GET /api/v1/versus/sends), du moins cher au plus cher.

var type: String = ""
var cost: int = 0
## Revenu passif ajouté à l'envoyeur, par vague.
var income: int = 0


static func list_from(value: Variant) -> Array[SendSpecDto]:
	var out: Array[SendSpecDto] = []
	for item: Variant in DtoParse.array(value):
		var body: Dictionary = DtoParse.dict(item)
		if not body.has("type"):
			continue
		var dto: SendSpecDto = SendSpecDto.new()
		dto.type = str(body["type"])
		dto.cost = int(body.get("cost", 0))
		dto.income = int(body.get("income", 0))
		out.append(dto)
	return out
