extends Control
## Écran coop : lobby (créer / rejoindre par code / prêt / démarrer) puis partie
## live sur un plateau commun, or et château partagés.
##
## Contrôleur : relaie les intentions du joueur au serveur par STOMP (StompClient)
## et passe l'état reçu aux vues. Le serveur simule tout (MatchEngine, un tick toutes
## les 120 ms) ; le plateau rejoue ses snapshots avec le même rendu qu'en solo
## (SnapshotFeed → TickPlayer en direct → BattleView). Destinations : voir
## backend MatchStompController et StompMatchBroadcaster.

## Bonus de palier (BonusType côté serveur) : libellés de présentation.
const BONUSES: Array[Dictionary] = [
	{"type": "GOLD_INJECTION", "label": "Or"},
	{"type": "CASTLE_REPAIR", "label": "Château"},
	{"type": "TOWER_REPAIR", "label": "Tours"},
]
## Après une coupure, nouvel essai de connexion au bout de ce délai.
const RECONNECT_SECONDS: float = 3.0

const CELL_LABELS: Dictionary = {
	MapLayoutDto.CellKind.DEAD: "zone morte (décor)",
	MapLayoutDto.CellKind.ROAD: "route",
	MapLayoutDto.CellKind.BUILDABLE: "constructible",
	MapLayoutDto.CellKind.WATER: "eau",
	MapLayoutDto.CellKind.SPAWN: "entrée ennemie",
	MapLayoutDto.CellKind.CASTLE: "château",
}

var _stomp: StompClient
var _match: MatchStateDto
var _layout: MapLayoutDto
var _layout_id: String = ""
var _feed: SnapshotFeed = SnapshotFeed.new()
## Tours du dernier snapshot, au format du rendu.
var _towers: Array[TowerDto] = []
var _subscribed_match: String = ""
var _bonus_count: int = -1
var _leaving: bool = false
var _fps_timer: float = 0.0

@onready var _map_area: Control = %MapArea
@onready var _map_view: MapView = %MapView
@onready var _battle: BattleView = %BattleView
@onready var _ticks: TickPlayer = %TickPlayer
@onready var _title: Label = %Title
@onready var _status: Label = %Status
@onready var _lobby: VBoxContainer = %Lobby
@onready var _create: Button = %Create
@onready var _join_row: HBoxContainer = %JoinRow
@onready var _code: LineEdit = %Code
@onready var _join: Button = %Join
@onready var _players: Label = %Players
@onready var _ready_button: Button = %Ready
@onready var _start: Button = %Start
@onready var _play: VBoxContainer = %Play
@onready var _stats: Label = %Stats
@onready var _tower_bar: TowerBar = %TowerBar
@onready var _bonus_box: VBoxContainer = %BonusBox
@onready var _info: Label = %Info
@onready var _back: Button = %Back
@onready var _fps: Label = %Fps


func _ready() -> void:
	_back.pressed.connect(_on_quit)
	_create.pressed.connect(_on_create)
	_join.pressed.connect(_on_join)
	_code.text_submitted.connect(func(_text: String) -> void: _on_join())
	_ready_button.toggled.connect(_on_ready_toggled)
	_start.pressed.connect(_on_start)
	_map_area.resized.connect(_fit_map)
	_map_area.gui_input.connect(_on_map_input)
	_battle.bind(_ticks)
	_fps.visible = bool(ProjectSettings.get_setting("war_seasons/debug/show_fps", false))
	# Le multijoueur n'applique pas les déblocages par vague (MatchService) : tout est proposé.
	_tower_bar.check_unlocks = false
	_tower_bar.tower_selected.connect(func(spec: TowerSpecDto) -> void: _info.text = _tower_bar.describe(spec))
	_set_lobby_enabled(false)
	_status.text = "Chargement…"

	var catalog_result: ApiResult = await Api.get_tower_catalog()
	if not catalog_result.ok:
		_status.text = catalog_result.error
		return
	_tower_bar.setup(TowerSpecDto.list_from(catalog_result.data))
	# Aperçu de la carte choisie à l'accueil (celle d'une partie créée ici).
	await _load_layout(Router.current_map_id)

	_stomp = StompClient.new()
	add_child(_stomp)
	_stomp.connected.connect(_on_connected)
	_stomp.disconnected.connect(_on_disconnected)
	_stomp.message_received.connect(_on_message)
	_stomp.stomp_error.connect(func(text: String) -> void: _info.text = "Serveur : %s" % text)
	_stomp.subscribe("/user/queue/match")
	_stomp.subscribe("/user/queue/errors")
	var err: Error = _stomp.open(Config.ws_url(), Session.token)
	_status.text = "Connexion au serveur…" if err == OK else "Connexion impossible (%s)" % error_string(err)


