class_name MatchScreen
extends Control
## Socle des écrans multijoueur (coop, versus) : lobby (créer / rejoindre par code /
## prêt / démarrer), partie live, pose de tours, bonus, chat et écran de fin.
##
## Contrôleur : relaie les intentions du joueur au serveur par STOMP (StompClient)
## et passe l'état reçu aux vues. Le serveur simule tout (MatchEngine, un tick toutes
## les 120 ms) ; le plateau rejoue ses snapshots avec le même rendu qu'en solo
## (SnapshotFeed → TickPlayer en direct → BattleView). Destinations : voir
## backend MatchStompController et StompMatchBroadcaster.
##
## Robustesse (docs/CLIENT_GODOT.md §4) : reconnexion automatique après une coupure,
## chien de garde si les snapshots cessent d'arriver sur une connexion restée
## ouverte (réseau mobile, appli en arrière-plan), et reprise après un arrêt de
## l'appli : le code de la partie en cours est gardé, rejoindre une partie dont on
## est membre la reprend (Match.addPlayer).
##
## Chaque mode (Coop.gd, Versus.gd) précise ce qui lui est propre en redéfinissant
## les méthodes de la section « Propre au mode ».

## Après une coupure, nouvel essai de connexion au bout de ce délai.
const RECONNECT_SECONDS: float = 3.0
## Partie en cours sans snapshot depuis ce délai : connexion rouverte.
const STALE_SECONDS: float = 4.0
## Code de la partie en cours, gardé pour la reprendre après un arrêt de l'appli
## (une clé par mode : la reprise d'un duel ne s'affiche pas dans la coop).
const RESUME_FILE: String = "user://multi.cfg"

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
## Abonnements propres au match courant (résiliés en le quittant).
var _match_subs: Array[String] = []
var _bonus_count: int = -1
var _last_wave: int = 0
var _since_state: float = 0.0
var _reconnect_pending: bool = false
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
@onready var _chat: ChatBox = %Chat
@onready var _info: Label = %Info
@onready var _back: Button = %Back
@onready var _fps: Label = %Fps
@onready var _end_panel: PanelContainer = %EndPanel
@onready var _end_title: Label = %EndTitle
@onready var _end_summary: Label = %EndSummary
@onready var _replay: Button = %Replay
@onready var _home: Button = %Home


func _ready() -> void:
	_back.pressed.connect(_on_quit)
	_home.pressed.connect(_on_quit)
	_replay.pressed.connect(_on_replay)
	_create.pressed.connect(_on_create)
	_join.pressed.connect(_on_join)
	_code.text_submitted.connect(func(_text: String) -> void: _on_join())
	_ready_button.toggled.connect(_on_ready_toggled)
	_start.pressed.connect(_on_start)
	_chat.message_submitted.connect(_on_chat_submitted)
	_map_area.resized.connect(_fit_map)
	_map_area.gui_input.connect(_on_map_input)
	_battle.bind(_ticks)
	_fps.visible = bool(ProjectSettings.get_setting("war_seasons/debug/show_fps", false))
	# Le multijoueur n'applique pas les déblocages par vague (MatchService) : tout est proposé.
	_tower_bar.check_unlocks = false
	_tower_bar.tower_selected.connect(func(spec: TowerSpecDto) -> void: _info.text = _tower_bar.describe(spec))
	_title.text = _mode_label()
	_create.text = _create_label()
	_code.text = _load_resume_code()
	_set_online(false)
	_status.text = "Chargement…"

	var catalog_result: ApiResult = await Api.get_tower_catalog()
	if not catalog_result.ok:
		_status.text = catalog_result.error
		return
	_tower_bar.setup(TowerSpecDto.list_from(catalog_result.data))
	var error: String = await _load_mode_catalog()
	if not error.is_empty():
		_status.text = error
		return
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
	if err != OK:
		_schedule_reconnect()


func _process(delta: float) -> void:
	_watch_feed(delta)
	if not _fps.visible:
		return
	_fps_timer -= delta
	if _fps_timer <= 0.0:
		_fps_timer = 0.5
		_fps.text = "%d fps · %d ennemis" % [Engine.get_frames_per_second(), _battle.enemy_count()]


# --- Propre au mode (redéfini par Coop.gd et Versus.gd) -------------------------

## Mode envoyé à la création du match (MatchMode côté serveur).
func _mode() -> String:
	return "COOP"


## Nom de l'écran, en tête du panneau.
func _mode_label() -> String:
	return "Coop"


func _create_label() -> String:
	return "Créer une partie"


