extends Node
## Session du joueur connecté (JWT + identité), persistée dans user://.
##
## Le fichier est chiffré avec une clé dérivée de l'appareil : ça empêche une
## lecture triviale du token, ce n'est pas un coffre-fort. Sur le web, user://
## est stocké dans l'IndexedDB du navigateur.

signal changed

const FILE_PATH: String = "user://session.cfg"
const SECTION: String = "session"

var token: String = ""
var player_id: String = ""
var username: String = ""


func _ready() -> void:
	_load()


func is_logged_in() -> bool:
	return not token.is_empty()


func open(auth: AuthResponseDto) -> void:
	token = auth.token
	player_id = auth.player_id
	username = auth.username
	_save()
	changed.emit()


func clear() -> void:
	token = ""
	player_id = ""
	username = ""
	if FileAccess.file_exists(FILE_PATH):
		DirAccess.remove_absolute(FILE_PATH)
	changed.emit()


func _save() -> void:
	var cfg: ConfigFile = ConfigFile.new()
	cfg.set_value(SECTION, "token", token)
	cfg.set_value(SECTION, "player_id", player_id)
	cfg.set_value(SECTION, "username", username)
	var err: Error = cfg.save_encrypted_pass(FILE_PATH, _key())
	if err != OK:
		push_warning("Session non sauvegardée : %s" % error_string(err))


func _load() -> void:
	if not FileAccess.file_exists(FILE_PATH):
		return
	var cfg: ConfigFile = ConfigFile.new()
	if cfg.load_encrypted_pass(FILE_PATH, _key()) != OK:
		return
	token = str(cfg.get_value(SECTION, "token", ""))
	player_id = str(cfg.get_value(SECTION, "player_id", ""))
	username = str(cfg.get_value(SECTION, "username", ""))


func _key() -> String:
	# OS.get_unique_id() n'existe pas sur le web : clé fixe dans ce cas.
	if OS.has_feature("web"):
		return "war-seasons"
	return "war-seasons:" + OS.get_unique_id()
