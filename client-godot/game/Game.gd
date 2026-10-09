extends Control
## Écran de jeu (spike, étape carte) : charge la disposition de la carte depuis
## l'API, l'affiche à la taille de l'écran et décrit la case touchée.
##
## Contrôleur uniquement : la vue (MapView) dessine, Grid convertit, le serveur
## décide. Prochaine étape : créer la partie, poser des tours, rejouer une vague.

const CELL_LABELS: Dictionary = {
	MapLayoutDto.CellKind.DEAD: "zone morte (décor, non constructible)",
	MapLayoutDto.CellKind.ROAD: "route",
	MapLayoutDto.CellKind.BUILDABLE: "constructible",
	MapLayoutDto.CellKind.WATER: "eau",
	MapLayoutDto.CellKind.SPAWN: "entrée ennemie",
	MapLayoutDto.CellKind.CASTLE: "ton château",
}

var _layout: MapLayoutDto

@onready var _map_area: Control = %MapArea
@onready var _map_view: MapView = %MapView
@onready var _title: Label = %MapTitle
@onready var _info: Label = %CellInfo
@onready var _back: Button = %Back


func _ready() -> void:
	_back.pressed.connect(Router.goto_home)
	_map_area.resized.connect(_fit_map)
	_map_area.gui_input.connect(_on_map_input)
	_title.text = MapNames.label(Router.current_map_id)
	_info.text = "Chargement de la carte…"

	var result: ApiResult = await Api.get_map_layout(Router.current_map_id)
	if not result.ok:
		_info.text = result.error
		return
	_layout = MapLayoutDto.from_variant(result.data)
	if _layout == null:
		_info.text = "Réponse du serveur illisible"
		return
	_map_view.show_layout(_layout)
	_fit_map()
	_info.text = "Touche une case pour voir sa nature."


## Centre la carte dans la zone disponible, à la plus grande échelle qui tient.
func _fit_map() -> void:
	if _layout == null:
		return
	var local: Vector2 = _map_view.local_size()
	var avail: Vector2 = _map_area.size
	if local.x <= 0.0 or local.y <= 0.0 or avail.x <= 0.0 or avail.y <= 0.0:
		return
	var factor: float = minf(avail.x / local.x, avail.y / local.y)
	_map_view.scale = Vector2(factor, factor)
	_map_view.position = ((avail - local * factor) * 0.5).floor()


## Tap / clic : un toucher réel arrive aussi en clic souris (émulation par défaut de Godot).
func _on_map_input(event: InputEvent) -> void:
	if _layout == null:
		return
	var click: InputEventMouseButton = event as InputEventMouseButton
	if click == null or not click.pressed or click.button_index != MOUSE_BUTTON_LEFT:
		return
	var local_point: Vector2 = _map_view.transform.affine_inverse() * click.position
	var cell: Vector2i = Grid.local_to_cell(local_point)
	if not _layout.contains(cell):
		return
	_map_view.set_selected(cell)
	_info.text = "Case (%d, %d)\n%s" % [cell.x, cell.y, CELL_LABELS.get(_layout.kind_at(cell), "?")]
