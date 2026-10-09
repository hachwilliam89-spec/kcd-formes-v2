extends Control
## Accueil après connexion (placeholder du spike).

@onready var _welcome: Label = %Welcome
@onready var _logout: Button = %Logout


func _ready() -> void:
	_welcome.text = "Connecté en tant que %s" % Session.username
	_logout.pressed.connect(_on_logout)


func _on_logout() -> void:
	Session.clear()
	Router.goto_login()
