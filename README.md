# Antisèche — Socle commun, 1944 → 2026

Un document de travail citoyen qui présente quatre-vingts ans de réformes
françaises de la même façon à chaque fois : ce qui était **promis** à
l'époque, ce qui était **débattu**, et ce qu'on peut en dire **factuellement**
avec le recul. Chaque période est replacée dans son contexte international et
chiffré, parce qu'un gouvernement hérite d'une conjoncture, il ne la crée pas
entièrement.

Site : https://antiseche.org

<!-- Capture d'écran : vue d'ensemble de la page (hero + bandeau d'indicateurs) -->
<!-- ![Vue d'ensemble](docs/screenshot-hero.png) -->

<!-- Capture d'écran : une carte de réforme dépliée avec ses trois colonnes -->
<!-- ![Carte réforme dépliée](docs/screenshot-reforme.png) -->

## Comment ça marche

C'est un site **entièrement statique**, en JavaScript vanilla (aucun
framework, aucune dépendance) :

```
data/                  contenu éditorial, en JSON
  periodes.json          les périodes, leurs réformes imbriquées et leurs
                          repères européens
  indicateurs.json        séries chiffrées du bandeau (croissance, chômage...),
                          indexées par année puis par KPI ; plus une section
                          indicateurs_specifiques pour les KPI à couverture
                          historique partielle (PISA depuis 2000, DIRD depuis
                          1981), chacun sur son propre axe d'années
  criteres.json           critères de sélection des réformes
  ecartees.json           réformes écartées, candidates à réintégration
  sources.json            fact-checking des indicateurs (fiabilité, sources
                          INSEE/INED) affiché sur la page /sources
  glossaire.json          définitions courtes des termes techniques, page
                          /glossaire ; dans les textes, un terme se balise
                          [[texte affiché|id]] (bulle de définition sur la frise)

src/
  styles.css              feuille de style (design du document)
  runtime.js              JS de la page générée : curseur de lecture au
                          scroll, ouverture d'une carte via l'URL, chargement
                          différé des commentaires Giscus

build.js                script de build : lit /data, génère dist/ en pages
                        distinctes à URLs propres (le HTML est pré-rendu,
                        pas construit au chargement de la page) :
                          /              accueil, l'ambition du projet
                          /frise         la frise (bandeau + réformes),
                                         ex-page unique
                          /analyse       index des KPI, un lien par
                                         /analyse/{slug}
                          /sources       fact-checking des indicateurs,
                                         accessible en pied de page
                          /glossaire     termes techniques, accessible en
                                         pied de page et depuis les textes
```

Le build ne dépend d'aucun outil externe (pas de Vite, pas de bundler) : c'est
un script Node qui lit les JSON et écrit des chaînes de caractères HTML,
volontairement simple pour un site sans composants.

### Construire le site

```bash
node build.js
```

Génère `dist/index.html`, `dist/frise/index.html`, `dist/analyse/index.html`
et une page par KPI (`dist/analyse/{slug}/index.html`),
`dist/sources/index.html`, ainsi que `dist/styles.css` et `dist/runtime.js`.
Ouvrez `dist/index.html` directement dans un navigateur, ou servez `dist/`
avec n'importe quel serveur statique (les liens internes sont en chemins
absolus, donc `/frise`, `/analyse`, etc. ont besoin d'être servis depuis la
racine).

La page `/sources` détaille, indicateur par indicateur, le fact-checking des
KPI du bandeau contre les séries INSEE/INED (valeurs année par année, niveau
de fiabilité, sources primaires).

### Déploiement

Le site est hébergé sur un VPS OVH, servi par Caddy (HTTPS Let's Encrypt
automatique, `www.antiseche.org` redirigé vers `antiseche.org`). Le domaine et
sa zone DNS sont également chez OVH.

Le déploiement se fait par récupération côté serveur : un timer systemd
(`antiseche-deploy.timer`) vérifie toutes les 5 minutes si `main` a avancé sur
GitHub ; si oui, le script `/usr/local/bin/antiseche-deploy` met à jour le clone
`/srv/antiseche/repo`, lance `node build.js` et synchronise `dist/` vers
`/var/www/antiseche`. Un commit poussé (ou une PR fusionnée) est donc en ligne
en 5 minutes au plus, sans secret ni clé du serveur stockés côté GitHub.

- Forcer un redéploiement : `sudo -u antiseche /usr/local/bin/antiseche-deploy --force`
- Consulter les déploiements : `journalctl -u antiseche-deploy`

## Commentaires et corrections

Chaque réforme a son propre fil de discussion, propulsé par
[Giscus](https://giscus.app) (adossé aux Discussions GitHub de ce dépôt). Le
widget correspondant à une réforme ne se charge qu'à l'ouverture de sa carte,
pour ne jamais alourdir le chargement initial de la page.

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md) pour les critères de sélection des
réformes, l'exigence de sourçage, et comment proposer une modification.

## Licences

- **Code** (build, styles, scripts) : [MIT](LICENSE).
- **Contenu éditorial** (`/data`, textes des réformes) :
  [CC BY-SA 4.0](LICENSE-CONTENT).
