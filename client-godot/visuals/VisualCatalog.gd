class_name VisualCatalog
extends Resource
## Catalogue des visuels du combat : tours, ennemis, effets. Une refonte
## graphique remplace ce catalogue (et les assets), pas le code de jeu.

@export var towers: Array[TowerVisual] = []
@export var enemies: Array[EnemyVisual] = []
@export var effects: Array[EffectVisual] = []
@export var fallback_tower: TowerVisual
@export var fallback_enemy: EnemyVisual

var _towers: Dictionary = {}
var _enemies: Dictionary = {}
var _effects: Dictionary = {}


func tower(type: String) -> TowerVisual:
	if _towers.is_empty():
		for visual: TowerVisual in towers:
			_towers[visual.type] = visual
	return _towers.get(type, fallback_tower)


func enemy(type: String) -> EnemyVisual:
	if _enemies.is_empty():
		for visual: EnemyVisual in enemies:
			_enemies[visual.type] = visual
	return _enemies.get(type, fallback_enemy)


## null si la clé est vide ou inconnue.
func effect(key: String) -> EffectVisual:
	if _effects.is_empty():
		for visual: EffectVisual in effects:
			_effects[visual.key] = visual
	return _effects.get(key)
