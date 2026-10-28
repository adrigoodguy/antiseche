/*
 * Génère le site statique dans dist/ à partir des données JSON (/data)
 * et des sources (/src). JS vanilla, aucune dépendance.
 */
const fs = require("fs");
const path = require("path");
const { pagesSamples } = require("./samples");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

const INDICATEURS = JSON.parse(fs.readFileSync(path.join(DATA, "indicateurs.json"), "utf8"));
const PERIODES = JSON.parse(fs.readFileSync(path.join(DATA, "periodes.json"), "utf8"));
const CRITERES = JSON.parse(fs.readFileSync(path.join(DATA, "criteres.json"), "utf8"));
const ECARTEES = JSON.parse(fs.readFileSync(path.join(DATA, "ecartees.json"), "utf8"));
const SOURCES = JSON.parse(fs.readFileSync(path.join(DATA, "sources.json"), "utf8"));
const GLOSSAIRE = JSON.parse(fs.readFileSync(path.join(DATA, "glossaire.json"), "utf8"));
const GLOSSAIRE_PAR_ID = new Map(GLOSSAIRE.map(g => [g.id, g]));
const PROGRAMMES = JSON.parse(fs.readFileSync(path.join(DATA, "programmes.json"), "utf8"));

// indicateurs.json est indexé par année (une clé par année, un sous-objet par KPI)
// pour rester facile à relire/vérifier ; on le remet ici sous la forme
// {lab, unit, d:[...]} qu'attendent le rendu des sparklines et le curseur.
const ANNEES = Object.keys(INDICATEURS.annees).map(Number).sort((a, b) => a - b);
const INDIC_PAR_LAB = new Map();
for (const [lab, unit] of Object.entries(INDICATEURS.unites)) {
  INDIC_PAR_LAB.set(lab, { lab, unit, d: ANNEES.map(a => INDICATEURS.annees[String(a)][lab]) });
}
// Indicateurs à couverture historique partielle (ex. PISA depuis 2000, DIRD
// depuis 1981) : chacun garde son propre axe d'années plutôt que d'être forcé
// sur la grille dense 1950-2025 partagée par les indicateurs ci-dessus —
// aucune valeur inventée avant leur premier point réel.
for (const [lab, spec] of Object.entries(INDICATEURS.indicateurs_specifiques || {})) {
  const anneesSpec = Object.keys(spec.valeurs).map(Number).sort((a, b) => a - b);
  INDIC_PAR_LAB.set(lab, {
    lab,
    unit: spec.unit,
    annees: anneesSpec,
    d: anneesSpec.map(a => spec.valeurs[String(a)]),
    // Séries secondaires optionnelles (issue #13, Espérance de vie) : portées
    // telles quelles jusqu'à graphiqueKpi, qui sait les tracer en statique.
    series: spec.series,
  });
}

// L'ordre d'affichage suit les familles thématiques (issue #2), pas l'ordre
// d'arrivée dans le JSON : on aplatit data.groupes dans l'ordre déclaré.
const GROUPES = INDICATEURS.groupes || [];
const classes = new Set(GROUPES.flatMap(g => g.indicateurs));
const nonClasses = [...INDIC_PAR_LAB.keys()].filter(lab => !classes.has(lab));
if (nonClasses.length) {
  throw new Error(`Indicateur(s) sans groupe dans data/indicateurs.json : ${nonClasses.join(", ")}`);
}
const DESCRIPTIONS = INDICATEURS.descriptions || {};
const INDIC = GROUPES.flatMap(g => g.indicateurs.map(lab => {
  const ind = INDIC_PAR_LAB.get(lab);
  if (!ind) throw new Error(`Groupe "${g.nom}" référence un indicateur inconnu : ${lab}`);
  const desc = DESCRIPTIONS[lab];
  if (!desc) throw new Error(`Aucune description/slug pour l'indicateur "${lab}" (data/indicateurs.json, clé descriptions)`);
  return { ...ind, groupe: g.nom, couleur: g.couleur, fond: g.fond, slug: desc.slug, resume: desc.resume };
}));

const Y0 = 1945, Y1 = 2026;
const SW = 118, SH = 34;
// Partagé entre la frise (curseur du bandeau) et /sources (tableaux) :
// même modèle de données côté client.
// .series (Hommes/Femmes pour Espérance de vie) n'est consommé que côté
// serveur par graphiqueKpi : runtime.js ne lit que d/annees, pas la peine
// de l'embarquer dans le JSON envoyé au client sur /frise et /sources.
const DONNEES_INDIC_JSON = JSON.stringify({ annees: ANNEES, indicateurs: INDIC.map(({ series, ...ind }) => ind) });

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Termes techniques (issue #15) : balisés à la main dans les textes sous la
// forme [[texte affiché|id]], plutôt que repérés automatiquement (pas de faux
// positifs). Le lien mène à /glossaire ; sur la frise, runtime.js l'ouvre en
// bulle de définition sans quitter la page.
function glose(html) {
  return html.replace(/\[\[([^|\]]+)\|([a-z0-9-]+)\]\]/g, (_, texte, id) => {
    if (!GLOSSAIRE_PAR_ID.has(id)) throw new Error(`Terme de glossaire inconnu : [[${texte}|${id}]] (data/glossaire.json)`);
    return `<a class="glo" href="/glossaire#${id}" data-glo="${id}">${texte}</a>`;
  });
}

// Navigation commune (issue #9) : Accueil / Frise / Analyse / Sources.
function nav(actif) {
  const item = (href, label, id) => `<a href="${href}"${id === actif ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<nav class="nav-principale">
    ${item("/", "Accueil", "accueil")}
    ${item("/frise", "Frise", "frise")}
    ${item("/analyse", "Analyse", "analyse")}
    ${item("/programmes", "Programmes 2027", "programmes")}
    ${item("/sources", "Sources", "sources")}
  </nav>`;
}

function piedSources(extra) {
  return `${extra ? `${extra} ` : ""}<a href="/sources">Sources &amp; fiabilité des indicateurs →</a> · <a href="/glossaire">Glossaire →</a>`;
}

