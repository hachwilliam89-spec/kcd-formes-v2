# ADR 0001 — Client de jeu unique en Godot 4 pour le mobile et le web

- **Statut** : Accepté, sous réserve du spike (voir « Critères d'arrêt »)
- **Date** : 2026-10-09
- **Décideur** : Kim

## Contexte

- Le portage mobile démarre. Le plan initial était React Native + Expo + Skia ; `GAME_DESIGN.md` §5 prévoyait au contraire « web responsive puis Capacitor ». Il fallait trancher.
- La simulation est **entièrement autoritaire côté serveur** : en solo, le client rejoue des ticks reçus en REST ; en coop/versus, il reçoit l'état par STOMP. Un client n'a donc aucune règle de jeu à porter : il fait du rendu, de l'UI et du réseau.
- Le client actuel est `frontend-web` : `GameScene.ts` (~3 200 lignes de Phaser 4, fichier le plus modifié du repo) + ~1 100 lignes d'UI de jeu React dans `app/game/page.tsx`. Les visuels y sont mêlés au code.
- `constants.ts` duplique déjà des règles du domaine (`BUILD_BAND`, `SPAWN_NOBUILD`, `CASTLE_NOBUILD`, bande constructible) et `GameScene.terrainVerdict` refait la validation de pose.
- Critères de décision : maintenabilité, évolutivité, exploitation de l'architecture hexagonale, viabilité professionnelle.

## Options étudiées

| Option | Pour | Contre |
|---|---|---|
| A. Phaser + Capacitor | Zéro réécriture, un seul code | Rendu en WebView sur mobile, pas d'export desktop, pas d'outillage d'édition (tout reste du code fait main) |
| B. Expo/React Native + Phaser en WebView | UI native | Deux UI à maintenir, pont RN ↔ WebView, perf WebView |
| C. Expo/React Native + Skia natif | Perf native, valeur « techno » | **Deux moteurs de rendu** (Phaser web + Skia mobile) : chaque feature visuelle codée deux fois. Skia n'est pas un moteur de jeu |
| D. Unity 6 | Standard industrie, C# | Lourd pour un TD 2D, pas de WebSocket natif en WebGL, propriétaire. Pertinent seulement pour viser un poste dans le jeu vidéo |
| E. Cocos Creator / Defold | Très bons sur web/mobile | Écosystème peu présent en France / Lua de niche |
| **F. Godot 4 (GDScript)** | Un seul projet → Android, iOS, web, desktop. Pensé pour la 2D pixel art, éditeur (scènes, animations, particules, tilemaps, tweens). WebSocket intégré identique web/natif. Open source MIT | Réécriture du client de jeu. GDScript obligatoire (l'export web C# n'est pas encore disponible en Godot 4). Premier chargement web plus lourd que Phaser |

Les options B et C ont été écartées en premier : elles multiplient le code de rendu ou d'UI, à l'opposé du principe « réutilisation avant duplication ». Le schéma professionnel pour un jeu 2D multiplateforme est **un seul moteur exporté vers chaque plateforme**.

## Décision

1. **Client de jeu unique en Godot 4, GDScript à typage statique imposé**, dans `client-godot/`. Il remplace à terme le jeu Phaser sur le web **et** sert le mobile.
2. **Next.js reste le site vitrine** : accueil, SEO / Open Graph, classement, compte, et une page `/jouer` qui sert l'export web Godot.
3. **Le backend ne change pas de nature.** Seul ajustement : il expose les règles dont les clients ont besoin (cases constructibles par carte, verdict de pose), pour supprimer la duplication de `constants.ts`.
4. Le client Godot respecte dès le premier commit les règles de `docs/CLIENT_GODOT.md` (séparation logique / visuel, visuels pilotés par des ressources, Theme unique…), pour qu'une refonte graphique future ne touche que les assets.

## Conséquences

**Positives**
- Un seul code de rendu et d'UI de jeu pour toutes les plateformes ; l'export desktop vient en plus.
- Démonstration directe de l'hexagonal : on remplace toute la technologie du client sans toucher au domaine.
- Outillage de moteur (éditeur, animations, particules) au lieu de 3 200 lignes de rendu codé à la main.
- Refonte graphique future peu coûteuse si les règles de `CLIENT_GODOT.md` sont tenues.

**Négatives / coûts acceptés**
- Réécriture du client de jeu (~4 500 lignes aujourd'hui), plusieurs semaines.
- Nouveau langage (GDScript).
- Pas de passerelle Figma → Godot : une UI maquettée se reconstruit à la main en Control + Theme.
- Export web plus lourd au premier chargement que Phaser.
- Coexistence temporaire de deux clients pendant la transition.

## Critères d'arrêt du spike (une semaine maximum)

Périmètre du spike : connexion REST, une carte, replay d'une vague solo, export Android + web, test sur téléphone réel.

On abandonne Godot et on se replie sur l'option A (Phaser + Capacitor) si l'un des cas suivants se produit :
- moins de 60 FPS sur un Android milieu de gamme ;
- chargement de l'export web rédhibitoire ;
- intégration STOMP bloquée plus de 2 jours.

Le résultat du spike (mesures, appareil, versions) est consigné à la fin de ce fichier, et le statut passe à « Accepté » ou « Remplacé par ADR NNNN ».

## Résultat du spike

_À compléter._
