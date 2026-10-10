extends Control
## Écran de jeu solo (spike) : carte, pose de tours au tap, replay des vagues.
##
## Contrôleur : il relaie les intentions du joueur à l'API et transmet les
## réponses aux vues. Le serveur décide de tout (pose, combat, or, bonus,
## déblocages) ; MapView/BattleView dessinent, TickPlayer rejoue, Grid convertit.
## La barre de construction vient du catalogue du serveur (GET /api/v1/towers).

## Priorités de tir (TargetingMode côté serveur) : libellés de présentation.
const TARGETING_MODES: Array[Dictionary] = [
	{"mode": "CLOSEST", "label": "Le plus proche"},
	{"mode": "FIRST", "label": "Le plus avancé"},
	{"mode": "STRONGEST", "label": "Le plus solide"},
]

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
## Meilleure vague du compte (GET /players/me) : déblocage des tours.
var _best_wave: int = 0
var _busy: bool = false
## Tour posée sélectionnée (fiche : amélioration, priorité de tir) ; "" = aucune.
var _selected_tower_id: String = ""
var _upgrade_button: Button
var _targeting_buttons: Array[Button] = []

@onready var _map_area: Control = %MapArea
@onready var _map_view: MapView = %MapView
@onready var _battle: BattleView = %BattleView
@onready var _ticks: TickPlayer = %TickPlayer
@onready var _title: Label = %MapTitle
@onready var _stats: Label = %Stats
@onready var _tower_bar: TowerBar = %TowerBar
@onready var _wave_button: Button = %WaveButton
@onready var _bonus_box: VBoxContainer = %BonusBox
@onready var _tower_card: VBoxContainer = %TowerCard
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
	var catalog: Array[TowerSpecDto] = TowerSpecDto.list_from(catalog_result.data)
	if catalog.is_empty():
		_info.text = "Catalogue des tours illisible"
		return
	await _refresh_best_wave()
	_tower_bar.tower_selected.connect(_on_tower_selected)
	_tower_bar.setup(catalog)
	await _new_game()


func _new_game() -> void:
	_selected_tower_id = ""
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
		# Toucher une tour posée la sélectionne (fiche) : jamais d'or dépensé par surprise.
		_select_tower(tower.id)
		_info.text = "Touche une case libre pour construire, ou une autre tour."
		return
	_select_tower("")
	var spec: TowerSpecDto = _tower_bar.selected_spec()
	if _busy or _ticks.playing or _state.is_over() or spec == null or not TowerBar.fits_cell(spec, _layout, cell):
		_info.text = "Case (%d, %d) : %s" % [cell.x, cell.y, CELL_LABELS.get(_layout.kind_at(cell), "?")]
		return
	var reason: String = _tower_bar.unavailable_reason(spec)
	if not reason.is_empty():
		_info.text = reason
		return
	await _place_tower(cell, spec)


func _on_tower_selected(spec: TowerSpecDto) -> void:
	_info.text = _tower_bar.describe(spec)


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
	for spec: TowerSpecDto in _tower_bar.catalog:
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
	_rebuild_tower_card()
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
	_sync_tower_bar()
	_refresh_tower_card()
	for child: Node in _bonus_box.get_children():
		(child as Button).disabled = busy


# --- Fiche de la tour sélectionnée -------------------------------------------

func _select_tower(tower_id: String) -> void:
	_selected_tower_id = tower_id
	_rebuild_tower_card()
	if _tower_card.visible:
		# Le panneau latéral défile : amener la fiche à l'écran une fois mise en page.
		await get_tree().process_frame
		var scroll: ScrollContainer = _tower_card.get_parent().get_parent() as ScrollContainer
		if scroll != null and _tower_card.visible:
			scroll.ensure_control_visible(_tower_card)


func _selected_tower() -> TowerDto:
	if _state == null or _selected_tower_id.is_empty():
		return null
	for tower: TowerDto in _state.towers:
		if tower.id == _selected_tower_id:
			return tower
	return null


