# Cartes saisonnières — 4 octobre 2026

Deux cartes supplémentaires sont proposées en solo, coop et versus. Les anciens
tracés restent inchangés. Les règles sont autoritaires côté Java ; Phaser affiche
les états `terrain` envoyés avec les ticks solo et les snapshots multijoueurs.

## Printemps : Les Jardins éveillés

Deux entrées rejoignent un château commun. Les 21 cases de berge (x=8..14,
y=6,8,10) sont constructibles et marquées en bleu en permanence. Aux vagues 3, 6,
9…, leurs tours ne tirent plus pendant toute la vague. La crue elle-même ne retire
aucun PV ; les ennemis peuvent toujours attaquer ces tours. Les positions hautes
restent actives. Les murs sont passifs et ne sont pas suspendus.

La prochaine crue est indiquée dans l’aperçu solo, la légende du plateau et la
sélection de carte. En live, le changement suit le numéro de la vague courante.

## Automne : Le Val des feuilles

Trois nappes de quatre cases sur le chemin : x=6..9/y=3, x=10..13/y=7,
x=6..9/y=12. Un impact principal de catapulte allume la case de feuilles touchée.
Le feu se propage aux feuilles orthogonalement voisines tous les 3 ticks (360 ms),
chaque case brûle 18 ticks (2,16 s) et inflige 3 PV par tick aux ennemis dessus.
Les coordonnées continues sont arrondies à la case la plus proche.

Une case brûlée ne peut pas se rallumer pendant la même vague. Les feuilles
reviennent à la vague suivante. Le feu respecte l’armure magique des ennemis,
n’endommage pas les tours et crédite l’or des morts une seule fois. Les
instantanés distinguent feuilles intactes, feu et cendres.

## Décors et assets

- Sols et végétation composés une seule fois dans une texture de 800×640.
- Calque des dangers régénéré seulement lorsque son état change ; une image
  unique est rendue entre deux changements, sans Graphics statique par frame.
- Fortifications compactes dessinées en Canvas2D : grès crénelé au désert,
  toitures enneigées en hiver, petit fort végétalisé au printemps, toits roux en
  automne. Drapeau rouge aux entrées, bleu au château à défendre.
- `sprites/seasonal/plants.png` : copie intacte de `TX Plant.png`, pack utilisateur
  **Pixel Art Top Down - Basic v1** (Cainos). Découpage de l’atlas au rendu ; teinte
  automnale appliquée uniquement lors de la composition du décor.
- `sprites/seasonal/garden-road.png` : copie intacte de `Road4_ground.png`, pack
  **CraftPix Free Path and Road Top Down Pixel Tileset**. Dalles des jardins.
- Ces deux feuilles de sprites restent gitignorées comme les autres packs sous
  licence. Exécuter `scripts/pack-assets.sh` pour les inclure dans le transfert
  privé habituel, puis `scripts/unpack-assets.sh` sur la machine de déploiement.
  Un dessin procédural de secours existe si les nouvelles textures manquent.

Les packs 3D, chevaliers/faucheurs de profil, UI et musiques proposés ne sont pas
intégrés dans cette passe : ils nécessitent une sélection/adaptation distincte.

## Validation

- Suite backend : 120 tests, aucun échec ; sept tests dédiés au terrain saisonnier
  (prévision, propagation, renouvellement, persistance, tir suspendu/rétabli,
  intégration solo/live, or et armure magique).
- TypeScript et build Next de production validés ; ESLint sans erreur,
  dix avertissements déjà présents.
- Aperçu manuel de la vraie scène : repos/crue/retour au repos et feuilles/feu/cendres,
  sprites, textures, absence d’erreur console observée.
- Mesure locale Chrome, automne avec quatre cases en feu et une catapulte immobile :
  480 images en 8 s, moyenne CPU 0,24 ms, p95 0,40 ms. Mesure du rendu de cet état
  uniquement ; ne préjuge pas du coût d’une grosse vague ou d’une autre machine.

Les valeurs de dégâts, durées et emplacements constituent un premier réglage.
L’équilibrage sur de longues parties et le test réseau avec deux joueurs restent
à faire. Le harnais historique de balance ne mesure que son scénario existant.
