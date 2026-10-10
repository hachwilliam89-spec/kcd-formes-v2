class_name AudioMenu
extends Button
## Bouton « Son » qui ouvre un petit menu, comme AudioControls du web : couper le
## son, et réglages séparés Musique de fond / Bruitages (gardés par Sound).
##
## Le menu est un calque de l'écran (pas une fenêtre popup) : il s'ouvre sous le
## bouton, ou au-dessus s'il n'y a pas la place, sans jamais sortir de la fenêtre.
## Un clic hors du menu le ferme et s'arrête là : il n'atteint pas le bouton dessous.

## Marge entre le menu, le bouton et les bords de la fenêtre.
const MARGIN: float = 4.0

var _layer: CanvasLayer
var _panel: PanelContainer
var _mute: Button
var _music: HSlider
var _sfx: HSlider


func _ready() -> void:
	theme_type_variation = &"SmallButton"
	# Calque au-dessus de tout l'écran (plateau, météo, panneaux).
	_layer = CanvasLayer.new()
	_layer.layer = 100
	_layer.visible = false
	add_child(_layer)
	var catcher: Control = Control.new()
	catcher.set_anchors_preset(Control.PRESET_FULL_RECT)
	catcher.mouse_filter = Control.MOUSE_FILTER_STOP
	catcher.gui_input.connect(_on_outside_input)
	_layer.add_child(catcher)

	_panel = PanelContainer.new()
	_layer.add_child(_panel)
	# Fond du thème rendu opaque : le menu passe devant d'autres commandes.
	var style: StyleBoxFlat = _panel.get_theme_stylebox(&"panel") as StyleBoxFlat
	if style != null:
		style = style.duplicate() as StyleBoxFlat
		style.bg_color.a = 1.0
		_panel.add_theme_stylebox_override(&"panel", style)
	var box: VBoxContainer = VBoxContainer.new()
	box.custom_minimum_size = Vector2(170, 0)
	_panel.add_child(box)
	var head: HBoxContainer = HBoxContainer.new()
	box.add_child(head)
	var title: Label = Label.new()
	title.text = "Son"
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	_mute = Button.new()
	_mute.theme_type_variation = &"SmallButton"
	_mute.pressed.connect(func() -> void: Sound.set_muted(not Sound.muted))
	head.add_child(_mute)
	_music = _slider(box, "Musique de fond", Sound.set_music_level)
	_sfx = _slider(box, "Bruitages", Sound.set_sfx_level)
	pressed.connect(_toggle)
	Sound.changed.connect(_sync)
	_sync()


func _unhandled_input(event: InputEvent) -> void:
	if _layer.visible and event.is_action_pressed(&"ui_cancel"):
		close()
		get_viewport().set_input_as_handled()


func is_open() -> bool:
	return _layer.visible


func close() -> void:
	_layer.visible = false


func _toggle() -> void:
	if _layer.visible:
		close()
		return
	_sync()
	_layer.visible = true
	_place()


## Sous le bouton s'il y a la place, sinon au-dessus ; toujours dans la fenêtre.
func _place() -> void:
	_panel.reset_size()
	var menu: Vector2 = _panel.get_combined_minimum_size()
	var view: Vector2 = get_viewport().get_visible_rect().size
	var button: Rect2 = Rect2(get_global_transform_with_canvas().origin, size)
	var y: float = button.end.y + MARGIN
	if y + menu.y > view.y - MARGIN:
		y = button.position.y - MARGIN - menu.y
	var x: float = button.position.x
	_panel.position = Vector2(
		clampf(x, MARGIN, maxf(MARGIN, view.x - menu.x - MARGIN)),
		clampf(y, MARGIN, maxf(MARGIN, view.y - menu.y - MARGIN)))


func _on_outside_input(event: InputEvent) -> void:
	var click: InputEventMouseButton = event as InputEventMouseButton
	var touch: InputEventScreenTouch = event as InputEventScreenTouch
	if (click != null and click.pressed) or (touch != null and touch.pressed):
		close()
		get_viewport().set_input_as_handled()


func _slider(box: VBoxContainer, label_text: String, setter: Callable) -> HSlider:
	var label: Label = Label.new()
	label.text = label_text
	label.theme_type_variation = &"SmallLabel"
	box.add_child(label)
	var slider: HSlider = HSlider.new()
	slider.min_value = 0.0
	slider.max_value = 1.0
	slider.step = 0.05
	slider.value_changed.connect(func(value: float) -> void: setter.call(value))
	box.add_child(slider)
	return slider


func _sync() -> void:
	var off: bool = Sound.muted or (Sound.sfx_level == 0.0 and Sound.music_level == 0.0)
	text = "Son coupé" if off else "Son"
	_mute.text = "Réactiver" if Sound.muted else "Couper"
	_music.set_value_no_signal(Sound.music_level)
	_sfx.set_value_no_signal(Sound.sfx_level)
	_music.editable = not Sound.muted
	_sfx.editable = not Sound.muted
