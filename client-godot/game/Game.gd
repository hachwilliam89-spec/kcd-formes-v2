extends Control
## Écran de jeu solo (spike) : carte, pose de tours au tap, replay des vagues.
##
## Contrôleur : il relaie les intentions du joueur à l'API et transmet les
## réponses aux vues. Le serveur décide de tout (pose, combat, or, bonus,
## déblocages) ; MapView/BattleView dessinent, TickPlayer rejoue, Grid convertit.
## La barre de construction vient du catalogue du serveur (GET /api/v1/towers).

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
var _catalog: Array[TowerSpecDto] = []
## Meilleure vague du compte (GET /players/me) : déblocage des tours.
var _best_wave: int = 0
var _busy: bool = false
var _tower_group: ButtonGroup = ButtonGroup.new()

@onready var _map_area: Control = %MapArea
@onready var _map_view: MapView = %MapView
@onready var _battle: BattleView = %BattleView
@onready var _ticks: TickPlayer = %TickPlayer
@onready var _title: Label = %MapTitle
@onready var _stats: Label = %Stats
@onready var _tower_bar: GridContainer = %TowerBar
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

	var catalog_result: ApiResult = await Api.get_tower_catalog()
	if not catalog_result.ok:
		_info.text = catalog_result.error
		return
	_catalog = TowerSpecDto.list_from(catalog_result.data)
	if _catalog.is_empty():
		_info.text = "Catalogue des tours illisible"
		return
	await _refresh_best_wave()
	_build_tower_bar()
	await _new_game()


func _new_game() -> void:
	_info.text = "Création de la partie…"
	var result: ApiResult = await Api.create_game("Château de %s" % Session.username, _layout.id)
	if not _apply_state_result(result):
		return
	_info.text = "Choisis une tour puis touche une case constructible (verte). Le Mur se pose sur la route."


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
		_info.text = "%s niv. %d\nPV %d/%d · portée %.1f" % [TowerNames.label(tower.type), tower.level, tower.hp, tower.max_hp, tower.range_cells]
		return
	var spec: TowerSpecDto = _selected_spec()
	if _busy or _ticks.playing or _state.is_over() or spec == null or not _fits_cell(spec, cell):
		_info.text = "Case (%d, %d) : %s" % [cell.x, cell.y, CELL_LABELS.get(_layout.kind_at(cell), "?")]
		return
	var reason: String = _unavailable_reason(spec)
	if not reason.is_empty():
		_info.text = reason
		return
	await _place_tower(cell, spec)


func _on_tower_toggled(pressed: bool, spec: TowerSpecDto) -> void:
	if pressed:
		_info.text = _describe(spec)


func _place_tower(cell: Vector2i, spec: TowerSpecDto) -> void:
	_set_busy(true)
	var placed: ApiResult = await Api.place_tower(_state.game_id, spec.type, cell)
	if not placed.ok:
		_set_busy(false)
		_info.text = placed.error
		return
	# TowerResponse ne contient pas l'or restant : on relit l'état complet.
	_apply_state_result(await Api.get_game(_state.game_id))
	_set_busy(false)
	_info.text = "%s posé en (%d, %d)." % [TowerNames.label(spec.type), cell.x, cell.y]


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
	var previous_best: int = _best_wave
	await _refresh_best_wave()
	_set_busy(false)
	if _state.is_over():
		_info.text = "Le château est tombé à la vague %d." % _state.wave_number
	elif _state.awaiting_bonus_choice:
		_info.text = "Palier atteint : choisis un bonus."
	else:
		_info.text = "Vague %d repoussée." % _state.wave_number
	for spec: TowerSpecDto in _catalog:
		if not spec.is_unlocked(previous_best) and spec.is_unlocked(_best_wave):
			_info.text += "\nNouvelle tour : %s !" % TowerNames.label(spec.type)


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


## Relit la meilleure vague du compte ; garde la valeur connue si l'appel échoue.
func _refresh_best_wave() -> void:
	var result: ApiResult = await Api.me()
	if result.ok:
		_best_wave = int(DtoParse.dict(result.data).get("bestWave", _best_wave))


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
	_refresh_tower_bar()
	for child: Node in _bonus_box.get_children():
		(child as Button).disabled = busy