/* --- Bandeau sparklines --- */
function sparkSVG(ind, i) {
  const anneesInd = ind.annees || ANNEES;
  const min = Math.min(...ind.d), max = Math.max(...ind.d), pad = (max - min) * 0.1 || 1;
  const x = a => ((a - Y0) / (Y1 - Y0)) * SW, y = v => SH - ((v - (min - pad)) / ((max + pad) - (min - pad))) * SH;
  const pts = ind.d.map((v, k) => `${x(anneesInd[k]).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return `<div class="spark" data-vi="${i}"><div class="lab">${ind.lab} <span class="unit">(${ind.unit})</span></div>
  <svg width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}" aria-hidden="true">
    <line x1="0" y1="${y(0) > 0 && y(0) < SH ? y(0).toFixed(1) : SH}" x2="${SW}" y2="${y(0) > 0 && y(0) < SH ? y(0).toFixed(1) : SH}" stroke="#232836" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="#8B93A7" stroke-width="1.6" stroke-linejoin="round"/>
    <line class="curseur" data-i="${i}" x1="0" x2="0" y1="0" y2="${SH}" stroke="#F2F4F8" stroke-width="1.6"/>
  </svg><div class="val" data-vi="${i}">—</div></div>`;
}

// Regroupe les cartes déjà triées par famille (INDIC suit l'ordre de
// data.groupes) en segments avec bordure et étiquette de thématique (issue #2).
function bandeauGroupes() {
  const groupes = [];
  INDIC.forEach((ind, i) => {
    const dernier = groupes[groupes.length - 1];
    if (!dernier || dernier.nom !== ind.groupe) groupes.push({ nom: ind.groupe, couleur: ind.couleur, fond: ind.fond, cartes: [] });
    groupes[groupes.length - 1].cartes.push(sparkSVG(ind, i));
  });
  return groupes.map(g => `<div class="groupe-ind" style="--gc:${g.couleur};--gfond:${g.fond}">
    <div class="groupe-cartes">${g.cartes.join("")}</div>
    <div class="groupe-nom">${esc(g.nom)}</div>
  </div>`).join("");
}

// Panneau de filtre (issue #3) : une case à cocher par indicateur, regroupée
// par famille, toutes cochées par défaut.
function panneauFiltre() {
  const indexParLab = new Map(INDIC.map((ind, i) => [ind.lab, i]));
  return GROUPES.map(g => `<div class="filtre-groupe">
    <div class="filtre-groupe-nom">${esc(g.nom)}</div>
    ${g.indicateurs.map(lab => `<label class="filtre-item"><input type="checkbox" checked data-vi="${indexParLab.get(lab)}"> ${esc(lab)}</label>`).join("")}
  </div>`).join("");
}

/* --- Carte réforme --- */
function carteReforme(r, pid) {
  const badges = { consensus: '<span class="badge consensus">Consensus</span>', debattu: '<span class="badge debattu">Débattu</span>', echec: '<span class="badge echec">Retrait / échec</span>' };
  const srcs = r.src.map(s => `<a href="${s[1]}" target="_blank" rel="noopener">${esc(s[0])} ↗</a>`).join("");
  const terme = `${pid}-${r.id}`;
  return `<details class="reforme" id="${terme}">
  <summary><span class="fleche">›</span><span class="annee">${r.an}</span><span class="titre">${esc(r.t)}</span>${badges[r.b]}<span class="resume">${esc(r.res)}</span></summary>
  <div class="colonnes">
    <div class="col promesse"><h4>Promesse / objectif d'époque</h4><p>${glose(r.pro)}</p></div>
    <div class="col debat"><h4>Débat contemporain</h4><p>${glose(r.deb)}</p></div>
    <div class="col bilan"><h4>Bilan factuel, avec le recul</h4><p>${glose(r.bil)}</p></div>
  </div>
  <div class="pied"><a class="lien-ancre" href="#${terme}" title="Lien direct vers cette réforme">#lien</a><span class="src">${srcs}</span></div>
</details>`;
}

/* --- Sections période --- */
function sectionPeriode(p) {
  return `
<section class="periode" id="${p.id}" data-start="${p.start}" data-end="${p.end}">
  <div class="filigrane" aria-hidden="true">${p.years.replace("–", "·")}</div>
  <div class="quand">${p.years}</div>
  <h2>${esc(p.titre)}</h2>
  <div class="regime">${esc(p.regime)}</div>
  <div class="contexte"><h3>Le monde à ce moment-là</h3><p>${glose(p.ambiance)}</p>
  <div class="chiffres">${p.chips.map(c => `<span class="chip">${c[0]} : <b>${c[1]}</b></span>`).join("")}</div>
  <div class="europe"><h4>Repères européens</h4><ul>${p.europe.map(e => `<li>${glose(e)}</li>`).join("")}</ul></div></div>
  ${p.reformes.map(r => carteReforme(r, p.id)).join("")}
</section>`;
}

/* --- Annexe --- */
function annexe() {
  return `
<h2>Annexe · Méthode et transparence</h2>
<h3>Critères de sélection des réformes</h3>
<ol>${CRITERES.map(c => `<li>${c}</li>`).join("")}</ol>
<div class="avert"><b>Biais assumé de la version 1</b> — Cette sélection privilégie l'économique, le social et l'institutionnel. Le régalien (justice, police, immigration) et l'écologie sont sous-représentés : c'est un choix de première version, écrit noir sur blanc, que les relectures feront évoluer. Les chiffres de contexte sont des ordres de grandeur à re-vérifier sur les séries longues INSEE / Banque mondiale / Eurostat avant toute diffusion large.</div>
<h3>Réformes écartées (et candidates à réintégration)</h3>
<table class="re-table"><thead><tr><th>Période</th><th>Écartées en v1 — avec la raison</th></tr></thead>
<tbody>${ECARTEES.map(e => `<tr><td class="in">${e[0]}</td><td>${e[1]}</td></tr>`).join("")}</tbody></table>
<h3>Sources & niveau de preuve</h3>
<ul>
<li><b>v1 (ce document)</b> : liens « points d'entrée » — notices Vie-publique.fr, Wikipédia, institutions d'évaluation (France Stratégie, Cour des comptes, COR, DARES, DREES, CEVIPOF).</li>
<li><b>v2 (objectif)</b> : chaque affirmation chiffrée liée à sa source primaire (texte Légifrance, série INSEE, rapport d'évaluation paginé, archive INA du discours d'époque).</li>
<li>Mentions « Consensus / Débattu / Retrait » : appréciation éditoriale ouverte à contestation — c'est précisément ce que les corrections sourcées doivent faire évoluer. Elles décrivent l'état des évaluations et du débat, pas l'opinion du site : « Consensus » signifie que les évaluations convergent ou, pour une réforme de société, que plus aucun grand parti ne la remet en cause — pas qu'elle a toujours été majoritaire dans l'opinion.</li>
<li><b>Glossaire</b> : définitions courtes des termes techniques (stagflation, Bretton Woods, politique de l'offre…), avec une source pour approfondir — <a href="/glossaire">antiseche.org/glossaire</a>.</li>
<li><b>Données sources</b> : détail du fact-checking des indicateurs du bandeau, année par année, avec sources et niveau de fiabilité — <a href="/sources">antiseche.org/sources</a>.</li>
</ul>
<h3>Corrections et remarques</h3>
<p>Une erreur, une source plus solide, une réforme qui manque, ou une remarque sur la méthode&nbsp;? Ouvrez une <a href="https://github.com/adrigoodguy/antiseche/issues" target="_blank" rel="noopener">issue sur GitHub ↗</a> en précisant la réforme concernée (le lien <code>#lien</code> de sa carte suffit).</p>`;
}

/* --- Page « Frise » (contenu de l'ex-page unique, déplacé tel quel sur /frise, issue #9) --- */
function pageFrise() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Socle commun · 1944–2026 · Réformes, promesses et résultats</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>

${nav("frise")}

<header class="hero">
  <h1>Socle commun<br><span class="annees">1944 → 2026</span></h1>
  <p class="standfirst">Quatre-vingts ans de réformes françaises, présentées de la même façon&nbsp;: ce qui était promis à l'époque, ce qui en était débattu, ce qu'on peut en dire factuellement avec le recul. Chaque période est replacée dans son contexte international et chiffré — parce qu'un gouvernement hérite d'une conjoncture, il ne la crée pas entièrement. Objectif&nbsp;: une clé de lecture partagée du passé, avant de juger les promesses de demain.</p>
  <div class="legende">
    <span class="badge consensus">Consensus</span><span>bilan largement partagé : les évaluations convergent, ou plus aucun grand parti ne remet la réforme en cause</span>
    <span class="badge debattu">Débattu</span><span>effets encore discutés</span>
    <span class="badge echec">Retrait / échec</span><span>réforme abandonnée ou censurée</span>
  </div>
  <p class="legende-note">Ces mentions décrivent l'état des évaluations et du débat, pas la position du site. Les termes <a class="glo" href="/glossaire">soulignés en pointillé</a> renvoient à une définition courte.</p>
</header>

<div id="bandeau" aria-label="Indicateurs France 1945–2026, le curseur suit votre lecture">
  <button id="filtre-toggle" type="button" aria-expanded="false" aria-controls="filtre-panel">Filtrer ▾</button>
  <div id="filtre-panel" hidden>${panneauFiltre()}</div>
  <div class="inner" id="bandeau-inner">${bandeauGroupes()}</div>
  <div id="annee-curseur">1944</div>
</div>

<main id="contenu">${PERIODES.map(sectionPeriode).join("")}</main>

<section id="annexe-conteneur"><main id="annexe">${annexe()}</main></section>

<footer>
  Sources principales&nbsp;: INSEE (séries longues), Vie-publique.fr, Légifrance, Cour des comptes, France Stratégie, Banque mondiale, archives INA. Les liens de la v1 sont des points d'entrée (notices Vie-publique / Wikipédia) destinés à être remplacés par les sources primaires en v2. Les chiffres du bandeau et des encadrés contexte sont des ordres de grandeur à re-vérifier ligne à ligne avant publication. Document ouvert aux corrections — c'est le principe&nbsp;: <a href="https://github.com/adrigoodguy/antiseche/issues" target="_blank" rel="noopener">proposer une correction ↗</a>.
  <p class="pied-sources">${piedSources()}</p>
</footer>

<script>window.__DONNEES_INDIC__=${DONNEES_INDIC_JSON};window.__GLOSSAIRE__=${JSON.stringify(Object.fromEntries(GLOSSAIRE.map(g => [g.id, g]))).replace(/</g, "\\u003c")};</script>
<script src="/runtime.js"></script>
</body>
</html>
`;
}

/* --- Essai /sample7 (issue #18) : la frise avec un « mode effet » du bandeau ---
   À l'ouverture d'une carte, le bandeau montre la fenêtre qui suit la réforme
   (src/effets.js). Indicateurs visés et horizon renseignés à la main pour
   quelques réformes, à titre d'illustration ; les autres prennent 10 ans et
   tous les indicateurs. Non liée depuis le site, en noindex. */
const EFFETS_ESSAI = {
  "gprf-secu": { horizon: 25, cibles: ["Espérance de vie"] },
  "mitterrand-rigueur83": { horizon: 5, cibles: ["Inflation", "Chômage"] },
  "chirac-35h": { horizon: 5, cibles: ["Chômage", "Croissance PIB"] },
  "macron-qqec": { horizon: 5, cibles: ["Dette publique", "Croissance PIB"] },
};
const CSS_SAMPLE7 = `<style>
.essai-bandeau{padding:var(--sp-2) 5vw;font-size:var(--tx-label);color:var(--gris);border-bottom:1px solid var(--trait);text-align:center}
.essai-bandeau b{color:var(--accent)}
.spark .fenetre{fill:var(--gc, var(--accent));fill-opacity:0}
.spark .jalon{stroke:var(--gris);stroke-width:1;opacity:0}
#bandeau.mode-effet .spark .fenetre{fill-opacity:.16}
#bandeau.mode-effet .spark .jalon{opacity:1}
#bandeau.mode-effet{border-bottom-color:var(--violet)}
.spark{transition:opacity var(--transition)}
#bandeau.mode-effet .spark.estompe{opacity:.3}
.spark .val .delta{font-family:var(--corps);font-weight:600;font-size:var(--tx-micro);color:var(--gris)}
.spark .val .borne{font-family:var(--corps);font-weight:400;font-size:.6rem;color:var(--gris)}
#annee-curseur small{font-size:.6em;color:var(--texte)}
.effet-ctrl{display:flex;flex-wrap:wrap;align-items:center;gap:var(--sp-2) var(--sp-4);padding:var(--sp-3) var(--sp-5);border-top:1px solid var(--trait);background:color-mix(in srgb, var(--violet) 10%, var(--surface))}
.effet-titre{font-family:var(--display);font-weight:800;font-size:var(--tx-micro);letter-spacing:.12em;text-transform:uppercase;color:var(--violet-clair)}
.effet-horizons{display:inline-flex;gap:var(--sp-1)}
.effet-horizons button{font:600 var(--tx-label)/1 var(--corps);color:var(--texte);background:none;border:1px solid var(--trait);border-radius:999px;padding:.45em .9em;cursor:pointer}
.effet-horizons button[aria-pressed="true"]{background:var(--accent);border-color:var(--accent);color:var(--nuit)}
.effet-cibles{font-size:var(--tx-label);color:var(--gris)}
</style>`;

function pageSample7() {
  const parTerme = new Map(PERIODES.flatMap(p => p.reformes.map(r => [`${p.id}-${r.id}`, r])));
  for (const [terme, e] of Object.entries(EFFETS_ESSAI)) {
    if (!parTerme.has(terme)) throw new Error(`EFFETS_ESSAI : réforme inconnue ${terme}`);
    for (const lab of e.cibles) if (!INDIC_PAR_LAB.has(lab)) throw new Error(`EFFETS_ESSAI : indicateur inconnu ${lab}`);
  }
  const remplacer = (html, avant, apres) => {
    if (!html.includes(avant)) throw new Error(`pageSample7 : motif absent de la frise : ${avant}`);
    return html.replace(avant, apres);
  };
  let html = pageFrise().replace(/<details class="reforme" id="([a-z0-9-]+)">/g, (_, terme) => {
    const an = String(parTerme.get(terme).an).match(/\d{4}/)[0];
    const e = EFFETS_ESSAI[terme] || { horizon: 10, cibles: [] };
    return `<details class="reforme" id="${terme}" data-an="${an}" data-horizon="${e.horizon}"${e.cibles.length ? ` data-cibles="${esc(e.cibles.join("|"))}"` : ""}>`;
  });
  html = remplacer(html, "<title>Socle commun · 1944–2026 · Réformes, promesses et résultats</title>", `<meta name="robots" content="noindex">\n<title>Effets dans le temps · Essai 7 · Antisèche</title>`);
  html = remplacer(html, "</head>", `${CSS_SAMPLE7}\n</head>`);
  html = remplacer(html, "<body>\n", `<body>\n<div class="essai-bandeau">Essai 7 · <b>Effets dans le temps</b> : ouvrez une carte réforme, le bandeau montre ce qui suit (5, 10 ou 25 ans). Horizons et indicateurs visés renseignés à titre d'exemple sur la Sécurité sociale, le tournant de la rigueur, les 35 heures et le « quoi qu'il en coûte ». · <a href="/frise">Frise actuelle</a></div>\n`);
  html = remplacer(html, '<script src="/runtime.js"></script>', '<script src="/runtime.js"></script>\n<script src="/effets.js"></script>');
  return html;
}

/* --- Page d'accueil (mission du projet, issue #9) --- */
function pageAccueil() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Antisèche · L'idée derrière antisèche</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>

${nav("accueil")}

<header class="hero">
  <div class="eyebrow">Document de travail · version 1 · juillet 2026</div>
  <h1>L'idée derrière<br><span class="annees">antisèche</span></h1>
  <p class="standfirst">Antisèche part d'un constat simple&nbsp;: se forger un avis informé sur 80 ans de réformes françaises peut sembler hors de portée. Trop d'histoire, trop de débats contradictoires, pas assez de temps pour démêler le vrai du faux seul.</p>
  <p class="standfirst">Avant les débats de la présidentielle 2027, j'essaie de construire le socle minimal que j'aurais aimé avoir&nbsp;: des faits, présentés sans étiquette partisane, pour permettre à ceux qui n'ont jamais vraiment rejoint le débat public de s'y retrouver.</p>
  <p class="standfirst">Ce qui me serait utile à moi, je pense qu'il peut l'être à d'autres — d'où l'idée de le construire ici, en public, et peut-être de réunir des contributeurs intéressés en cours de route.</p>
  <p class="standfirst">Le projet reste perfectible, et c'est assumé&nbsp;: le code et les données sont ouverts. On cherche des contributions — techniques, éditoriales, historiques, scientifiques — pour challenger les biais de la version actuelle et muscler la rigueur de l'analyse sans perdre l'approche synthétique. Contribuez sur <a href="https://github.com/adrigoodguy/antiseche" target="_blank" rel="noopener">github.com/adrigoodguy/antiseche</a>.</p>
  <div class="cta-groupe">
    <a class="cta" href="/frise">Frise temporelle</a>
    <a class="cta" href="/analyse">Analyse d'impact</a>
    <a class="cta" href="/programmes">Programmes 2027</a>
  </div>
</header>

<footer>
  ${piedSources()}
</footer>

</body>
</html>
`;
}

/* --- Page « Sources & fiabilité des indicateurs » --- */
function pageSources() {
  const denses = INDIC.filter(i => !i.annees);
  const partiels = INDIC.filter(i => i.annees);

  const labs = denses.map(i => i.lab);
  const thead = `<tr><th>Année</th>${labs.map(l => `<th>${esc(l)}<br>(${esc(INDICATEURS.unites[l])})</th>`).join("")}</tr>`;
  const tbody = ANNEES.map(a => {
    const cells = labs.map(l => `<td>${INDICATEURS.annees[String(a)][l]}</td>`).join("");
    return `<tr><td class="annee">${a}</td>${cells}</tr>`;
  }).join("");
  // Grille quinquennale partagée retirée (issue #13) : les 11 indicateurs ont
  // désormais chacun leur propre axe annuel. La section ne s'affiche que si
  // un futur indicateur y revient un jour — vide sinon, plutôt qu'un tableau
  // fantôme sans colonnes.
  const sectionDenses = denses.length ? `
<h2>Indicateurs à grille dense, année par année (1950-2025)</h2>
<div class="table-scroll"><table class="re-table kpi-table">
<thead>${thead}</thead>
<tbody>${tbody}</tbody>
</table></div>` : "";

  const tablesPartiels = partiels.map(ind => `
<h3>${esc(ind.lab)} (${esc(ind.unit)})</h3>
<div class="table-scroll"><table class="re-table kpi-table">
<thead><tr>${ind.annees.map(a => `<th>${a}</th>`).join("")}</tr></thead>
<tbody><tr>${ind.d.map(v => `<td>${v}</td>`).join("")}</tr></tbody>
</table></div>`).join("");

  // Familles thématiques (issue #2) : même regroupement que le bandeau de la
  // page principale, pour que les deux vues restent cohérentes.
  const familles = `
<h2>Familles d'indicateurs</h2>
<ul class="familles">${GROUPES.map(g => `<li><span class="puce"></span><b>${esc(g.nom)}</b> — ${g.indicateurs.map(esc).join(", ")}</li>`).join("")}</ul>`;

  const kpiParLab = new Map(SOURCES.kpis.map(k => [k.lab, k]));
  const kpiNotes = GROUPES.map(g => {
    const items = g.indicateurs.map(lab => {
      const k = kpiParLab.get(lab);
      if (!k) throw new Error(`Aucune note de sources pour l'indicateur "${lab}" (data/sources.json)`);
      return `<h4>${esc(k.lab)}</h4>
<p><b>Fiabilité :</b> ${k.fiabilite}</p>
<p>${k.note}</p>
<ul>${k.sources.map(s => `<li><a href="${s[1]}" target="_blank" rel="noopener">${esc(s[0])} ↗</a></li>`).join("")}</ul>`;
    }).join("");
    return `<h3>${esc(g.nom)}</h3>${items}`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sources & fiabilité des indicateurs · Socle commun</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>

${nav("sources")}

<header class="hero hero-large">
  <h1>Sources <span class="annees">&amp; fiabilité</span></h1>
  <p class="standfirst">${SOURCES.intro}</p>
  <p class="standfirst"><a href="/frise">← Retour à la frise</a></p>
</header>

<main id="annexe">
${familles}
${sectionDenses}

<h2>Indicateurs, année par année</h2>
${tablesPartiels}

<h2>Sources &amp; fiabilité, KPI par KPI</h2>
${kpiNotes}
</main>

<footer>
  Document ouvert aux corrections (<a href="https://github.com/adrigoodguy/antiseche/issues" target="_blank" rel="noopener">proposer une correction ↗</a>) — voir <a href="/frise#annexe-conteneur">l'annexe de la frise</a> pour la méthode générale du projet.
</footer>

</body>
</html>
`;
}

/* --- Page « Glossaire » (issue #15) : les termes techniques des textes, une ancre par terme --- */
function pageGlossaire() {
  const termes = [...GLOSSAIRE].sort((a, b) => a.terme.localeCompare(b.terme, "fr"));
  const entrees = termes.map(g => `
<div class="glo-entree" id="${g.id}">
  <dt>${esc(g.terme)}</dt>
  <dd><p>${esc(g.def)}</p>
  <p class="src">${g.src.map(s => `<a href="${s[1]}" target="_blank" rel="noopener">${esc(s[0])} ↗</a>`).join(" ")}</p></dd>
</div>`).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Glossaire · Socle commun</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>

${nav("glossaire")}

<header class="hero hero-large">
  <h1>Glossaire</h1>
  <p class="standfirst">Les termes techniques employés dans la frise, en quelques lignes chacun, avec une source pour approfondir. Des définitions volontairement courtes : un point d'entrée, pas un cours d'économie.</p>
  <p class="standfirst"><a href="/frise">← Retour à la frise</a></p>
</header>

<main id="annexe">
<dl class="glossaire">${entrees}</dl>
</main>

<footer>
  Un terme manque ou une définition vous semble inexacte ? Proposez une correction sur <a href="https://github.com/adrigoodguy/antiseche" target="_blank" rel="noopener">GitHub</a> (fichier <code>data/glossaire.json</code>).
  <p class="pied-sources">${piedSources()}</p>
</footer>

</body>
</html>
`;
}

/* --- Programmes 2027 (issue #16) : index par intention de vote + une page par candidature --- */
// Les réformes de la frise, par ancre (#periode-reforme), pour la colonne « Précédent ».
const REFORMES_PAR_ANCRE = new Map(PERIODES.flatMap(p => p.reformes.map(r => [`${p.id}-${r.id}`, r])));
// Tri stable : à score égal, l'ordre de data/programmes.json (celui du tableau de l'institut) est conservé.
const CANDIDATS = [...PROGRAMMES.candidats].sort((a, b) => b.score - a.score);
// Grille commune, calée sur les grands thèmes du Comparative Agendas Project (champ cap).
const THEMES = PROGRAMMES.themes.map(t => t.nom);
{
  const ids = new Set();
  for (const c of CANDIDATS) {
    if (ids.has(c.id)) throw new Error(`Candidature en double dans data/programmes.json : ${c.id}`);
    ids.add(c.id);
    for (const m of c.mesures) {
      const ou = `data/programmes.json, ${c.id}`;
      if (!THEMES.includes(m.theme)) throw new Error(`Thème hors grille commune (${ou}) : ${m.theme}`);
      if (!m.source || !m.date) throw new Error(`Mesure sans source ou sans date (${ou}) : ${m.proposition}`);
      for (const ancre of m.precedents || []) {
        if (!REFORMES_PAR_ANCRE.has(ancre)) throw new Error(`Précédent inconnu dans la frise (${ou}) : ${ancre}`);
      }
    }
  }
}
const pct = v => `${String(v).replace(".", ",")}&nbsp;%`;
// Candidatures déclarées absentes du scénario de référence : listées à part, avec le score d'un autre scénario.
const CLASSEES = CANDIDATS.filter(c => !c.scenario), AUTRE_SCENARIO = CANDIDATS.filter(c => c.scenario);
const exAequo = c => !c.scenario && CLASSEES.filter(x => x.score === c.score).length > 1;

const REGLES_PROGRAMMES = `<ul>
<li>Seuls figurent les <b>engagements vérifiables</b> : une action précise ou un résultat mesurable, dont on pourra dire après coup s'il a été tenu. Les déclarations d'intention générales (« redonner confiance », « une école plus juste ») ne sont pas retenues.</li>
<li>Chaque engagement est reformulé de façon <b>factuelle et sans adjectif</b> : ce qui serait fait, pas ce qu'il faudrait en penser.</li>
<li>Le <b>chiffrage</b> est celui annoncé par la candidature elle-même, « non chiffré » sinon. Antisèche ne chiffre pas les programmes ; un chiffrage indépendant peut être ajouté, en nommant son auteur.</li>
<li>Chaque ligne cite une <b>source datée</b> : le programme officiel en priorité, à défaut un discours ou un entretien, signalé comme tel.</li>
<li>La colonne <b>Précédent</b> renvoie à une réforme comparable de la frise, quand il y en a une : pour voir ce que l'histoire en dit, sans jugement sur la proposition.</li>
<li>La même grille de thèmes s'applique à toutes les candidatures, dans le même ordre (<a href="/programmes#methode">méthode</a>).</li>
</ul>`;

// Section méthode de /programmes (issue #16) : d'où viennent le critère et la grille.
const ref = (texte, url) => `<li>${texte} <a href="${url}" target="_blank" rel="noopener">${url.replace(/^https?:\/\//, "").replace(/\/$/, "")} ↗</a></li>`;
function sectionMethode() {
  return `<h2 id="methode">Méthode</h2>
<p>Il n'existe pas de méthode unique pour comparer des programmes, mais la science politique a établi quelques standards. Antisèche en retient deux, et en écarte d'autres délibérément.</p>
<h3>Ce que l'on retient</h3>
<p><b>1. Le critère de l'engagement vérifiable.</b> Les travaux comparatifs sur le respect des promesses électorales définissent une promesse comme un engagement à mener une action ou à atteindre un résultat dont la réalisation peut être vérifiée. C'est le critère d'entrée dans les tableaux : il écarte la rhétorique sans que le site ait à juger du sérieux d'une proposition. Ces travaux ont aussi été menés sur la France.</p>
<p><b>2. Une grille de thèmes standard.</b> Les thèmes sont regroupés à partir des 21 grands thèmes du <i>Comparative Agendas Project</i> (CAP), une nomenclature internationale utilisée pour classer programmes, lois et budgets, avec une équipe française.</p>
<div class="table-scroll"><table class="re-table">
<thead><tr><th>Thème Antisèche</th><th>Grands thèmes du CAP</th></tr></thead>
<tbody>${PROGRAMMES.themes.map(t => `<tr><td>${esc(t.nom)}</td><td>${esc(t.cap)}</td></tr>`).join("")}</tbody>
</table></div>
<h3>Ce que l'on écarte</h3>
<p><b>Le placement sur une échelle gauche-droite.</b> Le <i>Manifesto Project</i> (codage de chaque phrase des programmes) et le <i>Chapel Hill Expert Survey</i> (positions estimées par des experts) sont des références, mais ils produisent des positions, contestables par nature. Antisèche présente des faits, sans étiquette.</p>
<p><b>Un chiffrage maison.</b> Aux Pays-Bas, un organisme public (le CPB) chiffre les programmes des partis ; au Royaume-Uni, l'Institute for Fiscal Studies les analyse. La France n'a pas d'équivalent officiel, et les chiffrages existants sont souvent perçus comme orientés : le site affiche le chiffrage de la candidature, et nomme l'auteur de tout chiffrage indépendant cité.</p>
<h3>Références</h3>
<ul class="references">
${ref("Thomson, R., Royed, T., Naurin, E. et al. (2017). « The Fulfillment of Parties' Election Pledges: A Comparative Study on the Impact of Power Sharing ». <i>American Journal of Political Science</i>, 61(3), 527-542.", "https://doi.org/10.1111/ajps.12313")}
${ref("Brouard, S., Grossman, E., Guinaudeau, I., Persico, S. et Froio, C. (2018). « Do Party Manifestos Matter in Policy-Making? Capacities, Incentives and Outcomes of Electoral Programmes in France ». <i>Political Studies</i>, 66(4), 903-921.", "https://doi.org/10.1177/0032321717745433")}
${ref("Baumgartner, F. R., Breunig, C. et Grossman, E. (dir.) (2019). <i>Comparative Policy Agendas: Theory, Tools, Data</i>. Oxford University Press.", "https://doi.org/10.1093/oso/9780198835332.001.0001")}
${ref("Grossman, E. (2019). « The French Agendas Project ». Dans <i>Comparative Policy Agendas</i>, op. cit.", "https://doi.org/10.1093/oso/9780198835332.003.0009")}
${ref("Comparative Agendas Project, <i>Master Codebook</i> (grands thèmes).", "https://www.comparativeagendas.net/pages/master-codebook")}
${ref("Manifesto Project (WZB, Berlin).", "https://manifesto-project.wzb.eu/")}
${ref("Chapel Hill Expert Survey.", "https://www.chesdata.eu/")}
${ref("CPB (Pays-Bas), <i>Keuzes in Kaart 2027-2030</i>, chiffrage des programmes électoraux.", "https://www.cpb.nl/presentatie/presentatie-keuzes-kaart-2027-2030")}
${ref("Institute for Fiscal Studies (Royaume-Uni).", "https://ifs.org.uk/")}
</ul>`;
}

function encadreSondage() {
  const s = PROGRAMMES.sondage;
  return `<div class="avert"><b>Ordre d'affichage</b> — intentions de vote au premier tour, sondage ${esc(s.institut)} pour ${esc(s.commanditaire)} (terrain ${esc(s.terrain)}, publié le ${esc(s.publication)}, ${esc(s.echantillon)}), ${esc(s.hypothese)}. ${esc(s.regle)} <a href="${s.notice}" target="_blank" rel="noopener">Notice déposée à la Commission des sondages ↗</a></div>`;
}

function pageProgrammesIndex() {
  const item = c => `
<li class="analyse-item programme-item">
  <a href="/programmes/${c.id}"><b>${esc(c.nom)}</b> <span class="unit">— ${esc(c.parti)}</span></a>
  <span class="score">${pct(c.score)}${exAequo(c) ? ' <span class="ex-aequo">ex æquo</span>' : ""}</span>
  <p>${c.scenario ? `Scénario ${esc(c.scenario)} · ` : ""}${c.relecture ? "En relecture · " : ""}${c.mesures.length ? `${c.mesures.length} élément${c.mesures.length > 1 ? "s" : ""} clé${c.mesures.length > 1 ? "s" : ""} relevé${c.mesures.length > 1 ? "s" : ""}` : "Programme pas encore dépouillé"}</p>
</li>`;
  const autres = AUTRE_SCENARIO.length ? `
<h3>Testées dans un autre scénario du même sondage</h3>
<ul class="analyse-liste">${AUTRE_SCENARIO.map(item).join("")}</ul>` : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Programmes 2027 · Socle commun</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>

${nav("programmes")}

<header class="hero">
  <h1>Programmes <span class="annees">2027</span></h1>
  <p class="standfirst">Les principales candidatures à l'élection présidentielle, présentées selon une même grille : les éléments clés de chaque programme, leur chiffrage annoncé, leur source, et, quand il en existe un, le précédent comparable dans les quatre-vingts ans de réformes de la frise.</p>
</header>

<main id="annexe">
${encadreSondage()}
<ul class="analyse-liste">${CLASSEES.map(item).join("")}</ul>
${autres}
<h3>Règles de lecture</h3>
${REGLES_PROGRAMMES}
${sectionMethode()}
</main>

<footer>
  ${piedSources()}
</footer>

</body>
</html>
`;
}

function pageProgramme(c) {
  const s = PROGRAMMES.sondage;
  const lienSource = src => `<a href="${src[1]}" target="_blank" rel="noopener">${esc(src[0])} ↗</a>`;
  const lignes = THEMES.flatMap(theme => {
    const ms = c.mesures.filter(m => m.theme === theme);
    return ms.map((m, k) => `<tr>
      ${k === 0 ? `<th scope="row" rowspan="${ms.length}">${esc(theme)}</th>` : ""}
      <td>${glose(esc(m.proposition))}</td>
      <td>${esc(m.chiffrage || "non chiffré")}</td>
      <td>${lienSource(m.source)}<br><span class="date">${esc(m.date)}</span></td>
      <td>${(m.precedents || []).map(a => { const r = REFORMES_PAR_ANCRE.get(a); return `<a href="/frise#${a}">${esc(r.t)} (${esc(r.an)}) →</a>`; }).join("<br>") || "—"}</td>
    </tr>`);
  }).join("");
  const tableau = c.mesures.length ? `
<div class="table-scroll"><table class="re-table programme-table">
<thead><tr><th>Thème</th><th>Proposition</th><th>Chiffrage annoncé</th><th>Source</th><th>Précédent dans la frise</th></tr></thead>
<tbody>${lignes}</tbody>
</table></div>
${THEMES.some(t => !c.mesures.some(m => m.theme === t)) ? `<p class="note-themes">Thèmes sans engagement relevé à ce jour : ${THEMES.filter(t => !c.mesures.some(m => m.theme === t)).map(esc).join(", ")}.</p>` : ""}`
    : `<p class="note-themes">Les éléments clés de ce programme n'ont pas encore été relevés. Ils seront présentés selon la grille commune à toutes les candidatures : ${THEMES.map(esc).join(", ")}.</p>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(c.nom)} · Programmes 2027 · Socle commun</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>

${nav("programmes")}

<header class="hero hero-large">
  <div class="eyebrow">Programmes 2027</div>
  <h1>${esc(c.nom)}</h1>
  <p class="standfirst">${esc(c.parti)}</p>
  <div class="cta-groupe liens-candidat">
    <a class="cta" href="${c.site}" target="_blank" rel="noopener">Site du parti ↗</a>
    <a class="cta" href="${encodeURI(c.wiki)}" target="_blank" rel="noopener">Page Wikipédia ↗</a>
  </div>
  <p class="standfirst">Intentions de vote : <b>${pct(c.score)}</b>${exAequo(c) ? " (ex æquo)" : ""}${c.scenario ? ` dans le scénario ${esc(c.scenario)}` : ""} — ${esc(s.institut)} pour ${esc(s.commanditaire)}, ${esc(s.terrain)}.${c.programme ? ` Programme de référence : <a href="${c.programme.url}" target="_blank" rel="noopener">${esc(c.programme.titre)} ↗</a> (${esc(c.programme.date)}).` : ""}</p>
  <p class="standfirst"><a href="/programmes">← Toutes les candidatures</a></p>
</header>

<main id="annexe">
<h2>Éléments clés du programme</h2>
${c.relecture ? `<div class="avert relecture"><b>Fiche en cours de relecture</b> — premier relevé, pas encore validé : les engagements et leurs sources peuvent encore être corrigés.</div>` : ""}
${c.note ? `<div class="avert"><b>Sources</b> — ${esc(c.note)}</div>` : ""}
${tableau}
<h3>Règles de lecture</h3>
${REGLES_PROGRAMMES}
</main>

<footer>
  Une proposition manque, est mal résumée ou mal sourcée ? Proposez une correction sur <a href="https://github.com/adrigoodguy/antiseche" target="_blank" rel="noopener">GitHub</a> (fichier <code>data/programmes.json</code>).
  <p class="pied-sources">${piedSources()}</p>
</footer>

</body>
</html>
`;
}

/* --- Page d'index « Analyse » : liste des KPI, un lien par /analyse/{slug} (issue #9) --- */
function pageAnalyseIndex() {
  const items = INDIC.map(ind => `
<li class="analyse-item">
  <a href="/analyse/${ind.slug}"><b>${esc(ind.lab)}</b> <span class="unit">(${esc(ind.unit)})</span></a>
  <p>${esc(ind.resume)}</p>
</li>`).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Analyse des indicateurs · Socle commun</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>

${nav("analyse")}

<header class="hero">
  <h1>Analyse <span class="annees">des indicateurs</span></h1>
  <p class="standfirst">La vision temporelle présentée dans la frise est une bonne porte d'entrée pour mettre les réformes en perspective, mais elle ne permet qu'une analyse limitée dans la mesure où l'impact des différentes réformes est à lire dans le temps, sur plusieurs années. Les pages thématiques présentées ci-dessous visent à permettre une analyse en profondeur de chaque indicateur et d'éclairer leurs points d'inflexion.</p>
</header>

<main id="annexe">
<ul class="analyse-liste">${items}</ul>
</main>

<footer>
  ${piedSources()}
</footer>

</body>
</html>
`;
}

// Graphique en ligne pour un seul indicateur (issue #9, survol issue #10).
// Rendu côté serveur en SVG statique (grille, axes, courbe, points) ; le
// survol (point le plus proche surligné + infobulle année/valeur) est
// ajouté côté client par runtime.js à partir des attributs data-* posés ici
// sur chaque point — pas besoin de réinjecter tout window.__DONNEES_INDIC__
// pour un graphique à une seule série.
// Séries secondaires optionnelles (issue #13, Espérance de vie) : jusqu'à 2
// séries statiques (non survolables, pas de points) tracées en arrière-plan
// de la série principale interactive — ex. Hommes/Femmes autour de la
// moyenne. `ind.series` = { "Hommes": {annee: valeur}, "Femmes": {...} },
// alignées sur le même `ind.annees` que la série principale. Couleurs prises
// dans la palette existante (violet/menthe) pour n'en introduire aucune nouvelle.
const COULEURS_SERIES_SECONDAIRES = { 1: "var(--violet-clair)", 2: "var(--menthe)" };

function graphiqueKpi(ind) {
  const GW = 760, GH = 320, GML = 56, GMR = 24, GMT = 20, GMB = 34;
  const GPW = GW - GML - GMR, GPH = GH - GMT - GMB;
  const anneesInd = ind.annees || ANNEES;
  const seriesSecondaires = Object.entries(ind.series || {});
  // Le cadrage vertical doit englober la moyenne ET les séries secondaires,
  // sinon Hommes/Femmes débordent du graphique dès qu'elles s'écartent de
  // la moyenne (ce qui est tout leur intérêt).
  const toutesValeurs = ind.d.concat(seriesSecondaires.flatMap(([, vals]) => anneesInd.map(a => vals[String(a)])));
  const min = Math.min(...toutesValeurs), max = Math.max(...toutesValeurs), pad = (max - min) * 0.1 || 1;
  const dMin = min - pad, dMax = max + pad;
  const gx = a => GML + ((a - anneesInd[0]) / (anneesInd[anneesInd.length - 1] - anneesInd[0] || 1)) * GPW;
  const gy = v => GMT + GPH - ((v - dMin) / (dMax - dMin)) * GPH;

  const pts = anneesInd.map((a, k) => `${gx(a).toFixed(1)},${gy(ind.d[k]).toFixed(1)}`).join(" ");
  const anneesAxe = anneesInd.filter((a, k) => k === 0 || k === anneesInd.length - 1 || k % Math.ceil(anneesInd.length / 6) === 0);
  const grille = anneesAxe.map(a => `<line x1="${gx(a).toFixed(1)}" x2="${gx(a).toFixed(1)}" y1="${GMT}" y2="${GMT + GPH}" stroke="var(--trait)" stroke-width="1"/>
    <text x="${gx(a).toFixed(1)}" y="${GMT + GPH + 18}" font-size="10" text-anchor="middle" fill="var(--gris)">${a}</text>`).join("");
  const ticksV = [dMin, (dMin + dMax) / 2, dMax].map(v => `<text x="${GML - 8}" y="${gy(v).toFixed(1)}" font-size="10" text-anchor="end" dominant-baseline="middle" fill="var(--gris)">${Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)}</text>`).join("");
  // Rayon réduit pour les séries denses (PIB annuel, 76 points) : sinon les
  // points se chevauchent visuellement sur les 760px du graphique. Le survol
  // (runtime.js) lit ce rayon de repos depuis data-r plutôt que de le
  // supposer fixe, pour revenir au bon état après un survol.
  const rPt = anneesInd.length > 30 ? 1.5 : 3;
  const points = anneesInd.map((a, k) => `<circle class="pt" data-annee="${a}" data-valeur="${ind.d[k]}" data-r="${rPt}" cx="${gx(a).toFixed(1)}" cy="${gy(ind.d[k]).toFixed(1)}" r="${rPt}" fill="#C6FF3D"/>`).join("");
  const lignesSecondaires = seriesSecondaires.map(([, vals], i) => {
    const p = anneesInd.map(a => `${gx(a).toFixed(1)},${gy(vals[String(a)]).toFixed(1)}`).join(" ");
    return `<polyline points="${p}" fill="none" stroke="${COULEURS_SERIES_SECONDAIRES[i + 1]}" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round" opacity=".8"/>`;
  }).join("");
  const legende = seriesSecondaires.length ? `<div class="graphique-legende">
    <span class="legende-item"><span class="legende-puce" style="background:#C6FF3D"></span>${esc(ind.lab)} (moyenne)</span>
    ${seriesSecondaires.map(([nom], i) => `<span class="legende-item"><span class="legende-puce" style="background:${COULEURS_SERIES_SECONDAIRES[i + 1]}"></span>${esc(nom)}</span>`).join("")}
  </div>` : "";

  return `<div class="graphique-carte">
  <div class="graphique-zone">
    <svg id="graphique-svg" data-unite="${esc(ind.unit)}" viewBox="0 0 ${GW} ${GH}" role="img" aria-label="Série ${esc(ind.lab)}, ${anneesInd[0]}-${anneesInd[anneesInd.length - 1]}, survolable pour le détail année par année">
      ${grille}
      <line x1="${GML}" x2="${GML + GPW}" y1="${GMT + GPH}" y2="${GMT + GPH}" stroke="var(--trait)" stroke-width="1"/>
      ${ticksV}
      <text x="${GML - 8}" y="${GMT - 6}" font-size="9" text-anchor="end" fill="var(--gris)">${esc(ind.unit)}</text>
      ${lignesSecondaires}
      <polyline class="ligne" points="${pts}" fill="none" stroke="#C6FF3D" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      ${points}
      <line id="graphique-crosshair" x1="0" x2="0" y1="${GMT}" y2="${GMT + GPH}" stroke="var(--texte)" stroke-opacity=".5" stroke-dasharray="3 4" stroke-width="1" visibility="hidden"/>
      <rect id="graphique-survol" x="${GML}" y="${GMT}" width="${GPW}" height="${GPH}" fill="transparent"/>
    </svg>
    <div id="graphique-tooltip" class="graphique-tooltip" hidden></div>
  </div>
  ${legende}
</div>`;
}

// Points d'inflexion (issue #10) : gabarit réutilisable — lit note.inflexions
// si présent, ne rend rien sinon. Le jour où un autre KPI reçoit ce champ
// dans data/sources.json, sa page /analyse/{slug} l'affiche sans aucun
// changement de code ici.
function bandeauEditorial(note) {
  if (!note.inflexions || !note.inflexions.length) return "";
  return `<div class="avert"><b>Lecture interprétative</b> — les points d'inflexion plus bas sur cette page sont une lecture interprétative de la série, avec des sources vérifiables. Une corrélation entre deux évènements n'est pas une preuve de causalité&nbsp;: sauf mention contraire justifiée par la littérature citée, ces commentaires décrivent des corrélations documentées, pas des relations de cause à effet établies.</div>`;
}

function sectionInflexions(note) {
  if (!note.inflexions || !note.inflexions.length) return "";
  const cartes = note.inflexions.map(inf => `
<div class="inflexion">
  <div class="inflexion-annee">${esc(inf.annee)}</div>
  <h3>${esc(inf.titre)}</h3>
  <p>${esc(inf.commentaire)}</p>
  <ul>${inf.sources.map(s => `<li><a href="${s[1]}" target="_blank" rel="noopener">${esc(s[0])} ↗</a></li>`).join("")}</ul>
</div>`).join("");

  return `
<h2>Points d'inflexion</h2>
${cartes}`;
}

// Autre regard (gabarit réutilisable, comme sectionInflexions) : un point de
// vue minoritaire/contesté sur l'indicateur lui-même, distinct des points
// d'inflexion sourcés ci-dessus — présenté à part, avec un style plus neutre
// (gris, pas rouge) pour ne pas être confondu avec le reste du contenu
// sourcé INSEE/OFCE de la page.
function sectionAutreRegard(note) {
  if (!note.autreRegard) return "";
  const ar = note.autreRegard;
  return `
<div class="autre-regard">
  <h2>Autre regard&nbsp;: ${esc(ar.titre)}</h2>
  <p>${esc(ar.texte)}</p>
  <ul>${ar.sources.map(s => `<li><a href="${s[1]}" target="_blank" rel="noopener">${esc(s[0])} ↗</a></li>`).join("")}</ul>
</div>`;
}

// Encadré explicatif (gabarit réutilisable, issue #14) : un « mode d'emploi »
// de l'indicateur (qui est mesuré, ce qui ne l'est pas, précision statistique)
// affiché juste sous le graphique, avant les points d'inflexion — utile pour
// tout KPI dont la lecture n'est pas évidente sans contexte méthodologique.
function sectionExplication(note) {
  if (!note.explication) return "";
  const ex = note.explication;
  return `
<div class="encadre-explicatif">
  <h2>${esc(ex.titre)}</h2>
  <dl>${ex.points.map(p => `<dt>${esc(p.label)}</dt><dd>${esc(p.texte)}</dd>`).join("")}</dl>
  <ul>${ex.sources.map(s => `<li><a href="${s[1]}" target="_blank" rel="noopener">${esc(s[0])} ↗</a></li>`).join("")}</ul>
</div>`;
}

// Séries historiques (gabarit réutilisable, issue #14) : tableau des mesures
// partielles disponibles avant la série moderne du KPI, avec leurs limites —
// utile pour tout indicateur dont la courbe affichée ne remonte pas très loin.
function sectionSeriesHistoriques(note) {
  if (!note.seriesHistoriques) return "";
  const sh = note.seriesHistoriques;
  const thead = `<tr>${sh.colonnes.map(c => `<th>${esc(c)}</th>`).join("")}</tr>`;
  const tbody = sh.lignes.map(l => `<tr>${l.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("");
  return `
<h2>${esc(sh.titre)}</h2>
<p>${esc(sh.intro)}</p>
<div class="table-scroll"><table class="re-table"><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>
<p>${esc(sh.conclusion)}</p>
<ul>${sh.sources.map(s => `<li><a href="${s[1]}" target="_blank" rel="noopener">${esc(s[0])} ↗</a></li>`).join("")}</ul>`;
}

/* --- Pages « Analyse » individuelles : contenu réel si une note de fiabilité
   existe dans data/sources.json pour ce KPI, stub « à venir » sinon (issue #9,
   étendu à tous les KPI à l'issue "template PIB partout"). --- */
function pageAnalyseKpi(ind) {
  const kpiParLab = new Map(SOURCES.kpis.map(k => [k.lab, k]));
  const note = kpiParLab.get(ind.lab);

  // Fiabilité & sources est délibérément la dernière section de la page (issue
  // signalée sur /analyse/pisa) : c'est une note de méthode/référence, pas le
  // contenu éditorial principal — elle clôt la page après tout le reste
  // (encadré, inflexions, séries historiques, autre regard), quel que soit le
  // sous-ensemble de sections optionnelles présent pour ce KPI.
  const corps = note ? `
<p class="standfirst">${esc(ind.resume)}</p>
${bandeauEditorial(note)}
${graphiqueKpi(ind)}
${sectionExplication(note)}
${sectionInflexions(note)}
${sectionSeriesHistoriques(note)}
${sectionAutreRegard(note)}
<h2>Fiabilité &amp; sources</h2>
<p><b>Fiabilité :</b> ${note.fiabilite}</p>
<p>${note.note}</p>
<ul>${note.sources.map(s => `<li><a href="${s[1]}" target="_blank" rel="noopener">${esc(s[0])} ↗</a></li>`).join("")}</ul>` : `
<p class="standfirst">${esc(ind.resume)}</p>
<div class="avert"><b>Page à venir</b> — le contenu détaillé de cet indicateur (série complète, fiabilité, sources) n'est pas encore rédigé ici. En attendant, le fact-checking de cet indicateur est déjà disponible sur <a href="/sources">/sources</a>. Retour à <a href="/analyse">l'index des indicateurs</a>.</div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(ind.lab)} · Analyse · Socle commun</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>

${nav("analyse")}

<header class="hero">
  <div class="eyebrow"><a href="/analyse">← Analyse</a></div>
  <h1>${esc(ind.lab)} <span class="annees">(${esc(ind.unit)})</span></h1>
</header>

<main id="annexe">
${corps}
</main>

<footer>
  ${piedSources()}
</footer>

${note ? '<script src="/runtime.js"></script>' : ""}
</body>
</html>
`;
}

// Icônes et manifest, injectés dans le <head> de chaque page (favoris, écran d'accueil mobile).
// Polices du design system (issue #18), sauf sur les pages qui chargent déjà les leurs (essais 1 à 6).
const POLICES = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&family=Inter:wght@400;600&display=swap">
<meta name="theme-color" content="#0B0D12">
`;
const ICONES = `<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`;

// Empreinte de contenu dans l'URL des CSS/JS (?v=…) : sans en-tête Cache-Control
// côté serveur, les navigateurs gardent l'ancien fichier en cache et l'associent
// au nouveau HTML. Chaque modification change l'URL et force le rechargement.
const ACTIFS = ["styles.css", "runtime.js", "effets.js"];
const EMPREINTES = new Map(ACTIFS.map(f => [f, require("crypto").createHash("sha256").update(fs.readFileSync(path.join(SRC, f))).digest("hex").slice(0, 10)]));

function ecrire(fichier, html) {
  // Une balise de glossaire mal formée ([[texte]] sans id, id en majuscules...) ne doit pas finir en ligne.
  // (Les guillemets sont exclus : le JSON embarqué contient des [["…", "…"]] légitimes.)
  const reste = html.match(/\[\[[^\]"<>]*\]\]/);
  if (reste) throw new Error(`Balise de glossaire non convertie dans ${fichier} : ${reste[0]}`);
  if (!html.includes("</head>")) throw new Error(`Pas de </head> dans ${fichier}`);
  html = html.replace("</head>", `${html.includes("fonts.googleapis.com/css2") ? "" : POLICES}${ICONES}\n</head>`);
  for (const [f, v] of EMPREINTES) html = html.replaceAll(`"/${f}"`, `"/${f}?v=${v}"`);
  const dest = path.join(DIST, fichier);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, html);
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  ecrire("index.html", pageAccueil());
  ecrire("frise/index.html", pageFrise());
  ecrire("analyse/index.html", pageAnalyseIndex());
  INDIC.forEach(ind => ecrire(`analyse/${ind.slug}/index.html`, pageAnalyseKpi(ind)));
  ecrire("sources/index.html", pageSources());
  ecrire("glossaire/index.html", pageGlossaire());
  ecrire("programmes/index.html", pageProgrammesIndex());
  CANDIDATS.forEach(c => ecrire(`programmes/${c.id}/index.html`, pageProgramme(c)));
  // Essais du futur design system (issue #18), non liés depuis le site.
  pagesSamples(INDIC_PAR_LAB).forEach(p => ecrire(p.fichier, p.html));
  ecrire("sample7/index.html", pageSample7());
  fs.copyFileSync(path.join(SRC, "styles.css"), path.join(DIST, "styles.css"));
  fs.copyFileSync(path.join(SRC, "runtime.js"), path.join(DIST, "runtime.js"));
  fs.copyFileSync(path.join(SRC, "effets.js"), path.join(DIST, "effets.js"));
  fs.copyFileSync(path.join(SRC, "site.webmanifest"), path.join(DIST, "site.webmanifest"));
  fs.cpSync(path.join(SRC, "icons"), path.join(DIST, "icons"), { recursive: true });
  // Certains navigateurs et outils demandent /favicon.ico d'office, sans lire les <link>.
  fs.copyFileSync(path.join(SRC, "icons", "favicon.ico"), path.join(DIST, "favicon.ico"));
  console.log("Build OK → dist/");
}

build();
