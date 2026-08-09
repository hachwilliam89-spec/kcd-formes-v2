# Multijoueur temps réel — Note de conception

Statut : **conception** (v2). Cible initiale : **Coop 2 joueurs**. Les modes _Versus rush_ et _Asymétrique live_ dérivent de la même base (voir § 9).

---

## 1. Principe & rupture avec le solo

En **solo**, une vague est **pré-calculée** côté serveur (`WaveSimulationService`) puis **rejouée** tick par tick par le client. Déterministe, simple, parfait pour l'async.

En **temps réel**, on passe à une **boucle de jeu autoritaire live** : le serveur détient l'état, l'avance en continu (~15 Hz) et diffuse des snapshots aux joueurs, qui n'envoient que des **intentions** (commandes). Les **règles de domaine** (déplacement des ennemis le long du chemin, ciblage/tir des tours, dégâts, économie) sont **réutilisées telles quelles** ; on les fait juste avancer d'un pas à chaque tick au lieu de dérouler toute la vague d'un coup.

> Le solo et l'async (défi seed, duel fantôme) **ne changent pas**. Le temps réel est un **nouveau chemin de code** (moteur de match live) qui réutilise le domaine.

---

## 2. Architecture (hexagonale)

```
domain/
  match/
    Match                  # agrégat : état complet d'une partie live
    MatchStatus            # LOBBY, RUNNING, PAUSED, FINISHED
    MatchPlayer            # playerId, pseudo, connecté?, prêt?
    (réutilise Enemy, Tower, GameMap, EnemyType, TowerType…)
  service/
    MatchEngine            # step(match, dtMs) : avance l'état d'un tick (réutilise les règles)

application/
  port/in/
    CreateMatchUseCase, JoinMatchUseCase, SetReadyUseCase,
    HandleMatchCommandUseCase, LeaveMatchUseCase
  port/out/
    MatchRepository        # stockage EN MÉMOIRE des matchs actifs
    MatchBroadcaster       # diffuse l'état aux abonnés d'un match
    Clock                  # horloge injectable (tests)
  usecase/
    MatchService           # orchestration : lobby, file de commandes, fin de partie

infrastructure/
  ws/
    WebSocketConfig        # @EnableWebSocketMessageBroker, endpoint /ws
    MatchStompController    # @MessageMapping des commandes entrantes
    StompMatchBroadcaster   # SimpMessagingTemplate -> /topic/match/{id}/state
  scheduler/
    MatchTicker            # boucle : avance tous les matchs RUNNING + diffuse
  persistence/
    InMemoryMatchRepository # ConcurrentHashMap<UUID, Match>
    MatchResultAdapter      # persiste le RÉSULTAT (JPA) : historique, classement coop
```

Point clé : **l'état vivant d'un match est en mémoire** (pas en base). Seul le **résultat final** est persisté (JPA) pour l'historique / le classement.

---

## 3. Modèle d'état du match (`Match`)

```
Match {
  id: UUID
  code: String                 # code court pour rejoindre (ex. "K7QF")
  status: LOBBY|RUNNING|PAUSED|FINISHED
  mode: COOP                   # (VERSUS, ASYMMETRIC plus tard)
  map: GameMap                 # chemin serpentin partagé
  players: [MatchPlayer]       # 2 en coop
  gold: int                    # partagé en coop (ou par joueur — cf. § 4)
  castleHp / castleMaxHp: int  # PV du château commun
  wave: int
  enemies: [Enemy]             # positions/PV courants
  towers: [Tower]              # posées par les deux joueurs (ownerId)
  tick: long                   # compteur de ticks depuis le début
  seed: long                   # RNG déterministe côté serveur
}
```

