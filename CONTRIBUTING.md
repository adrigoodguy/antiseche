# Contribuer à Antisèche

Merci de vouloir améliorer ce document. Deux façons de contribuer : proposer une
**correction ponctuelle** (commentaire sur une réforme) ou une **modification du
contenu** (pull request sur les données).

## Corrections et discussions

Chaque réforme a son propre espace de discussion, propulsé par
[Giscus](https://giscus.app) (adossé aux Discussions GitHub de ce dépôt). Ouvrez
la carte de la réforme concernée sur le site et connectez-vous avec un compte
GitHub pour commenter, signaler une erreur ou proposer une source. Toute
correction sourcée est bienvenue.

## Modifier le contenu (pull request)

Le contenu éditorial vit dans `/data` (fichiers JSON) :

- `periodes.json` — les périodes et leurs réformes imbriquées (promesse, débat,
  bilan, sources).
- `indicateurs.json` — les séries chiffrées du bandeau (croissance, chômage...).
- `criteres.json` — les critères de sélection des réformes (voir ci-dessous).
- `ecartees.json` — les réformes écartées et candidates à réintégration.

Après modification, régénérez le site avec `node build.js` (voir le README)
et vérifiez le rendu dans `dist/index.html` avant d'ouvrir votre pull request.

## Critères de sélection des réformes

Une réforme est retenue dans ce document si elle remplit ces critères :

1. **Impact structurel** : la réforme a changé durablement la vie quotidienne,
   l'économie ou les institutions.
2. **Traçabilité** : promesses et résultats documentables par des sources
   primaires.
3. **Valeur pédagogique pour 2027** : elle éclaire un débat encore ouvert.
4. Les **échecs et retraits comptent autant** que les succès (CPE, plan Juppé,
   bouclier fiscal...).

## Exigence de sourçage

- **v1 (ce document)** : liens « points d'entrée » — notices Vie-publique.fr,
  Wikipédia, institutions d'évaluation (France Stratégie, Cour des comptes,
  COR, DARES, DREES, CEVIPOF).
- **v2 (objectif)** : chaque affirmation chiffrée liée à sa source primaire
  (texte Légifrance, série INSEE, rapport d'évaluation paginé, archive INA du
  discours d'époque).
- Mentions « Consensus / Débattu / Retrait » : appréciation éditoriale ouverte
  à contestation — c'est précisément la fonction des commentaires.

Toute pull request qui ajoute ou modifie une affirmation chiffrée ou factuelle
doit inclure une source vérifiable dans le champ `src` de la réforme
concernée.
