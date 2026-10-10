extends MatchScreen
## Écran versus (rush, 1 contre 1) : chacun défend son château sur son propre
## plateau et dépense son or pour envoyer des ennemis chez l'adversaire, ce qui
## augmente son revenu passif. Le dernier château debout gagne.
##
## Le socle (MatchScreen) gère lobby, connexion, pose, bonus, chat et reprise ;
## ici : envois (catalogue serveur), aperçu de la grille adverse et bilan du duel.
## L'état de jeu arrive par joueur sur /topic/match/{id}/player/{playerId}
## (VersusPlayerView côté serveur).

var _view: VersusViewDto
var _winner_id: String = ""

@onready var _send_box: VBoxContainer = %SendBox
@onready var _send_bar: SendBar = %SendBar
@onready var _opp_box: VBoxContainer = %OppBox
@onready var _opp_info: Label = %OppInfo
@onready var _mini: MiniBoard = %MiniBoard


func _ready() -> void:
	_send_bar.send_requested.connect(_on_send)
	_send_box.visible = false
	_opp_box.visible = false
	super()


func _mode() -> String:
	return "VERSUS"


func _mode_label() -> String:
	return "Versus"


func _create_label() -> String:
	return "Créer un duel"


func _partner() -> String:
	return "adversaire"


func _load_mode_catalog() -> String:
	var result: ApiResult = await Api.get_send_catalog()
	if not result.ok:
		return result.error
	_send_bar.setup(SendSpecDto.list_from(result.data))
	return ""


func _game_topic(match_id: String) -> String:
	return "/topic/match/%s/player/%s" % [match_id, Session.player_id]


func _read_game(body: Variant) -> MatchSnapshotDto:
	var view: VersusViewDto = VersusViewDto.from_variant(body)
	if view == null:
		return null
	_view = view
	if not view.winner_id.is_empty():
		_winner_id = view.winner_id
	_show_opponent()
	return view.board


func _extra_stats() -> String:
	if _view == null:
		return ""
	return "Revenu +%d/vague · %d tués" % [_view.income, _view.score]


func _after_snapshot(snap: MatchSnapshotDto) -> void:
	_send_bar.gold = snap.gold
	_send_bar.busy = snap.status != "RUNNING" or (_view != null and _view.defeated)
	_send_bar.refresh()


func _on_board_shown(shown: bool) -> void:
	_send_box.visible = shown
	_opp_box.visible = shown
	if shown:
		_mini.setup(_layout)
	else:
		_view = null
		_winner_id = ""
		_mini.show_opponent(null)
		_opp_info.text = ""


func _end_texts() -> PackedStringArray:
	var winner: String = _winner_id if not _winner_id.is_empty() else (_match.winner_id if _match != null else "")
	var title: String = "Le duel est terminé"
	if not winner.is_empty():
		title = "Victoire !" if winner == Session.player_id else "Défaite"
	var summary: String = "Le dernier château debout l'emporte."
	if _view != null and _view.opponent != null:
		summary = "Toi : vague %d, %d tués\n%s : vague %d, %d tués" % [
			_view.board.wave if _view.board != null else _last_wave, _view.score,
			_view.opponent.username, _view.opponent.wave, _view.opponent.score]
	elif _last_wave > 0:
		summary = "Duel terminé à la vague %d." % _last_wave
	return PackedStringArray([title, summary])


func _show_opponent() -> void:
	if _view == null or _view.opponent == null:
		return
	var opp: VersusViewDto.Opponent = _view.opponent
	_opp_info.text = "⚔ %s%s\nChâteau %d/%d · Vague %d · %d tués" % [
		opp.username, " (vaincu)" if opp.defeated else "",
		maxi(opp.castle_hp, 0), opp.castle_max_hp, opp.wave, opp.score]
	_mini.show_opponent(opp)


## L'or est revalidé par le serveur ; un refus arrive sur /user/queue/errors.
func _on_send(type: String) -> void:
	if _match == null:
		return
	_stomp.send("/app/match/%s/send" % _match.id, {"type": type})
	var target: String = _view.opponent.username if _view != null and _view.opponent != null else "l'adversaire"
	_info.text = "%s envoyé chez %s." % [EnemyNames.label(type), target]
