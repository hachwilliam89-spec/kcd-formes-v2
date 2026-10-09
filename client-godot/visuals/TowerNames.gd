class_name TowerNames
extends RefCounted
## Libellés affichés des tours (présentation uniquement ; les types et les
## valeurs viennent de l'API, GET /api/v1/towers).

const LABELS: Dictionary = {
	"ARCHER": "Archer",
	"MAGE": "Mage",
	"CATAPULT": "Catapulte",
	"BALLISTA": "Baliste",
	"WALL": "Mur",
}

## Version courte pour les boutons de la barre de construction.
const SHORT: Dictionary = {
	"CATAPULT": "Catap.",
}


static func label(type: String) -> String:
	return str(LABELS.get(type, type))


static func short(type: String) -> String:
	return str(SHORT.get(type, label(type)))
