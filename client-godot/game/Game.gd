extends Control
## Écran de jeu solo (spike) : carte, pose de tours au tap, replay des vagues.
##
## Contrôleur : il relaie les intentions du joueur à l'API et transmet les
## réponses aux vues. Le serveur décide de tout (pose, combat, or, bonus) ;
## MapView/BattleView dessinent, TickPlayer rejoue, Grid convertit.

const CELL_LABELS: Dictionary = {
	MapLayoutDto.CellKind.DEAD: "zone morte (décor)",
	MapLayoutDto.CellKind.ROAD: "route",
	MapLayoutDto.CellKind.BUILDABLE: "constructible",
	MapLayoutDto.CellKind.WATER: "eau",
	MapLayoutDto.CellKind.SPAWN: "entrée ennemie",
	MapLayoutDto.CellKind.CASTLE: "ton château",
}

var _layout: MapLayoutDto
var _state: GameStateDto
var _busy: bool = false

@onready var _map_area: Control = %MapArea
@onready var _map_view: MapView = %MapView
@onready var _battle: BattleView = %BattleView
@onready var _ticks: TickPlayer = %TickPlayer
@onready var _title: Label = %MapTitle
@onready var _stats: Label = %Stats
@onready var _tower_bar: HBoxContainer = %TowerBar
@onready var _wave_button: Button = %WaveButton
@onready var _bonus_box: VBoxContainer = %BonusBox
@onready var _info: Label = %Info
@onready var _back: Button = %Back
@onready var _fps: Label = %Fps

var _fps_timer: float = 0.0


func _ready() -> void:
	_back.pressed.connect(_on_quit)
	_wave_button.pressed.connect(_on_wave_pressed)
	_map_area.resized.connect(_fit_map)
	_map_area.gui_input.connect(_on_map_input)
	_battle.bind(_ticks)
	_ticks.tick_played.connect(_on_tick)
	_ticks.finished.connect(_on_wave_finished)
	_fps.visible = bool(ProjectSettings.get_setting("war_seasons/debug/show_fps", false))
	_title.text = MapNames.label(Router.current_map_id)
	_stats.text = ""
	_info.text = "Chargement de la carte…"

	var layout_result: ApiResult = await Api.get_map_layout(Router.current_map_id)
	if not layout_result.ok:
		_info.text = layout_result.error
		return
	_layout = MapLayoutDto.from_variant(layout_result.data)
	if _layout == null:
		_info.text = "Carte illisible"
		return
	# Décor exporté du web (scripts/visual-export) ; absent → cases colorées.
	var decor: DecorSet = DecorSet.load_for(_layout.id)
	_map_view.show_layout(_layout, decor.ground if decor != null else null)
	_battle.setup(_layout, decor)
	_fit_map()
	await _new_game()


func _new_game() -> void:
	_info.text = "Création de la partie…"
	var result: ApiResult = await Api.create_game("Château de %s" % Session.username, _layout.id)
	if not _apply_state_result(result):
		return
	_info.text = "Choisis une tour puis touche une case constructible (verte)."


## Compteur de perf du spike (réglage war_seasons/debug/show_fps).
func _process(delta: float) -> void:
	if not _fps.visible:
		return
	_fps_timer -= delta
	if _fps_timer <= 0.0:
		_fps_timer = 0.5
		_fps.text = "%d fps · %d ennemis" % [Engine.get_frames_per_second(), _battle.enemy_count()]


# --- Entrées du joueur -------------------------------------------------------

func _on_map_input(event: InputEvent) -> void:
	var click: InputEventMouseButton = event as InputEventMouseButton
	if click == null or not click.pressed or click.button_index != MOUSE_BUTTON_LEFT:
		return
	if _layout == null or _state == null:
		return
	var cell: Vector2i = Grid.local_to_cell(_map_view.transform.affine_inverse() * click.position)
	if not _layout.contains(cell):
		return
	_map_view.set_selected(cell)
	_on_cell_tapped(cell)


func _on_cell_tapped(cell: Vector2i) -> void:
	var tower: TowerDto = _state.tower_at(cell)
	if tower != null:
		_info.text = "%s niv. %d\nPV %d/%d · portée %.1f" % [tower.type, tower.level, tower.hp, tower.max_hp, tower.range_cells]
		return
	if _busy or _ticks.playing or _state.is_over() or not _layout.is_buildable(cell):
		_info.text = "Case (%d, %d) : %s" % [cell.x, cell.y, CELL_LABELS.get(_layout.kind_at(cell), "?")]
		return
	await _place_tower(cell)