`Enemy` / `Tower` réutilisent les modèles existants ; on ajoute juste `ownerId` sur `Tower` (qui l'a posée) pour l'affichage/les stats.

---

## 4. Règles Coop (à trancher au dev)

- **Or** : partagé (simple, coopératif) — recommandé pour la v1. Variante : or séparé.
- **Placement** : les deux joueurs posent sur la même grille ; règles de couloir inchangées. Verrou : le serveur refuse deux poses sur la même case (première commande gagne).
- **Château** : commun, un seul barre de PV. Défaite = château tombé ; score = vague atteinte à deux.
- **Lancement de vague** : soit auto (timer), soit un bouton « Prêt » des deux joueurs. Recommandé : **timer** entre vagues pour éviter l'attente d'un joueur AFK.

---

## 5. Canaux STOMP & messages

Endpoint handshake : `/ws` (SockJS en fallback). Broker simple : préfixe `/topic` (sortant), `/app` (entrant). **JWT validé au handshake** (interceptor) → on connaît le `playerId` sur chaque message.

**Client → serveur** (`/app/...`) :

| Destination | Payload | Effet |
|---|---|---|
| `/app/match/{id}/join` | `{}` | rejoint le lobby |
| `/app/match/{id}/ready` | `{ ready: true }` | prêt / pas prêt |
| `/app/match/{id}/command` | `{ type, ... }` | commande de jeu (voir ci-dessous) |
| `/app/match/{id}/leave` | `{}` | quitte |

Commandes de jeu (`command`), **validées serveur** :

```
{ type: "PLACE_TOWER", towerType, x, y }
{ type: "UPGRADE_TOWER", towerId }
{ type: "SET_TARGETING", towerId, mode }
```

**Serveur → clients** (`/topic/match/{id}/state`) — snapshot compact à ~15 Hz :

```
{
  tick, wave, status, gold, castleHp,
  enemies: [{ id, type, x, y, hp, maxHp }],   // deltas possibles plus tard
  towers:  [{ id, type, x, y, level, ownerId }],
  events:  [{ kind: "SHOOT"|"IMPACT"|"DEATH"|"CASTLE_HIT", ... }] // pour SFX/anim
}
```

Le client **interpole** entre deux snapshots (buffer ~100 ms) et déclenche sons/animations sur `events`. Il n'a **aucune autorité** sur l'état.

---

## 6. Boucle de tick (`MatchTicker`)

```
@Scheduled(fixedRate = 66)   // ~15 Hz
tick():
  for match in repo.running():
    match.drainCommands()          // applique la file de commandes validées
    engine.step(match, 66ms)       // avance ennemis, tirs, dégâts, spawns
    broadcaster.send(match)        // diffuse le snapshot (ou delta)
    if match.castleHp <= 0: finish(match)
```

- **Un seul thread** avance tous les matchs → pas de races. Si charge : un pool avec **un match toujours traité par le même thread** (affinité), jamais deux threads sur le même match.
- Les commandes entrantes ne modifient pas l'état directement : elles sont **mises en file** et appliquées en début de tick (ordonnancement déterministe).

---

## 7. Latence, repli, reconnexion

- **Interpolation** client (buffer 100 ms) : masque le jitter, rendu fluide même à 15 Hz.
- **Reconnexion** : l'état vit en mémoire ; au retour, le client se réabonne et reçoit un **snapshot complet**. Fenêtre de grâce (ex. 30 s) avant de considérer le joueur parti.
- **Déconnexion définitive** en coop : la partie continue en solo (l'autre joueur garde la main) ou passe en pause selon le choix produit.

---

## 8. Sécurité / anti-triche

- Le client **n'envoie que des intentions** ; le serveur valide tout (or suffisant, case libre/légale, tour débloquée, cooldowns).
- JWT obligatoire au handshake ; un joueur ne peut envoyer des commandes que pour **un match où il est inscrit**.
- Le RNG (spawns) vit **côté serveur** (seed non exposée).

---

## 9. Dérivation des autres modes

- **Versus rush** : deux `Match` (ou deux voies dans un même match), mêmes vagues ; l'or gagné permet d'**injecter des ennemis** chez l'adversaire (commande `SEND_ENEMIES`). Réutilise la boucle et les canaux, ajoute la logique d'envoi + deux barres de PV.
- **Asymétrique live** : un joueur = défenseur (commandes tours), l'autre = attaquant (commandes `SPAWN_ENEMY` avec budget/cooldown). Même moteur, autre jeu de commandes + équilibrage.

---

## 10. Config technique

- Spring : `spring-boot-starter-websocket`, `@EnableWebSocketMessageBroker`, endpoint `/ws` (+ SockJS), broker simple `/topic`, préfixe app `/app`, `ChannelInterceptor` pour valider le JWT au `CONNECT`.
- Reverse-proxy : **Caddy gère l'upgrade WebSocket nativement** → aucune config supplémentaire (le `reverse_proxy` actuel suffit).
- Front : client STOMP (`@stomp/stompjs`), une couche `MatchClient` qui expose l'état interpolé à la scène Phaser (réutilise le rendu existant : ennemis, tours, effets).

---

## 11. Plan d'implémentation (jalons)

1. **Plomberie WS** : endpoint `/ws` + JWT au handshake + un `/topic` d'écho. Vérifier en prod (Caddy).
2. **Lobby** : create/join par code, liste des joueurs, statut « prêt ».
3. **Boucle autoritaire minimale** : un match qui spawn des ennemis et les fait avancer, snapshot 15 Hz, rendu Phaser interpolé (sans tours).
4. **Commandes** : PLACE_TOWER validé serveur + tir/dégâts live (réutilise le domaine).
5. **Boucle de jeu complète** : vagues, or partagé, PV château, fin de partie + persistance du résultat.
6. **Robustesse** : reconnexion, déconnexion, snapshots → deltas, tests.
7. **Dérivation** : Versus rush.

> Astuce portfolio : documenter la **boucle autoritaire + interpolation + anti-triche** est un excellent argument d'entretien (netcode, autorité serveur, gestion de latence).