## Compteur de perf (réglage war_seasons/debug/show_fps).
func _process(delta: float) -> void:
	if not _fps.visible:
		return
	_fps_timer -= delta
	if _fps_timer <= 0.0:
		_fps_timer = 0.5
		_fps.text = "%d fps · %d ennemis" % [Engine.get_frames_per_second(), _battle.enemy_count()]


# --- Connexion -----------------------------------------------------------------

func _on_connected() -> void:
	_set_lobby_enabled(true)
	if _match == null:
		_status.text = "Connecté. Crée une partie ou rejoins celle d'un allié avec son code."
	else:
		_refresh_lobby()


func _on_disconnected(reason: String) -> void:
	if _leaving:
		return
	_set_lobby_enabled(false)
	_status.text = "Connexion perdue (%s). Nouvel essai…" % reason
	await get_tree().create_timer(RECONNECT_SECONDS).timeout
	if not _leaving and is_inside_tree():
		# Les abonnements (match compris) sont renvoyés à la reconnexion.
		_stomp.reopen()


func _on_message(destination: String, body: Variant) -> void:
	if destination == "/user/queue/errors":
		_info.text = str(DtoParse.dict(body).get("error", "Action refusée par le serveur"))
		return
	if _match != null and destination == "/topic/match/%s/state" % _match.id:
		var snap: MatchSnapshotDto = MatchSnapshotDto.from_variant(body)
		if snap != null:
			_apply_snapshot(snap)
		return
	if destination == "/user/queue/match" or (_match != null and destination == "/topic/match/%s" % _match.id):
		var state: MatchStateDto = MatchStateDto.from_variant(body)
		if state != null:
			await _apply_match(state)


# --- Lobby -----------------------------------------------------------------------

func _on_create() -> void:
	_info.text = ""
	_stomp.send("/app/match/create", {"mode": "COOP", "mapId": Router.current_map_id})


func _on_join() -> void:
	var code: String = _code.text.strip_edges().to_upper()
	if code.length() < 4:
		_info.text = "Entre le code donné par ton allié."
		return
	_info.text = ""
	_stomp.send("/app/match/join", {"code": code})


func _on_ready_toggled(pressed: bool) -> void:
	if _match != null:
		_stomp.send("/app/match/%s/ready" % _match.id, {"ready": pressed})


func _on_start() -> void:
	if _match != null:
		_stomp.send("/app/match/%s/start" % _match.id)


func _apply_match(state: MatchStateDto) -> void:
	_match = state
	if _subscribed_match != state.id:
		_subscribed_match = state.id
		_stomp.subscribe("/topic/match/%s" % state.id)
		_stomp.subscribe("/topic/match/%s/state" % state.id)
	if state.map_id != _layout_id:
		await _load_layout(state.map_id)
	_refresh_lobby()
	if state.status == "RUNNING" and not _ticks.playing:
		_start_board()
	elif state.status == "FINISHED":
		_end_board()


func _refresh_lobby() -> void:
	var in_match: bool = _match != null
	var in_lobby: bool = in_match and _match.status == "LOBBY"
	_lobby.visible = not in_match or in_lobby
	_create.visible = not in_match
	_join_row.visible = not in_match
	_ready_button.visible = in_lobby
	_start.visible = in_lobby and _match.is_host(Session.player_id)
	if not in_match:
		_players.text = ""
		return
	_title.text = "Coop · %s" % MapNames.label(_match.map_id)
	var lines: PackedStringArray = []
	for player: MatchStateDto.Player in _match.players:
		var state: String = "prêt" if player.ready else "en attente"
		if not player.connected:
			state = "déconnecté"
		lines.append("• %s : %s" % [player.username, state])
	_players.text = "\n".join(lines)
	var me: MatchStateDto.Player = _match.player(Session.player_id)
	_ready_button.set_pressed_no_signal(me != null and me.ready)
	_ready_button.text = "✓ Prêt" if _ready_button.button_pressed else "Je suis prêt"
	_start.disabled = not _match.can_start
	if in_lobby:
		_status.text = "Code de la partie : %s\nDonne-le à ton allié, puis indiquez que vous êtes prêts." % _match.code
		if _match.is_host(Session.player_id) and not _match.can_start:
			_status.text += "\nTu pourras démarrer quand tout le monde sera prêt."


func _set_lobby_enabled(enabled: bool) -> void:
	_create.disabled = not enabled
	_join.disabled = not enabled
	_ready_button.disabled = not enabled
	_start.disabled = not enabled or _match == null or not _match.can_start


# --- Partie live ---------------------------------------------------------------

func _start_board() -> void:
	_feed = SnapshotFeed.new()
	_feed.castle = _layout.castle if _layout != null else Vector2i(-1, -1)
	_bonus_count = -1
	_lobby.visible = false
	_play.visible = true
	_status.text = "Partie en cours · code %s" % _match.code
	_ticks.play_live()
	_info.text = "Choisis une tour puis touche une case constructible (verte). Le Mur se pose sur la route."