## L'autre joueur, dans les messages (« ton allié », « ton adversaire »).
func _partner() -> String:
	return "allié"


## Données de jeu propres au mode à charger avant de se connecter ; renvoie
## un message d'erreur, vide si tout va bien.
func _load_mode_catalog() -> String:
	return ""


## Destination des états de jeu destinés à ce joueur.
func _game_topic(match_id: String) -> String:
	return "/topic/match/%s/state" % match_id


## Décode un état de jeu reçu sur _game_topic : renvoie le plateau à afficher
## (null s'il n'y en a pas) et met à jour ce que le mode affiche en plus.
func _read_game(body: Variant) -> MatchSnapshotDto:
	return MatchSnapshotDto.from_variant(body)


## Lignes ajoutées sous « Vague · Or · Château ».
func _extra_stats() -> String:
	return ""


## Appelé après chaque snapshot appliqué (or, état de partie à jour).
func _after_snapshot(_snap: MatchSnapshotDto) -> void:
	pass


## Titre et bilan de l'écran de fin.
func _end_texts() -> PackedStringArray:
	var summary: String = "Vous avez tenu ensemble jusqu'à la vague %d." % _last_wave if _last_wave > 0 else "La partie est terminée."
	return PackedStringArray(["Le château est tombé", summary])


## Le plateau démarre (true) ou le joueur quitte le match (false).
func _on_board_shown(_shown: bool) -> void:
	pass


# --- Connexion -----------------------------------------------------------------

func _on_connected() -> void:
	_set_online(true)
	_since_state = 0.0
	if _match == null:
		_status.text = "Connecté. Crée une partie ou rejoins celle de ton %s avec son code." % _partner()
		if not _code.text.is_empty():
			_status.text = "Partie interrompue : son code %s est prérempli, touche Rejoindre pour la reprendre." % _code.text
	elif _match.status == "RUNNING":
		_status.text = _running_status()
	else:
		_refresh_lobby()


func _on_disconnected(reason: String) -> void:
	if _leaving:
		return
	_set_online(false)
	# Code 0 ou -1 : fermeture sans motif (réseau coupé), rien d'utile à afficher.
	var detail: String = "" if reason.is_empty() or reason.begins_with("code 0") or reason.begins_with("code -1") else " (%s)" % reason
	_status.text = "Connexion perdue%s. Nouvel essai…" % detail
	_schedule_reconnect()


## Un seul essai programmé à la fois ; les abonnements (match compris) sont
## renvoyés par StompClient à la reconnexion.
func _schedule_reconnect() -> void:
	if _reconnect_pending:
		return
	_reconnect_pending = true
	await get_tree().create_timer(RECONNECT_SECONDS).timeout
	_reconnect_pending = false
	if _leaving or not is_inside_tree() or _stomp.is_open():
		return
	if _stomp.reopen() != OK:
		_schedule_reconnect()


## Chien de garde : une connexion peut rester « ouverte » sans plus rien recevoir
## (réseau mobile coupé sans fermeture, appli suspendue). En partie, le serveur
## diffuse un état toutes les 120 ms : un silence prolongé force la reconnexion.
func _watch_feed(delta: float) -> void:
	if _stomp == null or _leaving or _match == null or _match.status != "RUNNING" or not _ticks.playing:
		return
	if _stomp.state == StompClient.State.IDLE:
		return # coupure déjà détectée, reconnexion programmée
	_since_state += delta
	if _since_state < STALE_SECONDS:
		return
	_since_state = 0.0
	_set_online(false)
	_status.text = "Plus de nouvelles du serveur. Reconnexion…"
	if _stomp.reopen() != OK:
		_schedule_reconnect()


func _on_message(destination: String, body: Variant) -> void:
	if destination == "/user/queue/errors":
		_info.text = str(DtoParse.dict(body).get("error", "Action refusée par le serveur"))
		_set_bonus_buttons_enabled(true) # choix refusé : on peut réessayer
		return
	if _match != null and destination == _game_topic(_match.id):
		_since_state = 0.0
		var snap: MatchSnapshotDto = _read_game(body)
		if snap != null:
			_apply_snapshot(snap)
		return
	if _match != null and destination == "/topic/match/%s/chat" % _match.id:
		var message: ChatMessageDto = ChatMessageDto.from_variant(body)
		if message != null:
			_chat.add_message(message, message.sender_id == Session.player_id)
		return
	if destination == "/user/queue/match" or (_match != null and destination == "/topic/match/%s" % _match.id):
		var state: MatchStateDto = MatchStateDto.from_variant(body)
		if state != null:
			await _apply_match(state)


