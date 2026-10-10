class_name SendBar
extends GridContainer
## Barre d'envoi du versus : un bouton par ennemi du catalogue serveur
## (GET /api/v1/versus/sends) — coût en or et revenu passif gagné.
##
## L'écran renseigne l'or et l'état (busy) puis appelle refresh(). Affichage
## seulement : le serveur revalide l'or à l'envoi (MatchService.sendCreep).

signal send_requested(type: String)

var catalog: Array[SendSpecDto] = []
var gold: int = 0
## Partie absente, finie, ou château tombé : boutons grisés.
var busy: bool = true


func setup(specs: Array[SendSpecDto]) -> void:
	catalog = specs
	for child: Node in get_children():
		remove_child(child)
		child.queue_free()
	for spec: SendSpecDto in catalog:
		var button: Button = Button.new()
		button.theme_type_variation = &"SmallButton"
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.text = "%s\n%d · +%d" % [EnemyNames.short(spec.type), spec.cost, spec.income]
		button.tooltip_text = "%s — %d or · revenu +%d/vague" % [EnemyNames.label(spec.type), spec.cost, spec.income]
		button.set_meta("send_type", spec.type)
		button.pressed.connect(func() -> void: send_requested.emit(spec.type))
		add_child(button)
	refresh()


func refresh() -> void:
	for child: Node in get_children():
		var button: Button = child as Button
		var spec: SendSpecDto = spec_of(str(button.get_meta("send_type", "")))
		if spec != null:
			button.disabled = busy or gold < spec.cost


func spec_of(type: String) -> SendSpecDto:
	for spec: SendSpecDto in catalog:
		if spec.type == type:
			return spec
	return null
