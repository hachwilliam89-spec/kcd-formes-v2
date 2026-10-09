class_name UnitVisual
extends Resource
## Apparence d'un type d'unité (tour, ennemi, château). Donnée, pas code
## (docs/CLIENT_GODOT.md §3, règle 2) : une refonte graphique change ces
## ressources et les fichiers d'assets, jamais BattleView ni le jeu.
##
## Sprite optionnel : si `sheet_path` est vide ou que l'asset n'est pas présent
## (assets sous licence hors git, voir scripts/sync-godot-assets.sh), la forme
## colorée de repli est dessinée — le jeu reste jouable sans les assets.

## Nom de l'enum côté serveur (TowerType / EnemyType) ou clé de décor ("CASTLE").
@export var type: String = ""

@export_group("Forme de repli")
@export var color: Color = Color.WHITE
## Taille relative à une case (1.0 = case entière).
@export_range(0.1, 2.0) var size: float = 0.6
## Lettre affichée sur la forme.
@export var short_label: String = ""

@export_group("Sprite")
## Planche ou image (res://assets/...). Vide = forme de repli.
@export var sheet_path: String = ""
## Taille d'une image de la planche ; (0, 0) = image entière (sprite fixe).
@export var frame_size: Vector2i = Vector2i.ZERO
## Images de marche [première, dernière] (incluses).
@export var walk_frames: Vector2i = Vector2i.ZERO
## Images de mort [première, dernière] ; x < 0 = pas d'animation de mort.
@export var die_frames: Vector2i = Vector2i(-1, -1)
@export var walk_fps: float = 12.0
@export var die_fps: float = 14.0
## Taille affichée, en cases, de la largeur de l'image (la hauteur suit les proportions).
@export var display_cells: float = 1.0
## Point d'ancrage dans l'image : (0.5, 1) = pied posé sur la position, (0.5, 0.5) = centré.
@export var anchor: Vector2 = Vector2(0.5, 0.5)
## Le sprite d'origine regarde vers la droite (retourné quand l'unité va vers la gauche).
@export var faces_right: bool = true

var _texture: Texture2D
var _texture_checked: bool = false


## Texture de la planche, ou null si absente (repli sur la forme).
func texture() -> Texture2D:
	if not _texture_checked:
		_texture_checked = true
		if not sheet_path.is_empty() and ResourceLoader.exists(sheet_path):
			_texture = load(sheet_path) as Texture2D
	return _texture


func has_sprite() -> bool:
	return texture() != null


## Zone de la planche correspondant à l'image `index`.
func frame_rect(index: int) -> Rect2:
	var tex: Texture2D = texture()
	if tex == null:
		return Rect2()
	if frame_size == Vector2i.ZERO:
		return Rect2(Vector2.ZERO, tex.get_size())
	var columns: int = maxi(1, int(tex.get_width()) / frame_size.x)
	return Rect2(Vector2((index % columns) * frame_size.x, (index / columns) * frame_size.y), Vector2(frame_size))


## Taille affichée dans le repère local de la carte (voir Grid).
func display_size() -> Vector2:
	var source: Vector2 = frame_rect(walk_frames.x).size
	if source.x <= 0.0:
		return Vector2.ZERO
	var width: float = display_cells * Grid.CELL_SIZE
	return Vector2(width, width * source.y / source.x)


func walk_frame_at(time: float) -> int:
	var count: int = walk_frames.y - walk_frames.x + 1
	if count <= 1:
		return walk_frames.x
	return walk_frames.x + int(time * walk_fps) % count


func has_death_animation() -> bool:
	return die_frames.x >= 0 and has_sprite()


func death_duration() -> float:
	return float(die_frames.y - die_frames.x + 1) / die_fps


## Image de mort à `elapsed` secondes après la mort (la dernière reste affichée).
func die_frame_at(elapsed: float) -> int:
	return mini(die_frames.x + int(elapsed * die_fps), die_frames.y)
