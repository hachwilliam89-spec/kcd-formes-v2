extends Node
## Son du jeu, comme frontend-web/lib/audio.ts : bruitages et musique de fond, mêmes
## fichiers que le web (copiés par scripts/sync-godot-assets.sh dans assets/sounds/,
## hors git), même mixage (bus Bruitages plus bas que la Musique) et mêmes réglages
## (volume général, coupure, Musique et Bruitages), gardés dans user://audio.cfg.
##
## Un fichier absent est ignoré sans erreur : le jeu tourne muet sans les assets.

signal changed

const ROOT: String = "res://assets/sounds"
const MUSIC: Dictionary = {"menu": "music_menu", "game": "music_game"}
## Gains de base des bus (mix de référence du web) ; les réglages 0..1 les multiplient.
const SFX_BASE: float = 0.11
const MUSIC_BASE: float = 0.8
const SFX_BUS: StringName = &"Sfx"
const MUSIC_BUS: StringName = &"Music"
## Bruitages joués en même temps au plus (les plus anciens sont coupés).
const VOICES: int = 16
const PREFS_FILE: String = "user://audio.cfg"

var volume: float = 0.7
var muted: bool = false
var sfx_level: float = 1.0
var music_level: float = 1.0

var _streams: Dictionary = {}
## Anti-rafale : dernier départ (ms) de chaque bruitage.
var _last_played: Dictionary = {}
var _voices: Array[AudioStreamPlayer] = []
var _next_voice: int = 0
var _music: AudioStreamPlayer
var _music_key: String = ""


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_ensure_bus(SFX_BUS)
	_ensure_bus(MUSIC_BUS)
	for i: int in range(VOICES):
		var voice: AudioStreamPlayer = AudioStreamPlayer.new()
		voice.bus = SFX_BUS
		add_child(voice)
		_voices.append(voice)
	_music = AudioStreamPlayer.new()
	_music.bus = MUSIC_BUS
	add_child(_music)
	_load_prefs()
	_apply()


## Joue un bruitage (chevauchement autorisé). `level` relatif 0..1, `rate` = hauteur
## et vitesse (1 = normal) ; `gap_ms` : pas de nouveau départ avant ce délai.
func play(sound: String, level: float = 1.0, rate: float = 1.0, gap_ms: int = 0) -> void:
	if muted:
		return
	var now: int = Time.get_ticks_msec()
	if gap_ms > 0 and now - int(_last_played.get(sound, -1000000)) < gap_ms:
		return
	var stream: AudioStream = _stream(sound)
	if stream == null:
		return
	_last_played[sound] = now
	var voice: AudioStreamPlayer = _voices[_next_voice]
	_next_voice = (_next_voice + 1) % _voices.size()
	voice.stream = stream
	voice.volume_db = linear_to_db(maxf(level, 0.0001))
	voice.pitch_scale = rate
	voice.play()


## Musique de fond en boucle ("menu", "game") ; "" l'arrête.
func music(key: String) -> void:
	if key == _music_key:
		return
	_music_key = key
	_music.stop()
	if key.is_empty() or not MUSIC.has(key):
		return
	var stream: AudioStream = _stream(str(MUSIC[key]))
	if stream == null:
		return
	if stream is AudioStreamMP3:
		(stream as AudioStreamMP3).loop = true
	_music.stream = stream
	_music.play()


func set_volume(value: float) -> void:
	volume = clampf(value, 0.0, 1.0)
	_apply()


func set_muted(value: bool) -> void:
	muted = value
	_apply()


func set_sfx_level(value: float) -> void:
	sfx_level = clampf(value, 0.0, 1.0)
	_apply()


func set_music_level(value: float) -> void:
	music_level = clampf(value, 0.0, 1.0)
	_apply()


func _apply() -> void:
	AudioServer.set_bus_volume_db(0, _db(volume))
	AudioServer.set_bus_mute(0, muted)
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index(SFX_BUS), _db(SFX_BASE * sfx_level))
	AudioServer.set_bus_volume_db(AudioServer.get_bus_index(MUSIC_BUS), _db(MUSIC_BASE * music_level))
	_save_prefs()
	changed.emit()


static func _db(linear: float) -> float:
	return linear_to_db(linear) if linear > 0.0001 else -80.0


func _stream(sound: String) -> AudioStream:
	if not _streams.has(sound):
		var path: String = "%s/%s.mp3" % [ROOT, sound]
		_streams[sound] = load(path) as AudioStream if ResourceLoader.exists(path) else null
	return _streams[sound]


func _ensure_bus(bus_name: StringName) -> void:
	if AudioServer.get_bus_index(bus_name) >= 0:
		return
	AudioServer.add_bus()
	var index: int = AudioServer.bus_count - 1
	AudioServer.set_bus_name(index, bus_name)
	AudioServer.set_bus_send(index, &"Master")


func _load_prefs() -> void:
	var cfg: ConfigFile = ConfigFile.new()
	if cfg.load(PREFS_FILE) != OK:
		return
	volume = float(cfg.get_value("audio", "volume", volume))
	muted = bool(cfg.get_value("audio", "muted", muted))
	sfx_level = float(cfg.get_value("audio", "sfx", sfx_level))
	music_level = float(cfg.get_value("audio", "music", music_level))


func _save_prefs() -> void:
	var cfg: ConfigFile = ConfigFile.new()
	cfg.set_value("audio", "volume", volume)
	cfg.set_value("audio", "muted", muted)
	cfg.set_value("audio", "sfx", sfx_level)
	cfg.set_value("audio", "music", music_level)
	cfg.save(PREFS_FILE)
