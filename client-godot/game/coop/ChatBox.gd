class_name ChatBox
extends VBoxContainer
## Chat de match (coop, puis versus) : fil des messages + saisie.
##
## Vue seulement : l'écran relaie la saisie au serveur (/app/match/{id}/chat) et
## lui passe les messages reçus (/topic/match/{id}/chat, ChatMessageDto). Le texte
## des joueurs est ajouté tel quel (add_text), jamais interprété comme du BBCode.

signal message_submitted(text: String)

## Messages gardés à l'écran (les plus anciens disparaissent).
const MAX_MESSAGES: int = 100
## Même borne que le serveur (MatchService.sendChat) : rien n'est coupé en silence.
const MAX_LENGTH: int = 300
const MINE_COLOR: Color = Color("#f2c14e")
const OTHER_COLOR: Color = Color("#8fc7ff")

var _log: RichTextLabel
var _input: LineEdit
var _send: Button


func _ready() -> void:
	_log = RichTextLabel.new()
	_log.custom_minimum_size = Vector2(0, 110)
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log.scroll_following = true
	_log.selection_enabled = true
	_log.bbcode_enabled = false
	_log.theme_type_variation = &"ChatLog"
	add_child(_log)

	var row: HBoxContainer = HBoxContainer.new()
	add_child(row)
	_input = LineEdit.new()
	_input.placeholder_text = "Message…"
	_input.theme_type_variation = &"ChatInput"
	_input.max_length = MAX_LENGTH
	_input.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_input.text_submitted.connect(func(_text: String) -> void: _submit())
	row.add_child(_input)
	_send = Button.new()
	_send.text = "Envoyer"
	_send.theme_type_variation = &"SmallButton"
	_send.pressed.connect(_submit)
	row.add_child(_send)


func add_message(message: ChatMessageDto, mine: bool) -> void:
	if _log.get_paragraph_count() > MAX_MESSAGES:
		_log.remove_paragraph(0)
	_log.push_color(MINE_COLOR if mine else OTHER_COLOR)
	_log.add_text("%s : " % message.username)
	_log.pop()
	_log.add_text(message.text)
	_log.newline()


func clear_messages() -> void:
	_log.clear()
	_input.clear()


## Saisie possible uniquement connecté (le message partirait dans le vide sinon).
func set_enabled(enabled: bool) -> void:
	_input.editable = enabled
	_send.disabled = not enabled


func _submit() -> void:
	var text: String = _input.text.strip_edges()
	if text.is_empty() or _send.disabled:
		return
	_input.clear()
	message_submitted.emit(text)
