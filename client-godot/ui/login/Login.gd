extends Control
## Connexion / inscription.
##
## Seule vérification locale : champs non vides. Les contraintes (longueur du
## pseudo, du mot de passe, format de l'email) restent au backend, qui renvoie
## un message d'erreur affiché tel quel — pas de règle dupliquée côté client.

enum Mode { LOGIN, REGISTER }

var _mode: Mode = Mode.LOGIN
var _busy: bool = false

@onready var _username: LineEdit = %Username
@onready var _email: LineEdit = %Email
@onready var _password: LineEdit = %Password
@onready var _error: Label = %Error
@onready var _submit: Button = %Submit
@onready var _mode_switch: Button = %ModeSwitch


func _ready() -> void:
	var bench: Button = %Bench
	bench.visible = bool(ProjectSettings.get_setting("war_seasons/debug/show_fps", false))
	bench.pressed.connect(Router.goto_bench)
	_submit.pressed.connect(_on_submit)
	_mode_switch.pressed.connect(_toggle_mode)
	_password.text_submitted.connect(_on_text_submitted)
	_apply_mode()
	_username.grab_focus()


func _toggle_mode() -> void:
	_mode = Mode.REGISTER if _mode == Mode.LOGIN else Mode.LOGIN
	_apply_mode()


func _apply_mode() -> void:
	var registering: bool = _mode == Mode.REGISTER
	_email.visible = registering
	_mode_switch.text = "Déjà un compte ? Se connecter" if registering else "Pas de compte ? S'inscrire"
	_apply_submit_label()
	_show_error("")


func _on_text_submitted(_text: String) -> void:
	_on_submit()


func _on_submit() -> void:
	if _busy:
		return
	var missing: String = _missing_field()
	if not missing.is_empty():
		_show_error(missing)
		return

	_set_busy(true)
	var result: ApiResult
	if _mode == Mode.REGISTER:
		result = await Api.register(_username.text.strip_edges(), _email.text.strip_edges(), _password.text)
	else:
		result = await Api.login(_username.text.strip_edges(), _password.text)
	_set_busy(false)

	if not result.ok:
		_show_error(result.error)
		return
	var auth: AuthResponseDto = AuthResponseDto.from_variant(result.data)
	if auth == null:
		_show_error("Réponse du serveur inattendue")
		return
	Session.open(auth)
	Router.goto_home()


func _missing_field() -> String:
	if _username.text.strip_edges().is_empty():
		return "Pseudo requis"
	if _mode == Mode.REGISTER and _email.text.strip_edges().is_empty():
		return "Email requis"
	if _password.text.is_empty():
		return "Mot de passe requis"
	return ""


func _set_busy(busy: bool) -> void:
	_busy = busy
	_submit.disabled = busy
	_mode_switch.disabled = busy
	if busy:
		_submit.text = "Patiente…"
	else:
		_apply_submit_label()


func _apply_submit_label() -> void:
	_submit.text = "Créer le compte" if _mode == Mode.REGISTER else "Se connecter"


func _show_error(message: String) -> void:
	_error.text = message
	_error.visible = not message.is_empty()