# --- Barre de construction ---------------------------------------------------

## Un bouton par tour du catalogue, dans l'ordre du serveur.
func _build_tower_bar() -> void:
	for child: Node in _tower_bar.get_children():
		_tower_bar.remove_child(child)
		child.queue_free()
	for spec: TowerSpecDto in _catalog:
		var button: Button = Button.new()
		button.toggle_mode = true
		button.button_group = _tower_group
		button.theme_type_variation = &"SmallButton"
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.set_meta("tower_type", spec.type)
		button.toggled.connect(_on_tower_toggled.bind(spec))
		_tower_bar.add_child(button)
	_refresh_tower_bar()
	if _tower_bar.get_child_count() > 0:
		(_tower_bar.get_child(0) as Button).button_pressed = true


## Libellés et disponibilité : coût, verrou de vague, plafond (Mur), or de la partie.
func _refresh_tower_bar() -> void:
	for child: Node in _tower_bar.get_children():
		var button: Button = child as Button
		var spec: TowerSpecDto = _spec(str(button.get_meta("tower_type", "")))
		if spec == null:
			continue
		if not spec.is_unlocked(_best_wave):
			button.text = "%s\nvague %d" % [TowerNames.short(spec.type), spec.unlock_wave]
		elif spec.max_count > 0:
			button.text = "%s\n%d · %d/%d" % [TowerNames.short(spec.type), spec.cost, _count_of(spec.type), spec.max_count]
		else:
			button.text = "%s\n%d or" % [TowerNames.short(spec.type), spec.cost]
		button.tooltip_text = _describe(spec)
		button.disabled = _busy or _state == null or not _unavailable_reason(spec).is_empty()


## Pourquoi la tour ne peut pas être posée maintenant ; "" si rien ne l'empêche.
## Affichage seulement : le serveur revalide tout à la pose.
func _unavailable_reason(spec: TowerSpecDto) -> String:
	var label: String = TowerNames.label(spec.type)
	if not spec.is_unlocked(_best_wave):
		return "%s : se débloque en atteignant la vague %d." % [label, spec.unlock_wave]
	if spec.max_count > 0 and _count_of(spec.type) >= spec.max_count:
		return "%s : %d au maximum en même temps." % [label, spec.max_count]
	if _state != null and _state.gold < spec.cost:
		return "%s : %d or requis (tu en as %d)." % [label, spec.cost, _state.gold]
	return ""


func _describe(spec: TowerSpecDto) -> String:
	var label: String = TowerNames.label(spec.type)
	var stats: TowerSpecDto.Level = spec.level(1)
	var hp: int = stats.max_hp if stats != null else 0
	var text: String
	if spec.on_corridor:
		text = "%s · %d or\nPV %d · se pose sur la route, %d au maximum" % [label, spec.cost, hp, spec.max_count]
	else:
		var damage: int = stats.damage if stats != null else 0
		var reach: float = stats.range_cells if stats != null else 0.0
		text = "%s · %d or\nDégâts %d · portée %.1f · PV %d" % [label, spec.cost, damage, reach, hp]
	var reason: String = _unavailable_reason(spec)
	return text if reason.is_empty() else "%s\n%s" % [text, reason]


## Zone de pose de la tour : route pour le Mur, cases constructibles sinon.
func _fits_cell(spec: TowerSpecDto, cell: Vector2i) -> bool:
	return _layout.is_corridor(cell) if spec.on_corridor else _layout.is_buildable(cell)


func _selected_spec() -> TowerSpecDto:
	var pressed: BaseButton = _tower_group.get_pressed_button()
	if pressed == null:
		return null
	return _spec(str(pressed.get_meta("tower_type", "")))


func _spec(type: String) -> TowerSpecDto:
	for spec: TowerSpecDto in _catalog:
		if spec.type == type:
			return spec
	return null


func _count_of(type: String) -> int:
	if _state == null:
		return 0
	var count: int = 0
	for tower: TowerDto in _state.towers:
		if tower.type == type:
			count += 1
	return count


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
