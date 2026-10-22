# JFD 70's Invitational

Suivi des scores du séjour golfique en La Rioja, du 16 au 19 mars 2027.
Douze joueurs, trois parcours, trois classements — brut, net et « Le Prophète » — et un duel par équipes.

## Mise en ligne

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/OWNER/REPO)

Le bouton recopie ce dépôt dans votre compte GitHub, **crée la base de données D1**, la relie
à l'application et met le tout en ligne. Rien à saisir, rien à installer.

Au premier chargement, l'application demande de choisir un **code d'administration**. Notez-le :
il est le seul moyen de composer les parties et de désigner les marqueurs.

## Les trois rôles

| Rôle | Comment on y accède | Ce qu'il peut faire |
|---|---|---|
| **Administrateur** | le code, depuis le bouton « Administration » en bas du classement | tout : composer les parties, désigner les marqueurs, corriger n'importe quel score, modifier index et équipes |
| **Marqueur** | un lien `…/#m=jeton` envoyé par l'administrateur | saisir les scores et les annonces **des quatre joueurs de sa partie, ce jour-là seulement** |
| **Lecteur** | l'adresse nue | consulter le classement en direct et le carnet de parcours |

Aucune inscription nulle part : ni compte, ni mot de passe, ni application à installer.
Un jeton de marqueur se régénère d'un tap si le lien a circulé trop loin.

## Les parcours

Jour 1, parcours à confirmer, 9 trous ; jour 2, El Campo de Logroño ; jour 3, Izki Golf.
Pour Logroño et Izki, les cartes officielles RFEG donnent les pars, index et longueurs blanches
et jaunes — y compris le trou 4 de Logroño, joué des barres noires, 618 m, le plus long d'Espagne.
Izki porte en plus les visuels annotés du guide du club : repères de distance, profondeur de green,
profil et dénivelé, et les carries OpenYardage sur les neuf trous où ils ont été recoupés avec la
carte officielle.

## Le Prophète

Avant le départ du trou 1, chacun annonce à voix haute le score total qu'il va faire. Les points sont
l'écart entre l'annoncé et le réalisé, dans un sens comme dans l'autre ; le plus petit cumul sur les
trois parcours est sacré Prophète du séjour. Annonce exacte, tournée offerte.

## Architecture

Un Worker Cloudflare, une base D1, pas d'étape de compilation. `src/index.js` sert l'API et délègue
le reste aux fichiers de `public/`. Les tables se créent toutes seules au premier appel.

Pour travailler en local : `npm install` puis `npm run dev`.

## Volumétrie

Le séjour entier représente environ 650 scores saisis, à comparer aux 100 000 écritures quotidiennes
de l'offre gratuite de Cloudflare. Il n'y a aucun scénario de dépassement.
