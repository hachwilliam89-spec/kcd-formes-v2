# Cartes saisonnières — 4 octobre 2026

Deux cartes supplémentaires sont proposées en solo, coop et versus. Les anciens
tracés restent inchangés. Les règles sont autoritaires côté Java ; Phaser affiche
les états `terrain` envoyés avec les ticks solo et les snapshots multijoueurs.

## Printemps : Les Jardins éveillés

Le château (10,8) est sur une île, au centre d’un lac ; un fort ennemi de chaque
côté, (0,8) et (19,8). Chaque route se divise en deux (nord / sud, couloir large
de 3 cases, 22-23 cases) et les quatre voies finissent sur les deux ponts (x=9..11)
qui traversent le lac. L’eau (x=7..8 et 12..13, y=6..10 :
`SeasonalTerrain.waterCells`) n’est ni route ni case de tour, côté serveur
(`PathfindingService.buildableCells`) comme côté client (`MapDef.water`).

Les 22 cases de berge (rives ouest x=6 et est x=14, y=5..11 ; rives nord y=5 et
sud y=11, x=6..8 et 12..14 : `SeasonalTerrain.bankCells`) sont constructibles et
marquées en permanence. Aux vagues 3, 6, 9…, la crue en noie une partie et leurs
tours ne tirent plus pendant toute la vague. Le sens change d’une crue à l’autre,
selon une séquence fixe de 8 (ouest-est, nord, sud, ouest-est, nord-sud, sud, nord,
nord-sud) : jamais deux fois le même d’affilée (`floodCells`, envoyé dans
`Forecast.affectedCells` et `Snapshot.flood`). La crue elle-même ne retire aucun
PV ; les ennemis peuvent toujours attaquer ces tours. Les murs sont passifs et ne
sont pas suspendus.

**Grêle** (contrepoids des crues) : certaines autres vagues — jamais la 1re ni une
vague de crue, tirage fixe 4, 11, 14, 16, 19, 26, 29… (`hailAt`) — la grêle
cabosse les armures : les ennemis subissent ×1,25 de dégâts
(`HAIL_DAMAGE_FACTOR`, appliqué avant l’armure magique, qui annule toujours les
dégâts non-Mage). Annoncée dans l’aperçu (`Forecast.hail`) et envoyée avec l’état
(`Snapshot.hail`). Rendu : quelques grêlons la vague qui l’annonce, une averse de
grêle (rebonds au sol, voile froid) pendant la vague.

**Terre fertile** (bonus permanent, 9 octobre 2026) : chaque ennemi tué au printemps
rapporte +25 % d’or (`FERTILE_GOLD_FACTOR`, arrondi à l’unité, `SeasonalTerrain.goldFor`),
en solo comme en live. Contrepoids d’une carte courte (voies de ~20 cases contre 60 au
désert, 64 cases constructibles dont 22 berges inondables) où la crue de la vague 6
tombe sur la crise des élites. Mesure (simulateur, bot de pose gourmand, 30 parties) :
vague de mort médiane 9 / 7 → 9 / 12 (défense mixte / dense), désert 12 / 15. Les
ponts restent la piste suivante si l’écart persiste en jeu.

Pas de bandeau d’avertissement : le plateau annonce tout (berges qui clignotent et
bruine avant une crue, grêlons avant la grêle ; boue et brume de la vague suivante
en automne). Les règles passent par les bulles de conseils (à l’arrivée sur la
carte, puis à la 1re crue et à la 1re grêle annoncées, « Terre fertile » après la 1re vague
du printemps, « Brume protectrice » la 1re fois qu’une tour est sous la brume annoncée), que le joueur peut couper.
En live, le changement suit le numéro de la vague courante.

Rendu : au repos, les berges sont marquées (terre humide, roseaux, vaguelette) ;
quand l’aperçu annonce une crue, celles qu’elle noiera sont en surbrillance et
pulsent, et une bruine tombe. Pendant la vague
de crue : averse (170 gouttes, léger assombrissement), le lac déborde et s’étale sur
les berges (nappe du même bleu que le lac, rive festonnée d’écume, reflets qui
scintillent, ronds de pluie) et les tours suspendues ont les pieds dans l’eau. Des flaques se forment sur la route et ses abords (à moitié
sous la bruine, franches sous l’averse, ronds de pluie dessus), puis sèchent
lentement. Tout s’estompe à la décrue.

## Automne : Le Val des feuilles

Une entrée (0,3), deux voies en couloir large : le grand serpentin (59 cases) et
un raccourci par le milieu x=9 (31 cases), emprunté par une moitié de la vague.
Un terrain qui aide **et** qui gêne, pour une carte qui se joue autrement :

- **Boue (aide)** : à chaque vague, quatre flaques sur toute la largeur du couloir
  — une sur le raccourci (x=8..10, au nord ou au sud du croisement) et trois parmi six
  emplacements du serpentin (`SeasonalTerrain.mudCells`). Tirage fixe sur 40
  combinaisons (pas de 7) : jamais la même boue deux vagues de suite, et la boue de la
  vague suivante est annoncée dans l’aperçu (`Forecast.affectedCells`). Les ennemis y
  avancent à 60 % de leur vitesse (`MUD_SPEED_FACTOR`) et s’y entassent : bonnes
  cases à couvrir. Les géants (Troll, boss : `SeasonalTerrain.wadesThroughMud`) la
  traversent sans ralentir ; le Chariot, lui, s’y enlise comme les autres.
  Coordonnées continues arrondies à la case la plus proche. Rendu : à chaque
  déplacement, une averse de quelques secondes ; l’ancienne boue s’efface, la
  nouvelle se forme.
