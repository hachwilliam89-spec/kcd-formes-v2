extends Node
## Client REST de l'API War Seasons (même API que frontend-web).
##
## Rôle strictement réseau : envoyer des intentions, renvoyer des ApiResult.
## Aucune règle de jeu ici (voir docs/CLIENT_GODOT.md §3).

## Émis quand le serveur rejette le token (401) : la session est déjà vidée.
signal unauthorized

const TIMEOUT_S: float = 10.0


func login(p_username: String, p_password: String) -> ApiResult:
	return await _request(HTTPClient.METHOD_POST, "/api/v1/auth/login",
		{"username": p_username, "password": p_password}, false)


func register(p_username: String, p_email: String, p_password: String) -> ApiResult:
	return await _request(HTTPClient.METHOD_POST, "/api/v1/auth/register",
		{"username": p_username, "email": p_email, "password": p_password}, false)


## Profil du joueur connecté — sert aussi à vérifier que le token est encore valide.
func me() -> ApiResult:
	return await _request(HTTPClient.METHOD_GET, "/api/v1/players/me")


## Ids des cartes jouables, dans l'ordre de présentation.
func list_maps() -> ApiResult:
	return await _request(HTTPClient.METHOD_GET, "/api/v1/maps")


## Disposition statique d'une carte (château, voies, cases constructibles…).
func get_map_layout(map_id: String) -> ApiResult:
	return await _request(HTTPClient.METHOD_GET, "/api/v1/maps/%s" % map_id.uri_encode())


func _request(method: HTTPClient.Method, path: String, body: Variant = null,
		authenticated: bool = true) -> ApiResult:
	var http: HTTPRequest = HTTPRequest.new()
	http.timeout = TIMEOUT_S
	add_child(http)

	var headers: PackedStringArray = PackedStringArray([
		"Content-Type: application/json",
		"Accept: application/json",
	])
	if authenticated and Session.is_logged_in():
		headers.append("Authorization: Bearer %s" % Session.token)

	var payload: String = "" if body == null else JSON.stringify(body)
	var err: Error = http.request(Config.api_base_url() + path, headers, method, payload)
	if err != OK:
		http.queue_free()
		return ApiResult.network_error("Requête impossible (%s)" % error_string(err))

	var response: Array = await http.request_completed
	http.queue_free()

	var result_code: int = response[0]
	var status: int = response[1]
	var raw: PackedByteArray = response[3]
	if result_code != HTTPRequest.RESULT_SUCCESS:
		return ApiResult.network_error("Serveur injoignable")

	var data: Variant = null
	var text: String = raw.get_string_from_utf8()
	if not text.is_empty():
		data = JSON.parse_string(text)

	if status == 401 and authenticated:
		Session.clear()
		unauthorized.emit()
	return ApiResult.from_response(status, data)
