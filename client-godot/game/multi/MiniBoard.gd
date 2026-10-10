class_name MiniBoard
extends Control
## Aperçu de la grille adverse en versus : route, entrées, château (coloré selon
## ses PV), tours et ennemis par type. Reproduit frontend-web MiniBoard.tsx
## (mêmes couleurs et tailles) ; redessiné à chaque état reçu.

const GROUND: Color = Color("#2b3a22")
const ROAD: Color = Color(0.55, 0.42, 0.26)
const SPAWN: Color = Color("#3a7a12")
const OUTLINE: Color = Color("#1a1109")

## Couleurs des tours par type (légende du jeu web).
const TOWER_COLOR: Dictionary = {
	"ARCHER": Color("#5bbd3a"),
	"MAGE": Color("#9a6ce0"),
	"CATAPULT": Color("#e08a3a"),
	"BALLISTA": Color("#c7cdd4"),
	"WALL": Color("#9a8560"),
}
## Ennemis : couleur et rayon (en cases) ; les grosses menaces ressortent.
const ENEMY_STYLE: Dictionary = {
	"GOBLIN": [Color("#84cc16"), 0.26],
	"ORC": [Color("#c2792e"), 0.32],
	"SAPEUR": [Color("#e0483f"), 0.30],
	"TROLL": [Color("#9aa3b0"), 0.42],
	"DARK_KNIGHT": [Color("#6b5bd8"), 0.40],
	"CHARIOT": [Color("#3bb0e0"), 0.44],
	"BOSS_WARLORD": [Color("#eab308"), 0.60],
}
const ENEMY_DEFAULT: Array = [Color("#d64545"), 0.30]

var _layout: MapLayoutDto
var _opponent: VersusViewDto.Opponent


func setup(layout: MapLayoutDto) -> void:
	_layout = layout
	queue_redraw()


func show_opponent(opponent: VersusViewDto.Opponent) -> void:
	_opponent = opponent
	queue_redraw()


func _draw() -> void:
	if _layout == null or _layout.width <= 0 or _layout.height <= 0:
		return
	var cell: float = minf(size.x / _layout.width, size.y / _layout.height)
	var origin: Vector2 = ((size - Vector2(_layout.width, _layout.height) * cell) * 0.5).floor()
	draw_rect(Rect2(origin, Vector2(_layout.width, _layout.height) * cell), GROUND)
	for c: Vector2i in _layout.corridor_cells:
		draw_rect(Rect2(origin + Vector2(c) * cell, Vector2(cell, cell)), ROAD)
	for s: Vector2i in _layout.spawns:
		draw_circle(origin + (Vector2(s) + Vector2(0.5, 0.5)) * cell, cell * 0.5, SPAWN)
	var ratio: float = 1.0
	if _opponent != null and _opponent.castle_max_hp > 0:
		ratio = clampf(float(_opponent.castle_hp) / _opponent.castle_max_hp, 0.0, 1.0)
	var castle_color: Color = Color("#5bbd3a") if ratio > 0.5 else (Color("#eab308") if ratio > 0.25 else Color("#d64545"))
	var castle_rect: Rect2 = Rect2(origin + (Vector2(_layout.castle) - Vector2(0.5, 0.5)) * cell, Vector2(2, 2) * cell)
	draw_rect(castle_rect, castle_color)
	draw_rect(castle_rect, OUTLINE, false, maxf(1.0, cell * 0.15))
	if _opponent == null:
		return
	for tower: VersusViewDto.Blip in _opponent.towers:
		var rect: Rect2 = Rect2(origin + (tower.pos + Vector2(0.12, 0.12)) * cell, Vector2(0.76, 0.76) * cell)
		draw_rect(rect, TOWER_COLOR.get(tower.type, Color("#cccccc")))
	for enemy: VersusViewDto.Blip in _opponent.enemies:
		var style: Array = ENEMY_STYLE.get(enemy.type, ENEMY_DEFAULT)
		draw_circle(origin + (enemy.pos + Vector2(0.5, 0.5)) * cell, float(style[1]) * cell, style[0])
