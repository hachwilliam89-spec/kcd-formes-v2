class_name EnemyVisual
extends Resource
## Apparence d'un type d'ennemi (EnemyType côté serveur). Valeurs reprises de
## frontend-web/components/game/GameScene.ts (SPRITE_*, ENEMY_SCALE, drawEnemies).

@export var type: String = ""
@export var sheet_path: String = ""
@export var frame_size: Vector2i = Vector2i(96, 96)
@export var walk_frames: Vector2i = Vector2i(0, 11)
@export var die_frames: Vector2i = Vector2i(12, 21)
@export var attack_frames: Vector2i = Vector2i(22, 31)
@export var walk_fps: float = 12.0
@export var die_fps: float = 14.0
@export var attack_fps: float = 14.0
## Côté du carré affiché, en cases (ENEMY_SCALE).
@export var display_cells: float = 1.6
## Décalage vertical du sprite par rapport au centre de la case, en cases (pieds ~au centre).
@export var offset_cells: float = -0.25
## Largeur de la barre de vie, en cases.
@export var bar_cells: float = 0.8
## Rayon de référence pour placer la barre au-dessus de l'unité, en cases.
@export var bar_radius_cells: float = 0.3333
@export_group("Anneau au sol")
## Anneau tracé sous l'unité (Chevalier noir : armure enchantée). Alpha 0 = aucun.
@export var ring_color: Color = Color(0, 0, 0, 0)
## Taille de l'ellipse (largeur, hauteur), en cases.
@export var ring_size_cells: Vector2 = Vector2(0.7, 0.35)
## Décalage vertical du centre de l'anneau, en cases.
@export var ring_offset_cells: float = 0.2
@export var ring_width: float = 2.0

@export_group("Forme de repli")
@export var color: Color = Color.WHITE
@export var radius_cells: float = 0.3333


func texture() -> Texture2D:
	return TextureCache.get_texture(sheet_path)


func frame_rect(index: int) -> Rect2:
	return TextureCache.frame_rect(texture(), frame_size, index)


## Image d'une animation (`range` = [première, dernière]) après `elapsed` secondes.
static func anim_frame(range: Vector2i, fps: float, elapsed: float, loop: bool) -> int:
	var count: int = range.y - range.x + 1
	var index: int = int(maxf(elapsed, 0.0) * fps)
	return range.x + (index % count if loop else mini(index, count - 1))


func die_duration() -> float:
	return float(die_frames.y - die_frames.x + 1) / die_fps