- **Brume (gêne)** : deux bancs par vague. Une tour couverte perd 1 case de portée
  (`FOG_RANGE_PENALTY`) ; les murs ne sont pas concernés. Les bancs changent de
  place à chaque vague selon un cycle fixe de 3 positions (nord-ouest + sud-est,
  nord-est + sud-ouest, centre + flanc est), jamais deux fois de suite au même
  endroit ; chacune couvre environ un tiers des cases constructibles. La brume de la vague suivante est envoyée dans l’aperçu
  (`Forecast.fogCells`) et affichée sur le plateau avant le lancement : le joueur
  peut placer ses tours en conséquence.
- **Brume protectrice (aide, 9 octobre 2026)** : en échange de la portée perdue, une
  tour couverte ne reçoit que 45 % des dégâts de siège — Sapeur, rayons (Troll,
  Chariot, boss), pulse du boss (`FOG_DAMAGE_TAKEN_FACTOR`, `siegeDamageTo`). Les murs
  ne sont jamais couverts. Le reste fractionnaire est reporté d’un coup à l’autre
  (rayons de 1 à 3 par tick) : -55 % exact et déterministe, solo et live. La brume
  devient un choix (portée contre solidité). Mesure (simulateur, 30 parties) : vague
  de mort médiane 10 / 14 → 12 / 15 (défense mixte / dense), désert 12 / 15.

Mêmes règles en solo (ticks précalculés) et en live (`MatchEngine`) : vitesse via
`speedFactorAt`, portée via `rangeOf` / `inRange`. Les instantanés envoient les
cases de boue et de brume et les tours couvertes (`mud`, `fog`, `foggedTowers`). Les cercles de
portée et l’aperçu de pose tiennent compte de la brume.

## Décors et assets

- Sols composés dans une texture de 800×640 ; arbres et buissons en sprites statiques triés par la position de leur pied, comme les arbres de route et les unités. Les troncs du fond ne passent ainsi plus devant les feuillages du premier plan. Feuillages
  recolorés pixel par pixel au chargement (`ctx.filter` n’est pas pris en charge par
  Safari) : automne orange, rouge, or ; printemps en cerisiers roses, lilas blancs et
  arbres verts d’origine, avec des massifs de fleurs. Arbres debout triés en
  profondeur avec les unités : bords de route en automne, coins de l’île du château
  au printemps.
- Calque des dangers régénéré seulement lorsque son état change ; une image
  unique est rendue entre deux changements, sans Graphics statique par frame.
- Fortifications dessinées en Canvas2D : palais de grès à coupole turquoise au désert,
  citadelle de cristal en hiver, sanctuaire végétalisé au printemps et château
  médiéval aux toits ardoise et vitraux violets en automne. Châteaux à défendre
  agrandis (120×147 pixels ; hiver : 104×127), triés en profondeur avec les unités. Enceinte en
  perspective oblique, cour pavée, chemins de ronde crénelés, donjon en retrait,
  tours à flancs ombrés, herse, escalier, lanternes et bannières. Coupole de
  cuivre au désert, givre en hiver, lierre fleuri au printemps, ardoise et
  bannières prune en automne. En hiver, centre bas à cristaux, remparts abaissés
  et grande tour arrière droite contre le bord pour dégager la jonction des voies. Les entrées
  ennemies sont des portails corrompus (88×108 pixels), avec runes et brèche
  lumineuse : braise, violet glacé, vert vénéneux ou mauve selon la carte.
  Vortex animé en boucle : trois spirales, particules aspirées et cœur pulsant.
  32 images précalculées dans un atlas de 1152×704, lecture à 16 images/s ;
  aucun redessin Canvas par tick. Textures générées au démarrage, sans nouveaux assets à transférer.
- Placement hors zone constructible : message « Impossible » à la place de
  « Trop loin des routes » ; les raisons utiles (or, occupation, limite de murs) restent explicites.
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

- Neuf tests dédiés au terrain saisonnier (`SeasonalTerrainTest`) : crue prévisible
  et tir suspendu/rétabli, boue limitée à ses cases et vague retardée, géants
  insensibles à la boue (solo et live), cycle de
  brume annoncé, portée réduite en solo, mêmes règles en live, persistance.
- TypeScript et build Next de production validés ; ESLint sans erreur,
  dix avertissements déjà présents.
- Aperçu manuel de la vraie scène (`scripts/perf-bench/seasonal.ts`) : repos,
  annonce de crue (bruine), crue (averse + eau), brume des vagues 1/2/3.

Facteur de boue, pénalité de brume et emplacements constituent un premier réglage.
L’équilibrage sur de longues parties et le test réseau avec deux joueurs restent
à faire. Le harnais historique de balance ne mesure que son scénario existant.

### Décor des abords des châteaux

- Printemps : six petits cerisiers et lilas en trois paires devant le château, axe du pont dégagé.
- Désert : deux obélisques de grès à incrustations turquoise et touches de sable.
- Automne : trois petites nappes de brume translucides à dérive lente au pied du château, purement décoratives (aucun effet sur la portée).