# --- Lobby -----------------------------------------------------------------------

func _on_create() -> void:
	_info.text = ""
	_stomp.send("/app/match/create", {"mode": _mode(), "mapId": Router.current_map_id})


func _on_join() -> void:
	var code: String = _code.text.strip_edges().to_upper()
	if code.length() < 4:
		_info.text = "Entre le code donné par ton %s." % _partner()
		return
	_info.text = ""
	_stomp.send("/app/match/join", {"code": code})


func _on_ready_toggled(pressed: bool) -> void:
	if _match != null:
		_stomp.send("/app/match/%s/ready" % _match.id, {"ready": pressed})


func _on_start() -> void:
	if _match != null:
		_stomp.send("/app/match/%s/start" % _match.id)


func _on_chat_submitted(text: String) -> void:
	if _match != null:
		_stomp.send("/app/match/%s/chat" % _match.id, {"text": text})


func _apply_match(state: MatchStateDto) -> void:
	if state.mode != _mode():
		# Code d'une partie de l'autre mode : on ne la rejoint pas depuis cet écran.
		_info.text = "Ce code est celui d'une partie %s : rejoins-la depuis son écran." % ("coop" if state.mode == "COOP" else "versus")
		# Le serveur vient de nous ajouter à son lobby : on en ressort. (Une partie
		# en cours dont on est déjà membre n'est pas quittée pour autant.)
		if state.status == "LOBBY":
			_stomp.send("/app/match/%s/leave" % state.id)
		return
	_match = state
	_last_wave = maxi(_last_wave, state.wave)
	if _subscribed_match != state.id:
		_subscribed_match = state.id
		_match_subs.append(_stomp.subscribe("/topic/match/%s" % state.id))
		_match_subs.append(_stomp.subscribe(_game_topic(state.id)))
		_match_subs.append(_stomp.subscribe("/topic/match/%s/chat" % state.id))
	if state.status == "FINISHED":
		_clear_resume_code()
	else:
		_save_resume_code(state.code)
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
	_chat.visible = in_match
	if not in_match:
		_players.text = ""
		return
	_title.text = "%s · %s" % [_mode_label(), MapNames.label(_match.map_id)]
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
		_status.text = "Code de la partie : %s\nDonne-le à ton %s, puis indiquez que vous êtes prêts." % [_match.code, _partner()]
		if _match.is_host(Session.player_id) and not _match.can_start:
			_status.text += "\nTu pourras démarrer quand tout le monde sera prêt."


## Actions réseau possibles seulement connecté.
func _set_online(online: bool) -> void:
	_create.disabled = not online
	_join.disabled = not online
	_ready_button.disabled = not online
	_start.disabled = not online or _match == null or not _match.can_start
	_chat.set_enabled(online)


# --- Partie live ---------------------------------------------------------------

func _start_board() -> void:
	_feed = SnapshotFeed.new()
	_feed.castle = _layout.castle if _layout != null else Vector2i(-1, -1)
	_bonus_count = -1
	_since_state = 0.0
	_lobby.visible = false
	_end_panel.visible = false
	_play.visible = true
	_status.text = _running_status()
	_ticks.play_live()
	_on_board_shown(true)
	_info.text = "Choisis une tour puis touche une case constructible (verte). Le Mur se pose sur la route."


func _running_status() -> String:
	return "Partie en cours · code %s" % _match.code


func _end_board() -> void:
	if _end_panel.visible:
		return
	_ticks.stop()
	_tower_bar.busy = true
	_tower_bar.refresh()
	_rebuild_bonus_box(0, [])
	_clear_resume_code()
	_status.text = "Partie terminée."
	_info.text = ""
	var texts: PackedStringArray = _end_texts()
	_end_title.text = texts[0]
	_end_summary.text = texts[1]
	_end_panel.visible = true


func _apply_snapshot(snap: MatchSnapshotDto) -> void:
	if _layout == null:
		return
	if snap.status == "RUNNING" and not _ticks.playing:
		_start_board()
	elif _feed.is_gap(snap):
		# Retour après une coupure : on repart du snapshot reçu, sans interpoler le trou.
		_ticks.play_live()
	if _feed.towers_changed(snap):
		_towers = SnapshotFeed.towers_of(snap, _tower_bar.catalog)
		_battle.show_towers(_towers)
	_ticks.push(_feed.to_tick(snap, _towers))
	_last_wave = maxi(_last_wave, snap.wave)
	_stats.text = "Vague %d · Or %d\nChâteau %d/%d" % [snap.wave, snap.gold, snap.castle_hp, snap.castle_max_hp]
	var extra: String = _extra_stats()
	if not extra.is_empty():
		_stats.text += "\n" + extra
	_tower_bar.gold = snap.gold
	_tower_bar.placed = _towers
	_tower_bar.busy = snap.status != "RUNNING"
	_tower_bar.refresh()
	if snap.pending_bonuses != _bonus_count:
		_rebuild_bonus_box(snap.pending_bonuses, snap.bonus_options)
	_after_snapshot(snap)
	if snap.status == "FINISHED":
		_end_board()


