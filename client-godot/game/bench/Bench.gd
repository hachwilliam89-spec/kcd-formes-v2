extends Control
## Banc de perf : rejoue la vague du banc de charge web (scripts/perf-bench :
## 200 ennemis, 32 tours, graine 1 — exportée en assets/baked/<carte>/bench.json
## par scripts/visual-export) avec les vraies vues du jeu, et mesure chaque image.
##
## Hors ligne : aucun appel au backend. Sert à décider du spike (ADR 0001) :
## même vague que le banc web, mesurée sur le téléphone.

const MAP_ID: String = "desert"
const WARMUP_SECONDS: float = 1.5

var _frames_ms: Array[float] = []
var _game_ms: Array[float] = []
var _render_ms: Array[float] = []
var _gpu_ms: Array[float] = []
var _max_enemies: int = 0
var _recording: bool = false
var _started_at: float = 0.0
## Sorties de l'app (onglet ou appli en arrière-plan) pendant la mesure :
## l'horloge murale continue mais aucune image n'est produite.
var _interruptions: int = 0
var _layout: MapLayoutDto

@onready var _map_area: Control = %MapArea
@onready var _map_view: MapView = %MapView
@onready var _battle: BattleView = %BattleView
@onready var _ticks: TickPlayer = %TickPlayer
@onready var _live: Label = %Live
@onready var _results: Label = %Results
@onready var _back: Button = %Back


func _ready() -> void:
	_back.pressed.connect(_on_back)
	_map_area.resized.connect(_fit_map)
	_battle.bind(_ticks)
	_ticks.finished.connect(_on_finished)
	var path: String = "%s/%s/bench.json" % [DecorSet.ROOT, MAP_ID]
	if not FileAccess.file_exists(path):
		_results.text = "Vague du banc absente.\nLance ./scripts/sync-godot-assets.sh puis réimporte le projet."
		return
	_results.text = "Chargement de la vague…"
	await get_tree().process_frame
	var data: Dictionary = DtoParse.dict(JSON.parse_string(FileAccess.get_file_as_string(path)))
	_layout = MapLayoutDto.from_variant({"id": MAP_ID, "width": data.get("width", 20), "height": data.get("height", 16),
		"castle": data.get("castle", {"x": 0, "y": 0})})
	var decor: DecorSet = DecorSet.load_for(MAP_ID)
	_map_view.show_layout(_layout, decor.ground if decor != null else null)
	_battle.setup(_layout, decor)
	var towers: Array[TowerDto] = []
	for item: Variant in DtoParse.array(data.get("towers")):
		var tower: TowerDto = TowerDto.from_variant(item)
		if tower != null:
			towers.append(tower)
	_battle.show_towers(towers)
	var ticks: Array[TickDto] = []
	for item: Variant in DtoParse.array(data.get("ticks")):
		var tick: TickDto = TickDto.from_variant(item)
		if tick != null:
			ticks.append(tick)
	_fit_map()
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), true)
	_results.text = "%d ennemis, %d tours, %d ticks.\nMesure en cours…" % [int(data.get("enemies", 0)), towers.size(), ticks.size()]
	await get_tree().create_timer(WARMUP_SECONDS).timeout
	_battle.take_cpu_usec()
	_recording = true
	_started_at = Time.get_ticks_msec() / 1000.0
	_ticks.play(ticks)


func _notification(what: int) -> void:
	if _recording and (what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED):
		_interruptions += 1


func _process(delta: float) -> void:
	if not _recording:
		return
	var rid: RID = get_viewport().get_viewport_rid()
	_frames_ms.append(delta * 1000.0)
	_game_ms.append(_battle.take_cpu_usec() / 1000.0)
	_render_ms.append(RenderingServer.viewport_get_measured_render_time_cpu(rid))
	_gpu_ms.append(RenderingServer.viewport_get_measured_render_time_gpu(rid))
	_max_enemies = maxi(_max_enemies, _battle.enemy_count())
	if _frames_ms.size() % 30 == 0:
		_live.text = "%d fps · %d ennemis" % [Engine.get_frames_per_second(), _battle.enemy_count()]


