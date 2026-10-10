class_name Hud
extends PanelContainer
## Bandeau au-dessus du plateau, comme celui du jeu web (app/game/page.tsx) : or,
## PV du château (barre verte, rouge sous 30 %), numéro de vague, et l'aperçu de la
## prochaine vague — types d'ennemis présents, nouveautés cerclées d'or, alerte Boss.
##
## Affichage seulement : l'écran lui passe l'état reçu du serveur.

const ICON_GOLD: String = "res://assets/sprites/ui/icon_gold.png"
const ICON_HEART: String = "res://assets/sprites/ui/icon_heart.png"
## Sous ce ratio de PV, la barre du château passe au rouge.
const LOW_HP: float = 0.3
const NEW_RING: Color = Color("f2c94c")


## Barre de PV du château (fond sombre, bord, remplissage).
class CastleBar:
	extends Control
	var ratio: float = 1.0

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color("120a06"))
		draw_rect(Rect2(Vector2(2, 2), size - Vector2(4, 4)), Color("2a1810"))
		var fill: Color = Color("5bbd3a") if ratio > Hud.LOW_HP else Color("d64545")
		draw_rect(Rect2(Vector2(2, 2), Vector2((size.x - 4.0) * clampf(ratio, 0.0, 1.0), size.y - 4.0)), fill)


## Ennemi de l'aperçu : première image de sa planche (pose de marche), comme
## EnemyIcon du web ; pastille de sa couleur si le sprite manque.
class EnemyIcon:
	extends Control
	var visual: EnemyVisual
	var ring: bool = false

	func _draw() -> void:
		var texture: Texture2D = visual.texture() if visual != null else null
		if texture != null:
			draw_texture_rect_region(texture, Rect2(Vector2.ZERO, size), visual.frame_rect(0))
		elif visual != null:
			draw_circle(size * 0.5, size.x * 0.32, visual.color)
		if ring:
			draw_arc(size * 0.5, size.x * 0.5 - 1.0, 0.0, TAU, 24, Hud.NEW_RING, 2.0)


var _catalog: VisualCatalog
var _gold: Label
var _bar: CastleBar
var _hp: Label
var _wave: Label
var _preview: HBoxContainer


func _ready() -> void:
	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	add_child(row)
	row.add_child(_icon(ICON_GOLD, "Or"))
	_gold = _label(row, Color("fde047"))
	row.add_child(_icon(ICON_HEART, "PV"))
	_bar = CastleBar.new()
	_bar.custom_minimum_size = Vector2(56, 10)
	_bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	row.add_child(_bar)
	_hp = _label(row, Color("f0e2c4"))
	row.add_child(_spacer())
	_wave = _label(row, Color("fde047"))
	row.add_child(_spacer())
	_preview = HBoxContainer.new()
	_preview.add_theme_constant_override("separation", 2)
	row.add_child(_preview)


## Icônes des ennemis de l'aperçu (VisualCatalog du plateau).
func setup(catalog: VisualCatalog) -> void:
	_catalog = catalog


func show_state(gold: int, castle_hp: int, castle_max_hp: int, wave: int) -> void:
	_gold.text = str(gold)
	set_castle(castle_hp, castle_max_hp)
	_wave.text = "Vague %d" % wave


## PV du château, en direct pendant une vague (siège).
func set_castle(hp: int, max_hp: int) -> void:
	_bar.ratio = float(hp) / max_hp if max_hp > 0 else 0.0
	_bar.queue_redraw()
	_hp.text = "%d/%d" % [maxi(hp, 0), max_hp]


func set_wave(wave: int) -> void:
	_wave.text = "Vague %d" % wave


## Prochaine vague (null : rien à annoncer, pendant une vague ou partie finie).
func show_preview(preview: WavePreviewDto) -> void:
	for child: Node in _preview.get_children():
		_preview.remove_child(child)
		child.queue_free()
	if preview == null or preview.enemy_types.is_empty():
		return
	var names: PackedStringArray = []
	for type: String in preview.enemy_types:
		var icon: EnemyIcon = EnemyIcon.new()
		icon.visual = _catalog.enemy(type) if _catalog != null else null
		icon.ring = preview.is_new(type)
		var side: float = 20.0 if type == "BOSS_WARLORD" else 16.0
		icon.custom_minimum_size = Vector2(side, side)
		icon.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		icon.tooltip_text = "%s — nouveau !" % EnemyNames.label(type) if icon.ring else EnemyNames.label(type)
		icon.mouse_filter = Control.MOUSE_FILTER_PASS
		_preview.add_child(icon)
		names.append(EnemyNames.label(type))
	_preview.tooltip_text = "Prochaine vague (%d) : %s" % [preview.wave_number, ", ".join(names)]
	if preview.boss_wave:
		_preview.add_child(_badge("☠ Boss", Color("b91c1c"), Color.WHITE))
	elif preview.enemy_types.any(func(t: String) -> bool: return preview.is_new(t)):
		_preview.add_child(_badge("Nouveau", NEW_RING, Color("3a2a10")))


func _icon(path: String, fallback: String) -> Control:
	var texture: Texture2D = TextureCache.get_texture(path)
	if texture == null:
		var label: Label = Label.new()
		label.theme_type_variation = &"SmallLabel"
		label.text = fallback
		return label
	var rect: TextureRect = TextureRect.new()
	rect.texture = texture
	rect.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	rect.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	rect.custom_minimum_size = Vector2(12, 12)
	rect.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return rect


func _label(row: HBoxContainer, color: Color) -> Label:
	var label: Label = Label.new()
	label.theme_type_variation = &"HudLabel"
	label.add_theme_color_override("font_color", color)
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	row.add_child(label)
	return label


func _spacer() -> Control:
	var spacer: Control = Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return spacer


func _badge(text: String, background: Color, color: Color) -> Label:
	var label: Label = Label.new()
	label.text = text
	label.theme_type_variation = &"FpsLabel"
	label.add_theme_color_override("font_color", color)
	label.add_theme_constant_override("outline_size", 0)
	var box: StyleBoxFlat = StyleBoxFlat.new()
	box.bg_color = background
	box.set_corner_radius_all(2)
	box.content_margin_left = 3
	box.content_margin_right = 3
	label.add_theme_stylebox_override("normal", box)
	label.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	return label
