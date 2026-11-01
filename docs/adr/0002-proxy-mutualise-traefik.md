# ADR 0002 — Proxy HTTP(S) mutualisé (Traefik) pour tous les projets du VPS

- **Statut** : Accepté
- **Date** : 2026-11-01
- **Décideur** : Kim

## Contexte

- Le VPS héberge KCD Formes et Équilibre (démo mobile), et bientôt Trame.
- Le Caddy de ce projet tenait seul les ports 80/443 et servait aussi Équilibre. Pour cela, il y avait un bloc dans `docker/caddy/Caddyfile`, et une connexion manuelle au réseau `equilibre-proxy` absente du compose : un `docker compose up` qui recréait Caddy coupait Équilibre.
- Mettre Trame en ligne aurait obligé à modifier et redéployer KCD : le déploiement d'un projet dépendait d'un autre.

## Options étudiées

| Option | Pour | Contre |
|---|---|---|
| A. Garder Caddy dans KCD et y ajouter chaque projet | Rien à migrer | Couplage : chaque mise en ligne passe par ce dépôt |
| B. Caddy mutualisé dans une stack dédiée | Syntaxe connue | Un Caddyfile central à éditer pour chaque projet |
| **C. Traefik mutualisé, routes déclarées par labels** | Chaque projet décrit ses propres routes, découverte automatique des conteneurs | Un outil de plus à maîtriser |

## Décision

1. Traefik vit dans une stack dédiée (dépôt `vps-edge`, déployé dans `/opt/edge`). C'est le seul conteneur du VPS qui publie les ports 80/443. Il gère Let's Encrypt, la redirection HTTP → HTTPS, les en-têtes de sécurité et la compression.
2. KCD rejoint le réseau externe `edge` et déclare ses routes par labels :
   - `/api` et `/ws` vers le backend ;
   - le reste vers le front.
3. Le service `caddy` et `docker/caddy/` sont supprimés de ce dépôt. Équilibre est routé par un fichier dans `vps-edge`.
4. Traefik ne lit le socket Docker qu'à travers un proxy en lecture seule.

## Conséquences

**Positives**
- Mettre en ligne ou retirer un projet ne touche plus les autres.
- HTTPS, sécurité et compression sont configurés au même endroit pour tout le VPS.

**Négatives**
- Ce projet dépend du proxy mutualisé : `deploy.yml` échoue explicitement si le réseau `edge` est absent.
- Les certificats sont réémis par Traefik à la bascule. L'ancien volume `caddy_data` est conservé jusqu'à la validation, pour pouvoir revenir en arrière.
