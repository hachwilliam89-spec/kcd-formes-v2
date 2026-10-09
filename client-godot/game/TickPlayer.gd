class_name TickPlayer
extends Node
## Rejoue à cadence fixe les ticks d'une vague déjà simulée par le serveur.
##
## Logique pure (docs/CLIENT_GODOT.md §3, règle 1) : aucun accès aux nœuds
## visuels. Les vues s'abonnent à `tick_played` / `finished` et lisent
## `enemy_positions()` à chaque image pour un mouvement fluide.

signal tick_played(tick: TickDto)
signal finished

## Durée d'affichage d'un tick (même cadence que frontend-web : TICK_DELAY_MS = 120).
const TICK_SECONDS: float = 0.12

var previous: TickDto
var current: TickDto
var playing: bool = false

var _ticks: Array[TickDto] = []
var _index: int = -1
var _elapsed: float = 0.0


func play(ticks: Array[TickDto]) -> void:
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
	tick_played.emit(current)
