class_name EnemyNames
extends RefCounted
## Libellés affichés des ennemis (présentation uniquement ; les types envoyables,
## leurs coûts et leurs revenus viennent de l'API, GET /api/v1/versus/sends).
## Mêmes noms que le web (frontend-web/app/versus/page.tsx SEND_LABEL).

const LABELS: Dictionary = {
	"GOBLIN": "Gobelin",
	"ORC": "Orc",
	"TROLL": "Troll",
	"SAPEUR": "Sapeur",
	"DARK_KNIGHT": "Chevalier noir",
	"CHARIOT": "Démon de givre",
	"BOSS_WARLORD": "Seigneur de guerre",
}

## Version courte pour les boutons de la barre d'envoi.
const SHORT: Dictionary = {
	"DARK_KNIGHT": "Chev. noir",
	"CHARIOT": "Démon givre",
	"BOSS_WARLORD": "Seigneur",
}


static func label(type: String) -> String:
	return str(LABELS.get(type, type))


static func short(type: String) -> String:
	return str(SHORT.get(type, label(type)))
