class_name UnitVisual
extends Resource
## Apparence d'un type d'unité (tour ou ennemi). Provisoire : forme colorée.
## Les sprites viendront ici (SpriteFrames, échelle, décalages, sons) sans
## changer le code de jeu (docs/CLIENT_GODOT.md §3, règle 2).

## Nom de l'enum côté serveur (TowerType / EnemyType), ex. "ARCHER", "GOBLIN".
@export var type: String = ""
@export var color: Color = Color.WHITE
## Taille relative à une case (1.0 = case entière).
@export_range(0.1, 2.0) var size: float = 0.6
## Lettre affichée sur la forme provisoire.
@export var short_label: String = ""
