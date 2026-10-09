class_name MapView
extends Node2D
## Vue provisoire de la carte : cases colorées d'après la disposition du serveur.
##
## Ne contient aucune logique de jeu : elle dessine ce qu'on lui donne
## (show_layout, set_selected). À remplacer par une vue à tuiles/sprites sans
## toucher au contrôleur, tant que l'interface reste la même.

@export var palette: MapPalette

var _layout: MapLayoutDto
var _selected: Vector2i = Vector2i(-1, -1)


func show_layout(layout: MapLayoutDto) -> void:
	_layout = layout
	_selected = Vector2i(-1, -1)
	queue_redraw()


func set_selected(cell: Vector2i) -> void:
	_selected = cell
	queue_redraw()


## Taille de la carte dans l'espace local (avant mise à l'échelle).
func local_size() -> Vector2:
	if _layout == null:
		return Vector2.ZERO
	return Grid.map_size(_layout.size())


func _draw() -> void:
	if _layout == null or palette == null:
		return
	for y: int in range(_layout.height):
		for x: int in range(_layout.width):
			var cell: Vector2i = Vector2i(x, y)
			draw_rect(Grid.cell_rect(cell), _color_for(_layout.kind_at(cell)))
	_draw_grid_lines()
	_draw_lanes()
	if _layout.contains(_selected):
		draw_rect(Grid.cell_rect(_selected).grow(-0.5), palette.selection, false, 1.0)


func _draw_grid_lines() -> void:
	var size: Vector2 = local_size()
	for x: int in range(_layout.width + 1):
		var px: float = x * Grid.CELL_SIZE
		draw_line(Vector2(px, 0), Vector2(px, size.y), palette.grid_line, 1.0)
	for y: int in range(_layout.height + 1):
		var py: float = y * Grid.CELL_SIZE
		draw_line(Vector2(0, py), Vector2(size.x, py), palette.grid_line, 1.0)


func _draw_lanes() -> void:
	for lane: Array in _layout.lane_paths:
		if lane.size() < 2:
			continue
		var points: PackedVector2Array = PackedVector2Array()
		for cell: Vector2i in lane:
			points.append(Grid.cell_center(cell))
		draw_polyline(points, palette.lane_line, 1.0)


func _color_for(kind: MapLayoutDto.CellKind) -> Color:
	match kind:
		MapLayoutDto.CellKind.ROAD:
			return palette.road
		MapLayoutDto.CellKind.BUILDABLE:
			return palette.buildable
		MapLayoutDto.CellKind.WATER:
			return palette.water
		MapLayoutDto.CellKind.SPAWN:
			return palette.spawn
		MapLayoutDto.CellKind.CASTLE:
			return palette.castle
		_:
			return palette.dead