func _end_board() -> void:
	_ticks.stop()
	_tower_bar.busy = true
	_tower_bar.refresh()
	_rebuild_bonus_box(0)
	_status.text = "Partie terminée."
	_info.text = "Le château est tombé. Quitte pour revenir à l'accueil."


func _apply_snapshot(snap: MatchSnapshotDto) -> void:
	if _layout == null:
		return
	if snap.status == "RUNNING" and not _ticks.playing:
		_start_board()
	if _feed.towers_changed(snap):
		_towers = SnapshotFeed.towers_of(snap, _tower_bar.catalog)
		_battle.show_towers(_towers)
	_ticks.push(_feed.to_tick(snap, _towers))
	_stats.text = "Vague %d · Or %d\nChâteau %d/%d" % [snap.wave, snap.gold, snap.castle_hp, snap.castle_max_hp]
	_tower_bar.gold = snap.gold
	_tower_bar.placed = _towers
	_tower_bar.busy = snap.status != "RUNNING"
	_tower_bar.refresh()
	if snap.pending_bonuses != _bonus_count:
		_rebuild_bonus_box(snap.pending_bonuses)
	if snap.status == "FINISHED" and _ticks.playing:
		_end_board()


func _rebuild_bonus_box(count: int) -> void:
	_bonus_count = count
	for child: Node in _bonus_box.get_children():
		_bonus_box.remove_child(child)
		child.queue_free()
	_bonus_box.visible = count > 0
	if count <= 0:
		return
	var heading: Label = Label.new()
	heading.theme_type_variation = &"SmallLabel"
	heading.text = "Bonus à choisir : %d" % count
	_bonus_box.add_child(heading)
	for option: Dictionary in BONUSES:
		var button: Button = Button.new()
		button.text = str(option["label"])
		button.theme_type_variation = &"SmallButton"
		button.pressed.connect(_on_bonus.bind(str(option["type"])))
		_bonus_box.add_child(button)


func _on_bonus(bonus_type: String) -> void:
	if _match != null:
		_stomp.send("/app/match/%s/bonus" % _match.id, {"type": bonus_type})


func _on_map_input(event: InputEvent) -> void:
	var click: InputEventMouseButton = event as InputEventMouseButton
	if click == null or not click.pressed or click.button_index != MOUSE_BUTTON_LEFT or _layout == null:
		return
	var cell: Vector2i = Grid.local_to_cell(_map_view.transform.affine_inverse() * click.position)
	if not _layout.contains(cell):
		return
	_map_view.set_selected(cell)
	for tower: TowerDto in _towers:
		if tower.cell == cell:
			_info.text = "%s niv. %d" % [TowerNames.label(tower.type), tower.level]
			return
	var spec: TowerSpecDto = _tower_bar.selected_spec()
	var running: bool = _match != null and _match.status == "RUNNING" and _ticks.playing
	if not running or spec == null or not TowerBar.fits_cell(spec, _layout, cell):
		_info.text = "Case (%d, %d) : %s" % [cell.x, cell.y, CELL_LABELS.get(_layout.kind_at(cell), "?")]
		return
	var reason: String = _tower_bar.unavailable_reason(spec)
	if not reason.is_empty():
		_info.text = reason
		return
	# Le serveur valide et débite l'or ; la tour apparaît au snapshot suivant,
	# un refus arrive sur /user/queue/errors.
	_stomp.send("/app/match/%s/tower" % _match.id, {"type": spec.type, "x": cell.x, "y": cell.y})
	_info.text = "%s demandé en (%d, %d)." % [TowerNames.label(spec.type), cell.x, cell.y]


func _on_quit() -> void:
	_leaving = true
	_ticks.stop()
	if _stomp != null:
		if _match != null:
			_stomp.send("/app/match/%s/leave" % _match.id)
		_stomp.close()
	Router.goto_home()


# --- Carte -----------------------------------------------------------------------

func _load_layout(map_id: String) -> void:
	var result: ApiResult = await Api.get_map_layout(map_id)
	if not result.ok:
		_info.text = result.error
		return
	var layout: MapLayoutDto = MapLayoutDto.from_variant(result.data)
	if layout == null:
		_info.text = "Carte illisible"
		return
	_layout = layout
	_layout_id = map_id
	# Décor exporté du web (scripts/visual-export) ; absent → cases colorées.
	var decor: DecorSet = DecorSet.load_for(layout.id)
	_map_view.show_layout(layout, decor.ground if decor != null else null)
	_battle.setup(layout, decor)
	_feed.castle = layout.castle
	_title.text = "Coop · %s" % MapNames.label(map_id)
	_fit_map()


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
