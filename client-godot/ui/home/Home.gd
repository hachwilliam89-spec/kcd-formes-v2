extends Control
## Accueil : choix de la carte (liste fournie par l'API) puis ouverture de l'écran de jeu.

var _map_ids: Array[String] = []

@onready var _welcome: Label = %Welcome
@onready var _picker: OptionButton = %MapPicker
@onready var _play: Button = %Play
@onready var _error: Label = %Error
@onready var _logout: Button = %Logout


func _ready() -> void:
	_welcome.text = "Connecté en tant que %s" % Session.username
	_logout.pressed.connect(_on_logout)
	_play.pressed.connect(_on_play)
	_load_maps()


func _load_maps() -> void:
	var result: ApiResult = await Api.list_maps()
	if not result.ok or not result.data is Array:
		_show_error(result.error if not result.ok else "Liste des cartes illisible")
		return
	var ids: Array = result.data
	for map_id: Variant in ids:
		_map_ids.append(str(map_id))
		_picker.add_item(MapNames.label(str(map_id)))
	_picker.disabled = _map_ids.is_empty()
	_play.disabled = _map_ids.is_empty()


func _on_play() -> void:
	var index: int = _picker.selected
	if index < 0 or index >= _map_ids.size():
		return
	Router.goto_game(_map_ids[index])


func _on_logout() -> void:
	Session.clear()
	Router.goto_login()


func _show_error(message: String) -> void:
	_error.text = message
	_error.visible = true
