class_name ApiResult
extends RefCounted
## Résultat d'un appel REST : succès + données JSON, ou message d'erreur affichable.

## Code HTTP ; 0 = le serveur n'a pas répondu (réseau, timeout).
var status: int = 0
var ok: bool = false
var data: Variant = null
var error: String = ""


static func from_response(p_status: int, p_data: Variant) -> ApiResult:
	var result: ApiResult = ApiResult.new()
	result.status = p_status
	result.ok = p_status >= 200 and p_status < 300
	result.data = p_data
	if not result.ok:
		result.error = _error_message(p_status, p_data)
	return result


static func network_error(message: String) -> ApiResult:
	var result: ApiResult = ApiResult.new()
	result.error = message
	return result


## Message du backend (`{"error": "..."}`, voir GlobalExceptionHandler) s'il existe,
## sinon un libellé générique selon le code HTTP.
static func _error_message(p_status: int, p_data: Variant) -> String:
	if p_data is Dictionary:
		var body: Dictionary = p_data
		if body.has("error"):
			return str(body["error"])
	match p_status:
		401, 403:
			return "Accès refusé — vérifie tes identifiants"
		404:
			return "Ressource introuvable"
		_:
			return "Erreur serveur (%d)" % p_status