func _on_finished() -> void:
	_recording = false
	var wall: float = Time.get_ticks_msec() / 1000.0 - _started_at
	# Durée = somme des images, pas l'horloge murale : une mise en arrière-plan
	# (changement d'appli pour une capture…) gonflerait la durée sans image.
	var duration: float = 0.0
	for ms: float in _frames_ms:
		duration += ms / 1000.0
	var report: Dictionary = {
		"date": Time.get_datetime_string_from_system(),
		"device": OS.get_model_name(),
		"os": "%s %s" % [OS.get_name(), OS.get_version()],
		"gpu": RenderingServer.get_video_adapter_name(),
		"renderer": str(ProjectSettings.get_setting_with_override("rendering/renderer/rendering_method")),
		"resolution": "%dx%d" % [get_window().size.x, get_window().size.y],
		"frames": _frames_ms.size(),
		"duration_s": snappedf(duration, 0.1),
		"wall_s": snappedf(wall, 0.1),
		"interruptions": _interruptions,
		"avg_fps": snappedf(_frames_ms.size() / maxf(duration, 0.001), 0.1),
		"frame_ms": _stats(_frames_ms),
		"over_16_7ms": _frames_ms.filter(func(ms: float) -> bool: return ms > 16.7).size(),
		"over_33ms": _frames_ms.filter(func(ms: float) -> bool: return ms > 33.4).size(),
		"cpu_game_ms": _stats(_game_ms),
		"cpu_render_ms": _stats(_render_ms),
		"gpu_render_ms": _stats(_gpu_ms),
		"max_enemies": _max_enemies,
	}
	var json: String = JSON.stringify(report, "  ")
	print("BENCH ", JSON.stringify(report))
	var file: FileAccess = FileAccess.open("user://bench_%d.json" % Time.get_unix_time_from_system(), FileAccess.WRITE)
	if file != null:
		file.store_string(json)
	var f: Dictionary = report["frame_ms"]
	_results.text = ("Terminé : %d images en %.1f s (%.1f fps) · %d interruption(s)\nImage : moy %.1f ms · p95 %.1f · p99 %.1f · max %.1f\n"
		+ "Images > 16,7 ms : %d · > 33 ms : %d\nCPU jeu moy %.2f ms (p95 %.2f) · CPU rendu moy %.2f ms · GPU moy %.2f ms\n%d ennemis max · %s · %s") % [
		report["frames"], report["duration_s"], report["avg_fps"], report["interruptions"], f["avg"], f["p95"], f["p99"], f["max"],
		report["over_16_7ms"], report["over_33ms"], (report["cpu_game_ms"] as Dictionary)["avg"],
		(report["cpu_game_ms"] as Dictionary)["p95"], (report["cpu_render_ms"] as Dictionary)["avg"],
		(report["gpu_render_ms"] as Dictionary)["avg"], report["max_enemies"], report["device"], report["gpu"]]
	if bool(OS.get_cmdline_user_args().has("--bench-quit")):
		get_tree().quit()


func _stats(values: Array[float]) -> Dictionary:
	if values.is_empty():
		return {"avg": 0.0, "p50": 0.0, "p95": 0.0, "p99": 0.0, "max": 0.0}
	var sorted: Array[float] = values.duplicate()
	sorted.sort()
	var sum: float = 0.0
	for v: float in sorted:
		sum += v
	var at: Callable = func(q: float) -> float: return sorted[mini(sorted.size() - 1, int(q * sorted.size()))]
	return {"avg": snappedf(sum / sorted.size(), 0.01), "p50": snappedf(at.call(0.5), 0.01),
		"p95": snappedf(at.call(0.95), 0.01), "p99": snappedf(at.call(0.99), 0.01), "max": snappedf(sorted[-1], 0.01)}


func _on_back() -> void:
	_ticks.stop()
	if Session.is_logged_in():
		Router.goto_home()
	else:
		Router.goto_login()


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
