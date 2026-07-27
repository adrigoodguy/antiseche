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

const ANNEES_INDIC = JSON.parse(fs.readFileSync(path.join(DATA, "indicateurs.json"), "utf8"));
const PERIODES = JSON.parse(fs.readFileSync(path.join(DATA, "periodes.json"), "utf8"));
const CRITERES = JSON.parse(fs.readFileSync(path.join(DATA, "criteres.json"), "utf8"));
const ECARTEES = JSON.parse(fs.readFileSync(path.join(DATA, "ecartees.json"), "utf8"));

const ANNEES = ANNEES_INDIC.annees;
const INDIC = ANNEES_INDIC.indicateurs;

const Y0 = 1945, Y1 = 2026;
const SW = 118, SH = 34;

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* --- Bandeau sparklines --- */
function sparkSVG(ind, i) {
  const min = Math.min(...ind.d), max = Math.max(...ind.d), pad = (max - min) * 0.1 || 1;
  const x = a => ((a - Y0) / (Y1 - Y0)) * SW, y = v => SH - ((v - (min - pad)) / ((max + pad) - (min - pad))) * SH;
  const pts = ind.d.map((v, k) => `${x(ANNEES[k]).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return `<div class="spark"><div class="lab">${ind.lab} <span class="unit">(${ind.unit})</span></div>
  <svg width="${SW}" height="${SH}" viewBox="0 0 ${SW} ${SH}" aria-hidden="true">
    <line x1="0" y1="${y(0) > 0 && y(0) < SH ? y(0).toFixed(1) : SH}" x2="${SW}" y2="${y(0) > 0 && y(0) < SH ? y(0).toFixed(1) : SH}" stroke="rgba(255,255,255,.15)" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="#9FB0D6" stroke-width="1.6" stroke-linejoin="round"/>
    <line class="curseur" data-i="${i}" x1="0" x2="0" y1="0" y2="${SH}" stroke="#C3372C" stroke-width="1.6"/>
  </svg><div class="val" data-vi="${i}">—</div></div>`;
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
    <div class="giscus-zone"></div>
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
</ul>`;
}

/* --- Page complète --- */
function page() {
  const donneesIndic = JSON.stringify({ annees: ANNEES, indicateurs: INDIC });
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Socle commun · 1944–2026 · Réformes, promesses et résultats</title>
<link rel="stylesheet" href="styles.css">
</head>
<body>

<header class="hero">
  <div class="eyebrow">Document de travail citoyen · version 1 · juillet 2026</div>
  <h1>Socle commun<br><span class="annees">1944 → 2026</span></h1>
  <p class="standfirst">Quatre-vingts ans de réformes françaises, présentées de la même façon&nbsp;: ce qui était promis à l'époque, ce qui en était débattu, ce qu'on peut en dire factuellement avec le recul. Chaque période est replacée dans son contexte international et chiffré — parce qu'un gouvernement hérite d'une conjoncture, il ne la crée pas entièrement. Objectif&nbsp;: une clé de lecture partagée du passé, avant de juger les promesses de demain.</p>
  <p class="standfirst">Contributions et débats bienvenus&nbsp;: dans les commentaires de chaque réforme ci-dessous, ou directement sur <a href="https://github.com/adrigoodguy/antiseche" target="_blank" rel="noopener">GitHub</a>.</p>
  <div class="legende">
    <span class="badge consensus">Consensus</span><span>bilan largement partagé par les évaluations</span>
    <span class="badge debattu">Débattu</span><span>effets encore discutés</span>
    <span class="badge echec">Retrait / échec</span><span>réforme abandonnée ou censurée</span>
  </div>
</header>

<div id="bandeau" aria-label="Indicateurs France 1945–2026, le curseur suit votre lecture">
  <div class="inner" id="bandeau-inner">${INDIC.map(sparkSVG).join("")}</div>
  <div id="annee-curseur">1944</div>
</div>

<main id="contenu">${PERIODES.map(sectionPeriode).join("")}</main>

<section id="annexe-conteneur"><main id="annexe">${annexe()}</main></section>

<footer>
  Sources principales&nbsp;: INSEE (séries longues), Vie-publique.fr, Légifrance, Cour des comptes, France Stratégie, Banque mondiale, archives INA. Les liens de la v1 sont des points d'entrée (notices Vie-publique / Wikipédia) destinés à être remplacés par les sources primaires en v2. Les chiffres du bandeau et des encadrés contexte sont des ordres de grandeur à re-vérifier ligne à ligne avant publication. Document ouvert aux commentaires et aux corrections — c'est le principe.
</footer>

<script>window.__DONNEES_INDIC__=${donneesIndic};</script>
<script src="runtime.js"></script>
</body>
</html>
`;
}

function build() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  fs.writeFileSync(path.join(DIST, "index.html"), page());
  fs.copyFileSync(path.join(SRC, "styles.css"), path.join(DIST, "styles.css"));
  fs.copyFileSync(path.join(SRC, "runtime.js"), path.join(DIST, "runtime.js"));
  console.log("Build OK → dist/");
}

build();