func _place_tower(cell: Vector2i) -> void:
	var tower_type: String = _selected_tower_type()
	_set_busy(true)
	var placed: ApiResult = await Api.place_tower(_state.game_id, tower_type, cell)
	if not placed.ok:
		_set_busy(false)
		_info.text = placed.error
		return
	# TowerResponse ne contient pas l'or restant : on relit l'état complet.
	_apply_state_result(await Api.get_game(_state.game_id))
	_set_busy(false)
	_info.text = "%s posé en (%d, %d)." % [tower_type, cell.x, cell.y]


func _on_wave_pressed() -> void:
	if _state != null and _state.is_over():
		await _new_game()
		return
	_set_busy(true)
	_info.text = "Vague %d…" % (_state.wave_number + 1)
	var result: ApiResult = await Api.start_wave(_state.game_id)
	if not result.ok:
		_set_busy(false)
		_info.text = result.error
		return
	var wave: WaveResultDto = WaveResultDto.from_variant(result.data)
	if wave == null:
		_set_busy(false)
		_info.text = "Réponse du serveur illisible"
		return
	_ticks.play(wave.ticks)


func _on_tick(tick: TickDto) -> void:
	_stats.text = "Vague %d · Or %d\nChâteau %d/%d" % [_state.wave_number + 1, _state.gold, tick.castle_hp, _state.castle_max_hp]


func _on_wave_finished() -> void:
	_apply_state_result(await Api.get_game(_state.game_id))
	_set_busy(false)
	if _state.is_over():
		_info.text = "Le château est tombé à la vague %d." % _state.wave_number
	elif _state.awaiting_bonus_choice:
		_info.text = "Palier atteint : choisis un bonus."
	else:
		_info.text = "Vague %d repoussée." % _state.wave_number


func _on_bonus_chosen(bonus_type: String) -> void:
	_set_busy(true)
	var result: ApiResult = await Api.choose_bonus(_state.game_id, bonus_type)
	if not result.ok:
		_set_busy(false)
		_info.text = result.error
		return
	_apply_state_result(await Api.get_game(_state.game_id))
	_set_busy(false)
	_info.text = "Bonus appliqué."


func _on_quit() -> void:
	_ticks.stop()
	Router.goto_home()


# --- État et affichage -------------------------------------------------------

## Applique un GameResponse ; renvoie false (et affiche l'erreur) en cas d'échec.
func _apply_state_result(result: ApiResult) -> bool:
	if not result.ok:
		_info.text = result.error
		return false
	var state: GameStateDto = GameStateDto.from_variant(result.data)
	if state == null:
		_info.text = "État de partie illisible"
		return false
	_state = state
	_battle.show_towers(_state.towers)
	_refresh_hud()
	return true


func _refresh_hud() -> void:
	_stats.text = "Vague %d · Or %d\nChâteau %d/%d" % [_state.wave_number, _state.gold, _state.castle_hp, _state.castle_max_hp]
	_wave_button.text = "Nouvelle partie" if _state.is_over() else "Lancer vague %d" % (_state.wave_number + 1)
	_rebuild_bonus_box()
	_set_busy(_busy)


func _rebuild_bonus_box() -> void:
	for child: Node in _bonus_box.get_children():
		child.queue_free()
	_bonus_box.visible = _state.awaiting_bonus_choice and not _state.available_bonuses.is_empty()
	for option: BonusOptionDto in _state.available_bonuses:
		var button: Button = Button.new()
		button.text = option.label
		button.tooltip_text = option.description
		button.theme_type_variation = &"SmallButton"
		button.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		button.pressed.connect(_on_bonus_chosen.bind(option.type))
		_bonus_box.add_child(button)


func _set_busy(busy: bool) -> void:
	_busy = busy
	var waiting_bonus: bool = _state != null and _state.awaiting_bonus_choice
	_wave_button.disabled = busy or _state == null or waiting_bonus
	for child: Node in _tower_bar.get_children():
		(child as Button).disabled = busy
	for child: Node in _bonus_box.get_children():
		(child as Button).disabled = busy


func _selected_tower_type() -> String:
	for child: Node in _tower_bar.get_children():
		var button: Button = child as Button
		if button.button_pressed:
			return str(button.get_meta("tower_type", "ARCHER"))
	return "ARCHER"


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
