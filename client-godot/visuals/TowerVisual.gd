class_name TowerVisual
extends Resource
## Apparence d'un type de tour (TowerType côté serveur). Valeurs reprises de
## frontend-web/components/game/GameScene.ts (TOWER_WIDTH, ROT_WEAPON,
## TOWER_ANIM, PROJECTILES, TOWER_IMPACT, placeTowerParts).
##
## Trois montages possibles :
## - socle + arme pivotante (weapon_path renseigné) : Archer, Baliste, Catapulte ;
## - planche animée (anim_path renseigné) : Mage ;
## - image fixe (base_path seul) : Mur, centré et orienté selon la route.

@export var type: String = ""
## Largeur affichée, en cases (la hauteur suit les proportions).
@export var width_cells: float = 0.9
@export var base_path: String = ""
## Image centrée sur la case et tournée face aux assaillants (Mur) au lieu d'être posée au pied.
@export var centered_on_road: bool = false

@export_group("Arme pivotante")
@export var weapon_path: String = ""
@export var weapon_frame_size: Vector2i = Vector2i.ZERO
@export var weapon_fps: float = 18.0
## Point de rotation dans l'image de l'arme (fraction de sa taille).
@export var weapon_pivot: Vector2 = Vector2(0.5, 0.82)
## Hauteur du pivot sur le socle, en fraction depuis le HAUT du socle.
@export var mount_frac: float = 0.3

@export_group("Planche animée")
@export var anim_path: String = ""
@export var anim_frame_size: Vector2i = Vector2i.ZERO
@export var anim_fps: float = 16.0

@export_group("Tir")
## Projectile en vol (clé d'EffectVisual), vide = aucun.
@export var projectile: String = ""
## Effet d'impact (clé d'EffectVisual), vide = aucun.
@export var impact: String = ""
## Taille de l'impact, en cases.
@export var impact_scale: float = 1.0

@export_group("Forme de repli")
@export var color: Color = Color.WHITE
@export var short_label: String = ""


func base_texture() -> Texture2D:
	return TextureCache.get_texture(base_path)


func weapon_texture() -> Texture2D:
	return TextureCache.get_texture(weapon_path)


func anim_texture() -> Texture2D:
	return TextureCache.get_texture(anim_path)


func has_sprite() -> bool:
	return base_texture() != null or anim_texture() != null
