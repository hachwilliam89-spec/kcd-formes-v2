extends Node
## Navigation entre les écrans. Centralisée pour que la logique réseau
## (ex. token expiré) puisse renvoyer à la connexion sans connaître les scènes.

const LOGIN: String = "res://ui/login/Login.tscn"
const HOME: String = "res://ui/home/Home.tscn"
const GAME: String = "res://game/Game.tscn"
const BENCH: String = "res://game/bench/Bench.tscn"

## Carte à ouvrir par l'écran de jeu (posée par goto_game avant le changement de scène).
var current_map_id: String = "desert"


func _ready() -> void:
	Api.unauthorized.connect(goto_login)


func goto_login() -> void:
	_goto(LOGIN)


func goto_home() -> void:
	_goto(HOME)


func goto_game(map_id: String) -> void:
	current_map_id = map_id
	_goto(GAME)


func goto_bench() -> void:
	_goto(BENCH)


## Banc demandé au lancement : `godot --path client-godot -- --bench` (desktop/Android)
## ou `?bench` dans l'URL (export web).
func bench_requested() -> bool:
	if OS.get_cmdline_user_args().has("--bench"):
		return true
	if OS.has_feature("web"):
		return str(JavaScriptBridge.eval("location.search", true)).contains("bench")
	return false


func _goto(path: String) -> void:
	# Différé : un changement de scène pendant un _ready() ou un signal est refusé.
	get_tree().change_scene_to_file.call_deferred(path)