## Bonus de palier : options et libellés fournis par le serveur dans le snapshot.
func _rebuild_bonus_box(count: int, options: Array[BonusOptionDto]) -> void:
	_bonus_count = count
	for child: Node in _bonus_box.get_children():
		_bonus_box.remove_child(child)
		child.queue_free()
	_bonus_box.visible = count > 0 and not options.is_empty()
	if not _bonus_box.visible:
		return
	var heading: Label = Label.new()
	heading.theme_type_variation = &"SmallLabel"
	heading.text = "Bonus à choisir : %d" % count
	_bonus_box.add_child(heading)
	for option: BonusOptionDto in options:
		var button: Button = Button.new()
		button.text = option.label
		button.tooltip_text = option.description
		button.theme_type_variation = &"SmallButton"
		button.pressed.connect(_on_bonus.bind(option.type))
		_bonus_box.add_child(button)


## Un choix à la fois : les boutons se réactivent au snapshot suivant (nouveau
## compte de bonus) ou si le serveur refuse le choix.
func _on_bonus(bonus_type: String) -> void:
	if _match == null:
		return
	_set_bonus_buttons_enabled(false)
	_stomp.send("/app/match/%s/bonus" % _match.id, {"type": bonus_type})


func _set_bonus_buttons_enabled(enabled: bool) -> void:
	for child: Node in _bonus_box.get_children():
		var button: Button = child as Button
		if button != null:
			button.disabled = not enabled


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


# --- Sortie --------------------------------------------------------------------

## Fin de partie → retour au lobby pour en créer ou rejoindre une autre.
func _on_replay() -> void:
	_leave_match()
	_refresh_lobby()
	_set_online(_stomp.is_open())
	_status.text = "Crée une nouvelle partie ou rejoins celle de ton %s avec son code." % _partner()


## Quitte le match courant (côté serveur aussi) et vide le plateau.
func _leave_match() -> void:
	if _match != null and _stomp != null:
		_stomp.send("/app/match/%s/leave" % _match.id)
		for id: String in _match_subs:
			_stomp.unsubscribe(id)
	_match_subs.clear()
	_match = null
	_subscribed_match = ""
	_last_wave = 0
	_clear_resume_code()
	_code.text = ""
	_ticks.reset()
	_towers = []
	_battle.show_towers(_towers)
	_feed = SnapshotFeed.new()
	_rebuild_bonus_box(0, [])
	_chat.clear_messages()
	_play.visible = false
	_end_panel.visible = false
	_info.text = ""
	_title.text = _mode_label()
	_on_board_shown(false)


func _on_quit() -> void:
	_leaving = true
	_ticks.stop()
	if _stomp != null:
		if _match != null:
			_stomp.send("/app/match/%s/leave" % _match.id)
		_stomp.close()
	_clear_resume_code()
	Router.goto_home()


# --- Reprise après un arrêt de l'appli -----------------------------------------

func _resume_section() -> String:
	return _mode().to_lower()


func _load_resume_code() -> String:
	var cfg: ConfigFile = ConfigFile.new()
	if cfg.load(RESUME_FILE) != OK:
		return ""
	return str(cfg.get_value(_resume_section(), "match_code", ""))


func _save_resume_code(code: String) -> void:
	var cfg: ConfigFile = ConfigFile.new()
	cfg.load(RESUME_FILE) # absent la première fois : on part d'un fichier vide
	cfg.set_value(_resume_section(), "match_code", code)
	cfg.save(RESUME_FILE)


func _clear_resume_code() -> void:
	var cfg: ConfigFile = ConfigFile.new()
	if cfg.load(RESUME_FILE) != OK:
		return
	if cfg.has_section_key(_resume_section(), "match_code"):
		cfg.erase_section_key(_resume_section(), "match_code")
		cfg.save(RESUME_FILE)


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
	_title.text = "%s · %s" % [_mode_label(), MapNames.label(map_id)]
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
