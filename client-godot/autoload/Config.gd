extends Node
## Configuration réseau du client.
##
## L'URL du backend vient du réglage projet `war_seasons/network/api_base_url`,
## surchargeable par plateforme via les feature tags de Godot (ex. `.android`,
## `.web`). Exemple pour tester sur un téléphone en dev : ajouter dans
## project.godot `network/api_base_url.android="http://<IP-du-Mac>:8080"`.
##
## Export web : la valeur `.web` est vide → on prend l'origine de la page, car
## le jeu est servi par le même domaine que l'API (Caddy proxifie /api et /ws).

const SETTING_API_URL: String = "war_seasons/network/api_base_url"


func api_base_url() -> String:
	var url: String = str(ProjectSettings.get_setting_with_override(SETTING_API_URL))
	if url.is_empty() and OS.has_feature("web"):
		url = str(JavaScriptBridge.eval("window.location.origin", true))
	return url.trim_suffix("/")


## URL du endpoint STOMP, dérivée de l'URL REST (même logique que frontend-web/lib/ws.ts).
func ws_url() -> String:
	var base: String = api_base_url()
	if base.begins_with("https://"):
		return "wss://" + base.substr(8) + "/ws"
	if base.begins_with("http://"):
		return "ws://" + base.substr(7) + "/ws"
	return base + "/ws"
