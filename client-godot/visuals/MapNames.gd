class_name MapNames
extends RefCounted
## Libellés affichés des cartes (présentation uniquement ; les ids viennent de l'API).

const LABELS: Dictionary = {
	"desert": "Le Désert",
	"fourche": "La Fourche",
	"spring": "Les Jardins (printemps)",
	"autumn": "Le Val (automne)",
}


static func label(map_id: String) -> String:
	return str(LABELS.get(map_id, map_id))
