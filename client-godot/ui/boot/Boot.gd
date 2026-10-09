extends Control
## Écran de démarrage : vérifie la session enregistrée puis oriente vers
## l'accueil (token valide) ou la connexion.

@onready var _status: Label = %Status
@onready var _retry: Button = %Retry


func _ready() -> void:
	_retry.pressed.connect(_check_session)
	_check_session()


func _check_session() -> void:
	_retry.visible = false
	if not Session.is_logged_in():
		Router.goto_login()
		return

	_status.text = "Vérification de la session…"
	var result: ApiResult = await Api.me()
	if result.ok:
		Router.goto_home()
	elif result.status == 0:
		# Serveur injoignable : on garde la session, le joueur peut réessayer.
		_status.text = result.error
		_retry.visible = true
	else:
		# 401 est déjà géré par Api (session vidée + retour connexion) ;
		# tout autre refus invalide aussi la session.
		Session.clear()
		Router.goto_login()
