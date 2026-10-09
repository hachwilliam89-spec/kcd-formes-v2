class_name Grid
extends RefCounted
## Seule conversion case ↔ espace local de la carte (docs/CLIENT_GODOT.md §3, règle 4).
##
## L'espace local est celui de la vue de carte (MapView) AVANT sa mise à l'échelle
## pour l'écran : changer la taille des cases, c'est changer CELL_SIZE et rien d'autre.

const CELL_SIZE: int = 16


## Coin haut-gauche de la case.
static func cell_origin(cell: Vector2i) -> Vector2:
	return Vector2(cell * CELL_SIZE)


static func cell_center(cell: Vector2i) -> Vector2:
	return cell_origin(cell) + Vector2(CELL_SIZE, CELL_SIZE) * 0.5


static func cell_rect(cell: Vector2i) -> Rect2:
	return Rect2(cell_origin(cell), Vector2(CELL_SIZE, CELL_SIZE))


## Position continue en cases (ennemis : un entier = centre de la case, comme côté serveur).
static func grid_to_local(pos: Vector2) -> Vector2:
	return (pos + Vector2(0.5, 0.5)) * CELL_SIZE


## Case contenant un point de l'espace local (peut être hors carte : à vérifier par l'appelant).
static func local_to_cell(point: Vector2) -> Vector2i:
	return Vector2i(floori(point.x / CELL_SIZE), floori(point.y / CELL_SIZE))


## Taille en pixels locaux d'une carte de `cells` cases.
static func map_size(cells: Vector2i) -> Vector2:
	return Vector2(cells * CELL_SIZE)
