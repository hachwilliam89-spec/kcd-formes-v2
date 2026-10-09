class_name UnitCatalog
extends Resource
## Catalogue type d'unité → UnitVisual. Un type inconnu retombe sur `fallback`.

@export var visuals: Array[UnitVisual] = []
@export var fallback: UnitVisual

var _by_type: Dictionary = {}


func get_visual(type: String) -> UnitVisual:
	if _by_type.is_empty():
		for visual: UnitVisual in visuals:
			_by_type[visual.type] = visual
	return _by_type.get(type, fallback)
