class_name MapPalette
extends Resource
## Couleurs de la vue de carte provisoire (spike). Donnée, pas code : une refonte
## change le .tres, ou remplace MapView par une vue à tuiles, sans toucher au jeu.

@export var dead: Color = Color(0.16, 0.13, 0.1)
@export var road: Color = Color(0.55, 0.42, 0.26)
@export var buildable: Color = Color(0.24, 0.33, 0.18)
@export var water: Color = Color(0.2, 0.38, 0.55)
@export var spawn: Color = Color(0.7, 0.2, 0.18)
@export var castle: Color = Color(0.85, 0.7, 0.35)
@export var grid_line: Color = Color(0, 0, 0, 0.18)
@export var lane_line: Color = Color(0.95, 0.85, 0.6, 0.45)
@export var selection: Color = Color(1, 0.95, 0.7)
