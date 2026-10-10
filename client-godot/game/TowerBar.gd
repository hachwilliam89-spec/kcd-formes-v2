class_name TowerBar
extends GridContainer
## Barre de construction : un bouton par tour du catalogue serveur (GET /api/v1/towers),
## partagée par le solo et le multijoueur.
##
## L'écran renseigne l'état (or, tours posées, meilleure vague, occupation) puis
## appelle refresh(). Affichage seulement : le serveur revalide tout à la pose.

signal tower_selected(spec: TowerSpecDto)

var catalog: Array[TowerSpecDto] = []
## Déblocages par meilleure vague du compte : vérifiés en solo ; le multijoueur
## ne les applique pas (MatchService), l'écran le désactive alors.
var check_unlocks: bool = true
var best_wave: int = 0
var gold: int = 0
## Tours posées sur la carte (plafond simultané, ex. 6 murs).
var placed: Array[TowerDto] = []
## Écran occupé (appel en cours, vague rejouée, partie absente) : boutons grisés.
var busy: bool = false

var _group: ButtonGroup = ButtonGroup.new()


## Un bouton par tour, dans l'ordre du serveur ; la première est sélectionnée.
func setup(specs: Array[TowerSpecDto]) -> void:
	catalog = specs
	for child: Node in get_children():
		remove_child(child)
		child.queue_free()
	for spec: TowerSpecDto in catalog:
		var button: Button = Button.new()
		button.toggle_mode = true
		button.button_group = _group
		button.theme_type_variation = &"SmallButton"
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.set_meta("tower_type", spec.type)
		button.toggled.connect(_on_toggled.bind(spec))
		add_child(button)
	refresh()
	if get_child_count() > 0:
		(get_child(0) as Button).button_pressed = true


## Libellés et disponibilité : coût, verrou de vague, plafond, or.
func refresh() -> void:
	for child: Node in get_children():
		var button: Button = child as Button
		var spec: TowerSpecDto = spec_of(str(button.get_meta("tower_type", "")))
		if spec == null:
			continue
		if _locked(spec):
			button.text = "%s\nvague %d" % [TowerNames.short(spec.type), spec.unlock_wave]
		elif spec.max_count > 0:
			button.text = "%s\n%d · %d/%d" % [TowerNames.short(spec.type), spec.cost, count_of(spec.type), spec.max_count]
		else:
			button.text = "%s\n%d or" % [TowerNames.short(spec.type), spec.cost]
		button.tooltip_text = describe(spec)
		button.disabled = busy or not unavailable_reason(spec).is_empty()


func selected_spec() -> TowerSpecDto:
	var pressed: BaseButton = _group.get_pressed_button()
	if pressed == null:
		return null
	return spec_of(str(pressed.get_meta("tower_type", "")))


func spec_of(type: String) -> TowerSpecDto:
	for spec: TowerSpecDto in catalog:
		if spec.type == type:
			return spec
	return null


func count_of(type: String) -> int:
	var count: int = 0
	for tower: TowerDto in placed:
		if tower.type == type:
			count += 1
	return count


## Pourquoi la tour ne peut pas être posée maintenant ; "" si rien ne l'empêche.
func unavailable_reason(spec: TowerSpecDto) -> String:
	var label: String = TowerNames.label(spec.type)
	if _locked(spec):
		return "%s : se débloque en atteignant la vague %d." % [label, spec.unlock_wave]
	if spec.max_count > 0 and count_of(spec.type) >= spec.max_count:
		return "%s : %d au maximum en même temps." % [label, spec.max_count]
	if gold < spec.cost:
		return "%s : %d or requis (tu en as %d)." % [label, spec.cost, gold]
	return ""


## Fiche courte : coût, stats au niveau 1, et la raison d'indisponibilité s'il y en a une.
func describe(spec: TowerSpecDto) -> String:
	var label: String = TowerNames.label(spec.type)
	var stats: TowerSpecDto.Level = spec.level(1)
	var hp: int = stats.max_hp if stats != null else 0
	var text: String
	if spec.on_corridor:
		text = "%s · %d or\nPV %d · se pose sur la route, %d au maximum" % [label, spec.cost, hp, spec.max_count]
	else:
		var damage: int = stats.damage if stats != null else 0
		var reach: float = stats.range_cells if stats != null else 0.0
		text = "%s · %d or\nDégâts %d · portée %.1f · PV %d" % [label, spec.cost, damage, reach, hp]
	var reason: String = unavailable_reason(spec)
	return text if reason.is_empty() else "%s\n%s" % [text, reason]


## Zone de pose de la tour d'après la disposition serveur : route pour le Mur,
## cases constructibles pour les autres.
static func fits_cell(spec: TowerSpecDto, layout: MapLayoutDto, cell: Vector2i) -> bool:
	return layout.is_corridor(cell) if spec.on_corridor else layout.is_buildable(cell)


func _locked(spec: TowerSpecDto) -> bool:
	return check_unlocks and not spec.is_unlocked(best_wave)


func _on_toggled(pressed: bool, spec: TowerSpecDto) -> void:
	if pressed:
		tower_selected.emit(spec)
