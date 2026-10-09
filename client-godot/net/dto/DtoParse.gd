class_name DtoParse
extends RefCounted
## Petits utilitaires de lecture du JSON de l'API (les nombres arrivent en float).


static func dict(value: Variant) -> Dictionary:
	return value if value is Dictionary else {}


static func array(value: Variant) -> Array:
	return value if value is Array else []


static func strings(value: Variant) -> Array[String]:
	var out: Array[String] = []
	for item: Variant in array(value):
		out.append(str(item))
	return out
