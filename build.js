/*
 * Génère le site statique dans dist/ à partir des données JSON (/data)
 * et des sources (/src). JS vanilla, aucune dépendance.
 */
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA = path.join(ROOT, "data");
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

const INDICATEURS = JSON.parse(fs.readFileSync(path.join(DATA, "indicateurs.json"), "utf8"));
const PERIODES = JSON.parse(fs.readFileSync(path.join(DATA, "periodes.json"), "utf8"));
const CRITERES = JSON.parse(fs.readFileSync(path.join(DATA, "criteres.json"), "utf8"));
const ECARTEES = JSON.parse(fs.readFileSync(path.join(DATA, "ecartees.json"), "utf8"));
const SOURCES = JSON.parse(fs.readFileSync(path.join(DATA, "sources.json"), "utf8"));

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
const DONNEES_INDIC_JSON = JSON.stringify({ annees: ANNEES, indicateurs: INDIC });

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Navigation commune (issue #9) : Accueil / Frise / Analyse / Sources.
function nav(actif) {
  const item = (href, label, id) => `<a href="${href}"${id === actif ? ' aria-current="page"' : ""}>${label}</a>`;
  return `<nav class="nav-principale">
    ${item("/", "Accueil", "accueil")}
    ${item("/frise", "Frise", "frise")}
    ${item("/analyse", "Analyse", "analyse")}
    ${item("/sources", "Sources", "sources")}
  </nav>`;
}

function piedSources(extra) {
  return `${extra ? `${extra} ` : ""}<a href="/sources">Sources &amp; fiabilité des indicateurs →</a>`;
}

/* --- Bandeau sparklines --- */
function sparkSVG(ind, i) {
  const anneesInd = ind.annees || ANNEES;
  const min = Math.min(...ind.d), max = Math.max(...ind.d), pad = (max - min) * 0.1 || 1;
  const x = a => ((a - Y0) / (Y1 - Y0)) * SW, y = v => SH - ((v - (min - pad)) / ((max + pad) - (min - pad))) * SH;
  const pts = ind.d.map((v, k) => `${x(anneesInd[k]).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return `<div class="spark" data-vi="${i}"><div class="lab">${ind.lab} <span class="unit">(${ind.unit})</span></div>
  <svg width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}" aria-hidden="true">
    <line x1="0" y1="${y(0) > 0 && y(0) < SH ? y(0).toFixed(1) : SH}" x2="${SW}" y2="${y(0) > 0 && y(0) < SH ? y(0).toFixed(1) : SH}" stroke="rgba(255,255,255,.15)" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="#9FB0D6" stroke-width="1.6" stroke-linejoin="round"/>
    <line class="curseur" data-i="${i}" x1="0" x2="0" y1="0" y2="${SH}" stroke="#C3372C" stroke-width="1.6"/>
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
  // Pas de couleur par groupe ici : les accents du bandeau sont calibrés pour
  // son fond sombre et perdraient leur contraste sur le panneau clair.
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
    <div class="col promesse"><h4>Promesse / objectif d'époque</h4><p>${r.pro}</p></div>
    <div class="col debat"><h4>Débat contemporain</h4><p>${r.deb}</p></div>
    <div class="col bilan"><h4>Bilan factuel, avec le recul</h4><p>${r.bil}</p></div>
  </div>
  <div class="pied"><a class="lien-ancre" href="#${terme}" title="Lien direct vers cette réforme">#lien</a><span class="src">${srcs}</span></div>
  <div class="commentaires" data-terme="${terme}">
    <h5>Commentaires &amp; corrections</h5>
    <div class="note">Espace public propulsé par Giscus (GitHub Discussions) — connectez-vous avec un compte GitHub pour publier. Sources bienvenues.</div>
    <div class="giscus-zone"><p class="giscus-attente">Chargement des commentaires…</p></div>
  </div></details>`;
}

/* --- Sections période --- */
function sectionPeriode(p) {
  return `
<section class="periode" id="${p.id}" data-start="${p.start}" data-end="${p.end}">
  <div class="filigrane" aria-hidden="true">${p.years.replace("–", "·")}</div>
  <div class="quand">${p.years}</div>
  <h2>${esc(p.titre)}</h2>
  <div class="regime">${esc(p.regime)}</div>
  <div class="contexte"><h3>Le monde à ce moment-là</h3><p>${p.ambiance}</p>
  <div class="chiffres">${p.chips.map(c => `<span class="chip">${c[0]} : <b>${c[1]}</b></span>`).join("")}</div>
  <div class="europe"><h4>Repères européens</h4><ul>${p.europe.map(e => `<li>${e}</li>`).join("")}</ul></div></div>
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
<li>Mentions « Consensus / Débattu / Retrait » : appréciation éditoriale ouverte à contestation — c'est précisément la fonction des commentaires.</li>
<li><b>Données sources</b> : détail du fact-checking des indicateurs du bandeau, année par année, avec sources et niveau de fiabilité — <a href="/sources">antiseche.org/sources</a>.</li>
</ul>
<h3>Discussion générale</h3>
<p>Une remarque sur la sélection des réformes, la méthode, ou une autre grille de lecture à appliquer à l'ensemble du document plutôt qu'à une seule réforme ? C'est ici, pas dans les commentaires d'une carte en particulier.</p>
<details class="reforme">
  <summary><span class="fleche">›</span><span class="titre">Ouvrir la discussion générale</span></summary>
  <div class="commentaires" data-terme="discussion-generale">
    <div class="note">Espace public propulsé par Giscus (GitHub Discussions) — connectez-vous avec un compte GitHub pour publier.</div>
    <div class="giscus-zone"><p class="giscus-attente">Chargement des commentaires…</p></div>
  </div>
</details>`;
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
    <span class="badge consensus">Consensus</span><span>bilan largement partagé par les évaluations</span>
    <span class="badge debattu">Débattu</span><span>effets encore discutés</span>
    <span class="badge echec">Retrait / échec</span><span>réforme abandonnée ou censurée</span>
  </div>
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
  Sources principales&nbsp;: INSEE (séries longues), Vie-publique.fr, Légifrance, Cour des comptes, France Stratégie, Banque mondiale, archives INA. Les liens de la v1 sont des points d'entrée (notices Vie-publique / Wikipédia) destinés à être remplacés par les sources primaires en v2. Les chiffres du bandeau et des encadrés contexte sont des ordres de grandeur à re-vérifier ligne à ligne avant publication. Document ouvert aux commentaires et aux corrections — c'est le principe.
  <p class="pied-sources">${piedSources()}</p>
</footer>

<script>window.__DONNEES_INDIC__=${DONNEES_INDIC_JSON};</script>
<script src="/runtime.js"></script>
</body>
</html>
`;
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

  const tablesPartiels = partiels.map(ind => `
<h3>${esc(ind.lab)} (${esc(ind.unit)})</h3>
<div class="table-scroll"><table class="re-table kpi-table">
<thead><tr>${ind.annees.map(a => `<th>${a}</th>`).join("")}</tr></thead>
<tbody><tr>${ind.d.map(v => `<td>${v}</td>`).join("")}</tr></tbody>
</table></div>`).join("");

  // Familles thématiques (issue #2) : même regroupement que le bandeau de la
  // page principale, pour que les deux vues restent cohérentes.
  // Pas de couleur par groupe ici : les accents du bandeau sont calibrés pour
  // son fond sombre et perdraient leur contraste sur cette page claire.
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

<h2>Indicateurs à grille dense, année par année (1950-2025)</h2>
<div class="table-scroll"><table class="re-table kpi-table">
<thead>${thead}</thead>
<tbody>${tbody}</tbody>
</table></div>

<h2>Indicateurs à couverture partielle</h2>
${tablesPartiels}

<h2>Sources &amp; fiabilité, KPI par KPI</h2>
${kpiNotes}
</main>

<footer>
  Document ouvert aux commentaires et aux corrections — voir <a href="/frise#annexe-conteneur">l'annexe de la frise</a> pour la méthode générale du projet.
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

// Graphique en ligne pour un seul indicateur (issue #9 : remplace le
// graphique comparatif par famille qui quitte /sources). Rendu côté serveur
// en SVG statique, pas de JS client nécessaire : contrairement au comparatif
// par famille, il n'y a ici qu'une seule série donc pas d'interactivité utile
// à justifier la complexité du survol/tooltip de runtime.js.
function graphiqueKpi(ind) {
  const GW = 760, GH = 320, GML = 56, GMR = 24, GMT = 20, GMB = 34;
  const GPW = GW - GML - GMR, GPH = GH - GMT - GMB;
  const anneesInd = ind.annees || ANNEES;
  const min = Math.min(...ind.d), max = Math.max(...ind.d), pad = (max - min) * 0.1 || 1;
  const dMin = min - pad, dMax = max + pad;
  const gx = a => GML + ((a - anneesInd[0]) / (anneesInd[anneesInd.length - 1] - anneesInd[0] || 1)) * GPW;
  const gy = v => GMT + GPH - ((v - dMin) / (dMax - dMin)) * GPH;

  const pts = anneesInd.map((a, k) => `${gx(a).toFixed(1)},${gy(ind.d[k]).toFixed(1)}`).join(" ");
  const anneesAxe = anneesInd.filter((a, k) => k === 0 || k === anneesInd.length - 1 || k % Math.ceil(anneesInd.length / 6) === 0);
  const grille = anneesAxe.map(a => `<line x1="${gx(a).toFixed(1)}" x2="${gx(a).toFixed(1)}" y1="${GMT}" y2="${GMT + GPH}" stroke="var(--trait)" stroke-width="1"/>
    <text x="${gx(a).toFixed(1)}" y="${GMT + GPH + 18}" font-size="10" text-anchor="middle" fill="var(--gris)">${a}</text>`).join("");
  const ticksV = [dMin, (dMin + dMax) / 2, dMax].map(v => `<text x="${GML - 8}" y="${gy(v).toFixed(1)}" font-size="10" text-anchor="end" dominant-baseline="middle" fill="var(--gris)">${Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)}</text>`).join("");
  const points = anneesInd.map((a, k) => `<circle cx="${gx(a).toFixed(1)}" cy="${gy(ind.d[k]).toFixed(1)}" r="3" fill="#2a78d6"><title>${a} : ${ind.d[k]} ${ind.unit}</title></circle>`).join("");

  return `<div class="graphique-carte">
  <svg viewBox="0 0 ${GW} ${GH}" role="img" aria-label="Série ${esc(ind.lab)}, ${anneesInd[0]}-${anneesInd[anneesInd.length - 1]}">
    ${grille}
    <line x1="${GML}" x2="${GML + GPW}" y1="${GMT + GPH}" y2="${GMT + GPH}" stroke="var(--trait)" stroke-width="1"/>
    ${ticksV}
    <text x="${GML - 8}" y="${GMT - 6}" font-size="9" text-anchor="end" fill="var(--gris)">${esc(ind.unit)}</text>
    <polyline points="${pts}" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${points}
  </svg>
</div>`;
}

// Seul /analyse/pib a du contenu réel pour l'instant (issue #9) ; les autres
// KPI ont déjà leur note de fiabilité dans data/sources.json (utilisée par
// /sources), mais tant que leur page /analyse/{slug} n'est pas rédigée, on
// sert un stub « à venir » plutôt que de la dupliquer prématurément.
const SLUGS_AVEC_CONTENU = new Set(["pib"]);

/* --- Pages « Analyse » individuelles : contenu réel pour PIB, page « à venir » pour les autres KPI (issue #9) --- */
function pageAnalyseKpi(ind) {
  const kpiParLab = new Map(SOURCES.kpis.map(k => [k.lab, k]));
  const note = kpiParLab.get(ind.lab);

  const corps = SLUGS_AVEC_CONTENU.has(ind.slug) ? `
<p class="standfirst">${esc(ind.resume)}</p>
${graphiqueKpi(ind)}
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

</body>
</html>
`;
}

function ecrire(fichier, html) {
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
  fs.copyFileSync(path.join(SRC, "styles.css"), path.join(DIST, "styles.css"));
  fs.copyFileSync(path.join(SRC, "runtime.js"), path.join(DIST, "runtime.js"));
  console.log("Build OK → dist/");
}

build();
