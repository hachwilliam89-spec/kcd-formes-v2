class_name TextureCache
extends RefCounted
## Chargement tolérant des textures sous licence (hors git, voir
## scripts/sync-godot-assets.sh) : un chemin absent renvoie null au lieu
## d'une erreur, et l'appelant dessine son repli.

static var _cache: Dictionary = {}


static func get_texture(path: String) -> Texture2D:
	if path.is_empty():
		return null
	if not _cache.has(path):
		_cache[path] = load(path) as Texture2D if ResourceLoader.exists(path) else null
	return _cache[path]


## Découpe de l'image `index` d'une planche en grille de `frame_size`.
static func frame_rect(texture: Texture2D, frame_size: Vector2i, index: int) -> Rect2:
	if texture == null:
		return Rect2()
	if frame_size == Vector2i.ZERO:
		return Rect2(Vector2.ZERO, texture.get_size())
	var columns: int = maxi(1, int(texture.get_width()) / frame_size.x)
	return Rect2(Vector2((index % columns) * frame_size.x, (index / columns) * frame_size.y), Vector2(frame_size))


## Nombre d'images d'une planche (toute la grille).
static func frame_count(texture: Texture2D, frame_size: Vector2i) -> int:
	if texture == null or frame_size == Vector2i.ZERO:
		return 1
	return maxi(1, (int(texture.get_width()) / frame_size.x) * (int(texture.get_height()) / frame_size.y))
