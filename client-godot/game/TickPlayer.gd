class_name TickPlayer
extends Node
## Rejoue à cadence fixe les ticks d'une vague déjà simulée par le serveur (solo),
## ou le flux de ticks d'une partie live poussés un par un (multijoueur, `play_live`).
##
## Logique pure (docs/CLIENT_GODOT.md §3, règle 1) : aucun accès aux nœuds
## visuels. Les vues s'abonnent à `tick_played` / `finished` et lisent
## `enemy_positions()` à chaque image pour un mouvement fluide.

signal tick_played(tick: TickDto)
signal finished

## Durée d'affichage d'un tick (même cadence que frontend-web : TICK_DELAY_MS = 120,
## et que le serveur live : MatchTicker.TICK_MS = 120).
const TICK_SECONDS: float = 0.12
## Direct : retard maximal toléré (en ticks) avant de rattraper le plus récent.
const LIVE_MAX_LAG: int = 3

var previous: TickDto
var current: TickDto
var playing: bool = false

var _ticks: Array[TickDto] = []
var _index: int = -1
var _elapsed: float = 0.0
## Direct : les ticks arrivent par push() au rythme du réseau ; pas de fin de vague.
var _live: bool = false


func play(ticks: Array[TickDto]) -> void:
	_live = false
	_ticks = ticks
	_index = -1
	previous = null
	current = null
	_elapsed = TICK_SECONDS
	playing = not ticks.is_empty()
	if not playing:
		finished.emit()


func stop() -> void:
	playing = false
	_live = false


## Arrête la lecture et oublie les ticks : plus aucun ennemi n'est affiché.
func reset() -> void:
	stop()
	_ticks = []
	_index = -1
	previous = null
	current = null


## Mode direct : la lecture attend les ticks poussés par push() (snapshots serveur).
func play_live() -> void:
	_live = true
	_ticks = []
	_index = -1
	previous = null
	current = null
	_elapsed = TICK_SECONDS
	playing = true


## Ajoute un tick reçu en direct. Si le réseau en a accumulé (onglet en arrière-plan,
## à-coup), on saute en avant pour ne garder qu'un retard de LIVE_MAX_LAG ticks.
func push(tick: TickDto) -> void:
	if not _live:
		return
	_ticks.append(tick)
	if _ticks.size() - 1 - _index > LIVE_MAX_LAG:
		_index = _ticks.size() - 1 - LIVE_MAX_LAG


## Avancement entre `previous` (0) et `current` (1).
func alpha() -> float:
	return clampf(_elapsed / TICK_SECONDS, 0.0, 1.0)


## Positions (en cases) des ennemis vivants, interpolées entre les deux derniers ticks.
## Un ennemi absent du tick précédent (il vient d'apparaître) est pris à sa position courante.
func enemy_positions() -> Dictionary:
	var out: Dictionary = {}
	if current == null:
		return out
	var before: Dictionary = {}
	if previous != null:
		for enemy: EnemyStateDto in previous.enemies:
			before[enemy.id] = enemy.pos
	var t: float = alpha()
	for enemy: EnemyStateDto in current.enemies:
		var start: Vector2 = before.get(enemy.id, enemy.pos)
		out[enemy.id] = start.lerp(enemy.pos, t)
	return out


func _process(delta: float) -> void:
	if not playing:
		return
	_elapsed += delta
	# Boucle de rattrapage : une image lente ne ralentit pas la vague.
	while playing and _elapsed >= TICK_SECONDS:
		if _live and _index + 1 >= _ticks.size():
			# En attente du prochain snapshot : la dernière position est tenue.
			_elapsed = TICK_SECONDS
			break
		_elapsed -= TICK_SECONDS
		_advance()


func _advance() -> void:
	_index += 1
	if _index >= _ticks.size():
		playing = false
		finished.emit()
		return
	previous = current
	current = _ticks[_index]
	if _live and _index >= 64:
		# Direct : on oublie les ticks déjà joués (le flux est sans fin).
		_ticks = _ticks.slice(_index)
		_index = 0
	tick_played.emit(current)
