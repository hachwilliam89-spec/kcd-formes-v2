class_name LeaderboardPanel
extends Control
## Classement par meilleure vague (GET /api/v1/leaderboard), comme la modale du jeu
## web : onglets Global et un par carte, le top 5, et ta ligne si tu es hors du top.
## Se ferme en touchant le fond ou la croix.

const LIMIT: int = 5
const ME_COLOR: Color = Color("e0b83c")

var _tab: String = ""
var _map_ids: Array[String] = []
var _tabs: HFlowContainer
var _list: VBoxContainer
var _group: ButtonGroup = ButtonGroup.new()


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	visible = false
	# Au-dessus de la météo du plateau (SeasonView : brume z 1, pluie et grêle z 2).
	z_index = 10
	var shade: ColorRect = ColorRect.new()
	shade.color = Color(0, 0, 0, 0.7)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(event: InputEvent) -> void:
		var click: InputEventMouseButton = event as InputEventMouseButton
		if click != null and click.pressed:
			hide())
	add_child(shade)

	var center: CenterContainer = CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)
	var panel: PanelContainer = PanelContainer.new()
	panel.custom_minimum_size = Vector2(300, 0)
	center.add_child(panel)
	var box: VBoxContainer = VBoxContainer.new()
	panel.add_child(box)

	var head: HBoxContainer = HBoxContainer.new()
	box.add_child(head)
	var trophy: Texture2D = TextureCache.get_texture("res://assets/sprites/ui/icon_trophy.png")
	if trophy != null:
		var icon: TextureRect = TextureRect.new()
		icon.texture = trophy
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		icon.custom_minimum_size = Vector2(16, 16)
		head.add_child(icon)
	var title: Label = Label.new()
	title.text = "Classement"
	title.theme_type_variation = &"HeadingLabel"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	var close: Button = Button.new()
	close.text = "✕"
	close.theme_type_variation = &"FlatButton"
	close.pressed.connect(hide)
	head.add_child(close)

	_tabs = HFlowContainer.new()
	box.add_child(_tabs)
	_list = VBoxContainer.new()
	box.add_child(_list)


## Ouvre le classement sur l'onglet de la carte jouée (cartes : liste du serveur).
func open(current_map: String) -> void:
	visible = true
	if _map_ids.is_empty():
		var result: ApiResult = await Api.list_maps()
		if result.ok:
			_map_ids.assign(DtoParse.strings(result.data))
		_build_tabs()
	await _select(current_map if _map_ids.has(current_map) else "")


func _build_tabs() -> void:
	for child: Node in _tabs.get_children():
		_tabs.remove_child(child)
		child.queue_free()
	var ids: Array[String] = [""]
	ids.append_array(_map_ids)
	for id: String in ids:
		var button: Button = Button.new()
		button.text = "Global" if id.is_empty() else MapNames.label(id)
		button.toggle_mode = true
		button.button_group = _group
		button.theme_type_variation = &"SmallButton"
		button.set_meta("map_id", id)
		button.pressed.connect(func() -> void: _select(id))
		_tabs.add_child(button)


func _select(map_id: String) -> void:
	_tab = map_id
	for child: Node in _tabs.get_children():
		var button: Button = child as Button
		button.set_pressed_no_signal(str(button.get_meta("map_id", "")) == map_id)
	_show_lines(["Chargement…"] as Array[String], -1)
	var result: ApiResult = await Api.get_leaderboard(LIMIT, map_id)
	if _tab != map_id:
		return # un autre onglet a été choisi entre-temps
	if not result.ok:
		_show_lines([result.error] as Array[String], -1)
		return
	var board: LeaderboardDto = LeaderboardDto.from_variant(result.data)
	if board == null or board.top.is_empty():
		_show_lines(["Aucun score sur cette carte pour l'instant."] as Array[String], -1)
		return
	var lines: Array[String] = []
	var mine: int = -1
	for entry: LeaderboardDto.Entry in board.top:
		if entry.username == Session.username:
			mine = lines.size()
		lines.append(_line(entry))
	# Ta ligne n'est ajoutée que si tu es hors du top affiché.
	if board.me != null and mine < 0:
		mine = lines.size()
		lines.append(_line(board.me))
	_show_lines(lines, mine)


func _line(entry: LeaderboardDto.Entry) -> String:
	return "#%d %s — vague %d" % [entry.rank, entry.username, entry.best_wave]


func _show_lines(lines: Array[String], highlight: int) -> void:
	for child: Node in _list.get_children():
		_list.remove_child(child)
		child.queue_free()
	for i: int in range(lines.size()):
		var label: Label = Label.new()
		label.text = lines[i]
		label.theme_type_variation = &"SmallLabel"
		if i == highlight:
			label.add_theme_color_override("font_color", ME_COLOR)
		_list.add_child(label)