## Fiche : niveau, stats (→ niveau suivant), amélioration, priorité de tir.
## Valeurs du serveur : la tour (TowerResponse) et le catalogue pour le niveau suivant.
func _rebuild_tower_card() -> void:
	for child: Node in _tower_card.get_children():
		_tower_card.remove_child(child)
		child.queue_free()
	_upgrade_button = null
	_targeting_buttons.clear()
	var tower: TowerDto = _selected_tower()
	_tower_card.visible = tower != null
	if tower == null:
		# Tour détruite en combat ou partie relancée : la sélection tombe.
		_selected_tower_id = ""
		return
	var spec: TowerSpecDto = _tower_bar.spec_of(tower.type)
	var max_level: int = spec.levels.size() if spec != null and not spec.levels.is_empty() else tower.level
	var next: TowerSpecDto.Level = spec.level(tower.level + 1) if spec != null and tower.level < max_level else null

	var title: Label = Label.new()
	title.text = "%s · niv. %d/%d" % [TowerNames.label(tower.type), tower.level, max_level]
	_tower_card.add_child(title)

	var stats: Label = Label.new()
	stats.theme_type_variation = &"SmallLabel"
	stats.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	var lines: PackedStringArray = []
	if tower.damage > 0:
		lines.append("Dégâts %d%s · portée %.1f%s" % [tower.damage, " → %d" % next.damage if next != null else "",
			tower.range_cells, " → %.1f" % next.range_cells if next != null else ""])
	lines.append("PV %d/%d%s" % [tower.hp, tower.max_hp, " → %d" % next.max_hp if next != null else ""])
	stats.text = "\n".join(lines)
	_tower_card.add_child(stats)

	# Mur : structure sans tir, ni amélioration ni priorité (comme sur le web).
	if spec != null and spec.on_corridor:
		return

	if next != null:
		var cost: int = spec.level(tower.level).upgrade_cost
		_upgrade_button = Button.new()
		_upgrade_button.text = "Améliorer : %d or" % cost
		_upgrade_button.theme_type_variation = &"SmallButton"
		_upgrade_button.set_meta("cost", cost)
		_upgrade_button.pressed.connect(_on_upgrade_pressed)
		_tower_card.add_child(_upgrade_button)
	else:
		var top: Label = Label.new()
		top.theme_type_variation = &"SmallLabel"
		top.text = "Niveau maximum atteint."
		_tower_card.add_child(top)

	var heading: Label = Label.new()
	heading.theme_type_variation = &"SmallLabel"
	heading.text = "Priorité de tir"
	_tower_card.add_child(heading)
	for option: Dictionary in TARGETING_MODES:
		var mode: String = str(option["mode"])
		var button: Button = Button.new()
		button.text = ("✓ " if tower.targeting_mode == mode else "") + str(option["label"])
		button.theme_type_variation = &"SmallButton"
		button.pressed.connect(_on_targeting_pressed.bind(mode, str(option["label"])))
		_tower_card.add_child(button)
		_targeting_buttons.append(button)
	_refresh_tower_card()


## Actions de la fiche : bloquées pendant une vague, un appel en cours ou une partie finie.
func _refresh_tower_card() -> void:
	var locked: bool = _busy or _ticks.playing or _state == null or _state.is_over()
	if _upgrade_button != null:
		_upgrade_button.disabled = locked or _state.gold < int(_upgrade_button.get_meta("cost", 0))
	for button: Button in _targeting_buttons:
		button.disabled = locked


func _on_upgrade_pressed() -> void:
	var tower: TowerDto = _selected_tower()
	if tower == null:
		return
	_set_busy(true)
	var result: ApiResult = await Api.upgrade_tower(_state.game_id, tower.id)
	if not result.ok:
		_set_busy(false)
		_info.text = result.error
		return
	# TowerResponse ne contient pas l'or restant : on relit l'état complet.
	_apply_state_result(await Api.get_game(_state.game_id))
	_set_busy(false)
	var upgraded: TowerDto = _selected_tower()
	_info.text = "%s amélioré au niveau %d." % [TowerNames.label(tower.type), upgraded.level if upgraded != null else tower.level + 1]


func _on_targeting_pressed(mode: String, label: String) -> void:
	var tower: TowerDto = _selected_tower()
	if tower == null or tower.targeting_mode == mode:
		return
	_set_busy(true)
	var result: ApiResult = await Api.set_targeting_mode(_state.game_id, tower.id, mode)
	if not result.ok:
		_set_busy(false)
		_info.text = result.error
		return
	_apply_state_result(await Api.get_game(_state.game_id))
	_set_busy(false)
	_info.text = "Priorité de tir : %s." % label.to_lower()


# --- Barre de construction ---------------------------------------------------

## Transmet l'état de la partie à la barre (or, tours posées, déblocages, occupation).
func _sync_tower_bar() -> void:
	_tower_bar.best_wave = _best_wave
	_tower_bar.gold = _state.gold if _state != null else 0
	_tower_bar.placed = _state.towers if _state != null else ([] as Array[TowerDto])
	_tower_bar.busy = _busy or _state == null
	_tower_bar.refresh()


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
