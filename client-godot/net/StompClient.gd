class_name StompClient
extends Node
## Client STOMP 1.2 minimal au-dessus d'un WebSocket natif (WebSocketPeer), pour le
## multijoueur (backend : WebSocketConfig, endpoint /ws, sans SockJS).
##
## Rôle strictement réseau (docs/CLIENT_GODOT.md §3) : il ouvre la connexion,
## s'authentifie à la trame CONNECT (en-tête `Authorization: Bearer <jwt>`, voir
## StompAuthChannelInterceptor), gère les abonnements et remonte les messages
## décodés (JSON). Aucune règle de jeu ici.
##
## Les abonnements survivent à une coupure : ils sont renvoyés à chaque CONNECTED,
## ce qui permet à l'écran de simplement rappeler `reopen()` après `disconnected`.

signal connected
signal disconnected(reason: String)
## Corps JSON décodé (Dictionary, Array…) ou null si le corps est vide ou illisible.
signal message_received(destination: String, body: Variant)
signal stomp_error(text: String)

enum State { IDLE, OPENING, CONNECTING, CONNECTED }

## Taille du tampon de réception : les snapshots live dépassent les 64 Ko par défaut.
const INBOUND_BUFFER_BYTES: int = 1 << 20

var state: State = State.IDLE

var _ws: WebSocketPeer
var _url: String = ""
var _token: String = ""
var _bytes: PackedByteArray = PackedByteArray()
## id d'abonnement → destination (renvoyés à chaque connexion).
var _subscriptions: Dictionary = {}
var _next_id: int = 0


func _ready() -> void:
	set_process(false)


func is_open() -> bool:
	return state == State.CONNECTED


## Ouvre la connexion WebSocket puis envoie CONNECT avec le token du joueur.
func open(url: String, token: String) -> Error:
	_url = url
	_token = token
	return reopen()


## Rouvre la connexion avec la même adresse et le même token (après une coupure).
func reopen() -> Error:
	_drop_socket()
	_ws = WebSocketPeer.new()
	_ws.inbound_buffer_size = INBOUND_BUFFER_BYTES
	var err: Error = _ws.connect_to_url(_url)
	if err != OK:
		_ws = null
		return err
	state = State.OPENING
	set_process(true)
	return OK


## Fermeture volontaire : oublie aussi les abonnements.
func close() -> void:
	if state == State.CONNECTED:
		_send_frame("DISCONNECT", {})
	_drop_socket()
	_subscriptions.clear()


## Abonne à une destination ; envoyé tout de suite si connecté, sinon à la connexion.
func subscribe(destination: String) -> String:
	var id: String = "sub-%d" % _next_id
	_next_id += 1
	_subscriptions[id] = destination
	if state == State.CONNECTED:
		_send_frame("SUBSCRIBE", {"id": id, "destination": destination})
	return id


func unsubscribe(id: String) -> void:
	if not _subscriptions.has(id):
		return
	_subscriptions.erase(id)
	if state == State.CONNECTED:
		_send_frame("UNSUBSCRIBE", {"id": id})


## Envoie une intention au serveur (préfixe /app côté backend). Ignoré hors connexion.
func send(destination: String, body: Dictionary = {}) -> bool:
	if state != State.CONNECTED:
		return false
	_send_frame("SEND", {"destination": destination, "content-type": "application/json"}, JSON.stringify(body))
	return true


func _process(_delta: float) -> void:
	if _ws == null:
		return
	_ws.poll()
	match _ws.get_ready_state():
		WebSocketPeer.STATE_OPEN:
			if state == State.OPENING:
				state = State.CONNECTING
				# heart-beat 0,0 : le broker simple de Spring n'en émet pas, on n'en demande pas.
				_send_frame("CONNECT", {"accept-version": "1.2", "host": _host(), "heart-beat": "0,0",
					"Authorization": "Bearer %s" % _token})
			while _ws != null and _ws.get_available_packet_count() > 0:
				_bytes.append_array(_ws.get_packet())
				_drain()
		WebSocketPeer.STATE_CLOSED:
			var reason: String = "code %d %s" % [_ws.get_close_code(), _ws.get_close_reason()]
			_drop_socket()
			disconnected.emit(reason.strip_edges())


func _drop_socket() -> void:
	if _ws != null and _ws.get_ready_state() != WebSocketPeer.STATE_CLOSED:
		_ws.close()
	_ws = null
	_bytes = PackedByteArray()
	state = State.IDLE
	set_process(false)


## Une trame STOMP se termine par un octet nul : découpe le tampon en trames complètes.
## (Découpe en octets : une String Godot ne peut pas contenir de caractère nul.)
func _drain() -> void:
	while true:
		var end: int = _bytes.find(0)
		if end < 0:
			return
		var frame: String = _bytes.slice(0, end).get_string_from_utf8()
		_bytes = _bytes.slice(end + 1)
		_handle_frame(frame)


func _handle_frame(raw: String) -> void:
	var frame: String = raw.replace("\r\n", "\n").lstrip("\n")
	if frame.is_empty():
		return # battement de cœur
	var split: int = frame.find("\n\n")
	var head: String = frame if split < 0 else frame.substr(0, split)
	var body: String = "" if split < 0 else frame.substr(split + 2)
	var lines: PackedStringArray = head.split("\n")
	var command: String = lines[0]
	var headers: Dictionary = {}
	for i: int in range(1, lines.size()):
		var colon: int = lines[i].find(":")
		if colon <= 0:
			continue
		var key: String = lines[i].substr(0, colon)
		if not headers.has(key): # STOMP 1.2 : la première occurrence d'un en-tête fait foi
			headers[key] = _unescape(lines[i].substr(colon + 1))
	match command:
		"CONNECTED":
			state = State.CONNECTED
			for id: String in _subscriptions:
				_send_frame("SUBSCRIBE", {"id": id, "destination": _subscriptions[id]})
			connected.emit()
		"MESSAGE":
			var data: Variant = null if body.strip_edges().is_empty() else JSON.parse_string(body)
			message_received.emit(str(headers.get("destination", "")), data)
		"ERROR":
			stomp_error.emit(str(headers.get("message", body)).strip_edges())


func _send_frame(command: String, headers: Dictionary, body: String = "") -> void:
	if _ws == null or _ws.get_ready_state() != WebSocketPeer.STATE_OPEN:
		return
	var payload: PackedByteArray = body.to_utf8_buffer()
	var text: String = command + "\n"
	for key: String in headers:
		# CONNECT ne s'échappe pas (STOMP 1.2) ; les autres trames si.
		var value: String = str(headers[key]) if command == "CONNECT" else _escape(str(headers[key]))
		text += "%s:%s\n" % [key, value]
	if not payload.is_empty():
		text += "content-length:%d\n" % payload.size()
	text += "\n"
	var frame: PackedByteArray = text.to_utf8_buffer()
	frame.append_array(payload)
	frame.append(0)
	_ws.send(frame, WebSocketPeer.WRITE_MODE_TEXT)


func _host() -> String:
	var rest: String = _url.split("://")[-1]
	return rest.split("/")[0]


static func _escape(value: String) -> String:
	return value.replace("\\", "\\\\").replace("\n", "\\n").replace(":", "\\c")


static func _unescape(value: String) -> String:
	return value.replace("\\c", ":").replace("\\n", "\n").replace("\\r", "\r").replace("\\\\", "\\")
