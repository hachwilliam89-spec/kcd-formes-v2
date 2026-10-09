class_name DecorSet
extends RefCounted
## Décor d'une carte tel que le web le construit, exporté par
## scripts/visual-export (client-godot/assets/baked/<carte>/, hors git) :
## le sol en une image + les éléments posés parmi les unités (château, portails,
## arbres…) avec leur position, ancrage, taille, profondeur et animation.
## Absent → null : la carte s'affiche avec ses cases colorées.

const ROOT: String = "res://assets/baked"

## Un élément de décor, en pixels du repère local (CELL_SIZE = 40, comme le web).
class Item:
	var texture: Texture2D
	var frame: Rect2
	var position: Vector2
	var origin: Vector2
	var size: Vector2
	var flip_x: bool
	var flip_y: bool
	var rotation: float
	var modulate: Color = Color.WHITE
	## Profondeur web : 1 + pied (en cases) / 100 pour ce qui se trie avec les unités.
	var depth: float
	var anim_frames: Array[Rect2] = []
	var anim_fps: float = 0.0

	func frame_at(time: float) -> Rect2:
		if anim_frames.is_empty() or anim_fps <= 0.0:
			return frame
		return anim_frames[int(time * anim_fps) % anim_frames.size()]


var ground: Texture2D
var items: Array[Item] = []
## Un calque de sol plein écran couvre la profondeur 0 (repères au sol des unités masqués, comme sur le web).
var ground_covers_depth0: bool = false


static func load_for(map_id: String) -> DecorSet:
	var dir: String = "%s/%s" % [ROOT, map_id]
	var manifest_path: String = dir + "/decor.json"
	if not FileAccess.file_exists(manifest_path):
		return null
	var body: Dictionary = DtoParse.dict(JSON.parse_string(FileAccess.get_file_as_string(manifest_path)))
	var decor: DecorSet = DecorSet.new()
	decor.ground = TextureCache.get_texture("%s/%s" % [dir, str(body.get("ground", "ground.png"))])
	decor.ground_covers_depth0 = bool(body.get("groundCoversDepth0", false))
	for raw: Variant in DtoParse.array(body.get("items")):
		var it: Dictionary = DtoParse.dict(raw)
		var texture: Texture2D = TextureCache.get_texture("%s/%s" % [dir, str(it.get("texture", ""))])
		if texture == null:
			continue
		var item: Item = Item.new()
		item.texture = texture
		item.frame = _rect(it.get("frame"))
		item.position = Vector2(float(it.get("x", 0)), float(it.get("y", 0)))
		item.origin = Vector2(float(it.get("originX", 0.5)), float(it.get("originY", 0.5)))
		item.size = Vector2(float(it.get("width", 0)), float(it.get("height", 0)))
		item.flip_x = bool(it.get("flipX", false))
		item.flip_y = bool(it.get("flipY", false))
		item.rotation = float(it.get("rotation", 0.0))
		item.depth = float(it.get("depth", 1.0))
		var alpha: float = float(it.get("alpha", 1.0))
		var tint: Variant = it.get("tint")
		item.modulate = Color.hex((int(tint) << 8) | 0xff) if tint != null else Color.WHITE
		item.modulate.a = alpha
		var anim: Dictionary = DtoParse.dict(it.get("anim"))
		if not anim.is_empty():
			item.anim_fps = float(anim.get("fps", 0.0))
			for frame: Variant in DtoParse.array(anim.get("frames")):
				item.anim_frames.append(_rect(frame))
		decor.items.append(item)
	return decor


static func _rect(value: Variant) -> Rect2:
	var a: Array = DtoParse.array(value)
	if a.size() < 4:
		return Rect2()
	return Rect2(float(a[0]), float(a[1]), float(a[2]), float(a[3]))
