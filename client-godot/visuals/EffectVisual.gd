class_name EffectVisual
extends Resource
## Effet ponctuel ou projectile : planche animée (impacts, flèches, boules de feu).

## Clé utilisée par le jeu (ex. "explosion", "bolt").
@export var key: String = ""
@export var sheet_path: String = ""
@export var frame_size: Vector2i = Vector2i(64, 64)
@export var fps: float = 20.0
## true : l'animation boucle (projectile en vol) ; false : joue une fois puis disparaît.
@export var loop: bool = false


func texture() -> Texture2D:
	return TextureCache.get_texture(sheet_path)


func frame_count() -> int:
	return TextureCache.frame_count(texture(), frame_size)


func duration() -> float:
	return float(frame_count()) / fps


## Image à afficher `elapsed` secondes après le début.
func frame_at(elapsed: float) -> int:
	var count: int = frame_count()
	var index: int = int(elapsed * fps)
	return index % count if loop else mini(index, count - 1)
