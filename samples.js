/*
 * Pages d'essai du futur design system (issue #18) : /sample1 … /sample6.
 * Cinq directions visuelles autonomes, puis une synthèse (6) des retours (CSS inline, polices Google Fonts),
 * sombres par défaut, pensées pour un public jeune et peu politisé. Texte en
 * lorem ipsum, mais graphiques tracés à partir des vraies séries de
 * data/indicateurs.json pour juger le rendu sur des données réelles.
 * Ces pages ne sont liées nulle part sur le site et sont en noindex.
 */

const LOREM = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante venenatis dapibus, posuere velit aliquet. Cras mattis consectetur purus sit amet fermentum.",
  "Donec ullamcorper nulla non metus auctor fringilla. Vestibulum id ligula porta felis euismod semper. Nullam quis risus eget urna mollis ornare vel eu leo. Maecenas faucibus mollis interdum.",
  "Aenean lacinia bibendum nulla sed consectetur. Curabitur blandit tempus porttitor. Etiam porta sem malesuada magna mollis euismod. Sed posuere consectetur est at lobortis.",
  "Vivamus sagittis lacus vel augue laoreet rutrum faucibus dolor auctor. Praesent commodo cursus magna, vel scelerisque nisl consectetur et. Fusce dapibus, tellus ac cursus commodo.",
];

const NOMS = ["Nuit fluo", "Le classement", "Scrollytelling", "Pop gaufre", "Éditorial", "Synthèse"];

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Format français : virgule décimale, une décimale au plus.
function fr(v, dec = 1) {
  return (Math.round(v * 10 ** dec) / 10 ** dec).toString().replace(".", ",");
}

function serie(INDIC_PAR_LAB, lab) {
  const ind = INDIC_PAR_LAB.get(lab);
  if (!ind) throw new Error(`samples.js : indicateur inconnu ${lab}`);
  const pts = ind.annees.map((a, i) => [a, ind.d[i]]).filter(p => p[1] != null);
  return { lab, unit: ind.unit, pts };
}

// Graduation « ronde » : ~4 à 6 paliers entre lo et hi.
function graduation(lo, hi) {
  const brut = (hi - lo) / 5;
  const p = 10 ** Math.floor(Math.log10(brut));
  const pas = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= brut);
  const debut = Math.floor(lo / pas) * pas, fin = Math.ceil(hi / pas) * pas;
  const ticks = [];
  for (let t = debut; t <= fin + pas / 2; t += pas) ticks.push(Math.round(t * 1000) / 1000);
  return ticks;
}

/*
 * Courbe SVG responsive (viewBox) avec aire en dégradé optionnelle, grille,
 * graduations par décennie et calques de survol. Renvoie le SVG et les points
 * projetés (pour le survol et les surlignages de segments).
 */
function courbe(s, o) {
  const W = o.w || 800, H = o.h || 380, m = { t: 20, r: 20, b: 36, l: 44, ...(o.m || {}) };
  const xs = s.pts.map(p => p[0]), ys = s.pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const ticks = graduation(o.zero ? Math.min(0, ...ys) : Math.min(...ys), Math.max(...ys));
  const y0 = ticks[0], y1 = ticks.at(-1);
  const X = a => m.l + (a - x0) / (x1 - x0) * (W - m.l - m.r);
  const Y = v => H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);
  const proj = s.pts.map(([a, v]) => [Math.round(X(a) * 10) / 10, Math.round(Y(v) * 10) / 10, a, v]);
  const d = proj.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join("");
  const grille = ticks.map(t => `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(t)}" y2="${Y(t)}" class="grid"/><text x="${m.l - 8}" y="${Y(t) + 4}" text-anchor="end" class="ax">${fr(t)}</text>`).join("");
  const decennies = [];
  for (let a = Math.ceil(x0 / 10) * 10; a <= x1; a += 10) decennies.push(`<text x="${X(a)}" y="${H - 10}" text-anchor="middle" class="ax">${a}</text>`);
  const aire = o.aire ? `<defs><linearGradient id="${o.aire}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.couleur}" stop-opacity=".45"/><stop offset="1" stop-color="${o.couleur}" stop-opacity="0"/></linearGradient></defs><path d="${d}L${proj.at(-1)[0]},${H - m.b}L${proj[0][0]},${H - m.b}Z" fill="url(#${o.aire})"/>` : "";
  const survol = o.survol ? `<line class="hv-line" y1="${m.t}" y2="${H - m.b}"/><circle class="hv-dot" r="6"/>` : "";
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.lab)}, ${x0}-${x1}">${grille}${decennies.join("")}${aire}<path d="${d}" fill="none" stroke="${o.couleur}" stroke-width="${o.epaisseur || 3}" stroke-linejoin="round" stroke-linecap="round" class="trace"/>${o.extra ? o.extra(X, Y) : ""}${survol}</svg>`;
  return { svg, proj, X, Y, W, H };
}

// Conteneur de graphique survolable : data-chart = [[x, y, année, valeur formatée]…].
function boiteSurvol(c, unite) {
  const pts = c.proj.map(p => [p[0], p[1], String(p[2]), `${fr(p[3])} ${unite}`]);
  return `<div class="chart" data-chart="${esc(JSON.stringify(pts))}">${c.svg}<div class="tip" hidden></div></div>`;
}

const SCRIPT_SURVOL = `<script>
document.querySelectorAll("[data-chart]").forEach(function (box) {
  var svg = box.querySelector("svg"), pts = JSON.parse(box.dataset.chart);
  var dot = svg.querySelector(".hv-dot"), ln = svg.querySelector(".hv-line"), tip = box.querySelector(".tip");
  var vb = svg.viewBox.baseVal;
  function show(e) {
    var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * vb.width, best = pts[0];
    pts.forEach(function (p) { if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p; });
    dot.setAttribute("cx", best[0]); dot.setAttribute("cy", best[1]);
    ln.setAttribute("x1", best[0]); ln.setAttribute("x2", best[0]);
    svg.classList.add("on"); tip.hidden = false;
    tip.innerHTML = "<b>" + best[3] + "</b>" + best[2];
    tip.style.left = (best[0] / vb.width * 100) + "%"; tip.style.top = (best[1] / vb.height * 100) + "%";
  }
  svg.addEventListener("pointermove", show);
  svg.addEventListener("pointerleave", function () { svg.classList.remove("on"); tip.hidden = true; });
});
</script>`;

// CSS commun : reset, bandeau d'essai, navigation entre échantillons, survol.
const CSS_BASE = `
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--fg);font-family:var(--corps);font-size:clamp(18px,1.1vw + 12px,20px);line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--accent)}
:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.wrap{max-width:1120px;margin:0 auto;padding:0 20px}
.txt{max-width:680px;margin:0 auto;padding:0 20px}
.txt p{margin:0 0 1.2em}
.essai{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;justify-content:space-between;padding:10px 20px;font-size:13px;letter-spacing:.04em;border-bottom:1px solid var(--trait);color:var(--mute)}
.essai nav{display:flex;gap:6px}
.essai nav a{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;border:1px solid var(--trait);color:var(--fg);text-decoration:none;font-weight:600}
.essai nav a[aria-current]{background:var(--accent);color:var(--bg);border-color:var(--accent)}
.chart{position:relative}
.chart svg{display:block;width:100%;height:auto;overflow:visible;touch-action:pan-y}
.grid{stroke:var(--trait);stroke-width:1}
.ax{fill:var(--mute);font-size:13px;font-family:var(--corps)}
.hv-line{stroke:var(--fg);stroke-opacity:.35;stroke-dasharray:3 4;opacity:0}
.hv-dot{fill:var(--bg);stroke:var(--accent);stroke-width:3;opacity:0}
svg.on .hv-line,svg.on .hv-dot{opacity:1}
svg.on .annot{opacity:0}
.tip{position:absolute;transform:translate(-50%,calc(-100% - 16px));background:var(--fg);color:var(--bg);padding:6px 10px;border-radius:8px;font-size:14px;line-height:1.3;white-space:nowrap;pointer-events:none;text-align:center}
.tip b{display:block;font-size:17px}
/* Sur mobile, le viewBox est réduit de moitié : on grossit le texte SVG en unités utilisateur. */
@media (max-width:600px){.chart .ax{font-size:22px}.chart .annot,.chart .lbl{font-size:26px}}
.pied{margin-top:96px;padding:32px 20px 48px;border-top:1px solid var(--trait);color:var(--mute);font-size:15px;text-align:center}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
`;

function page(n, { titre, polices, css, corps, script = "" }) {
  const liens = NOMS.map((nom, i) => `<a href="/sample${i + 1}" title="${esc(nom)}"${i + 1 === n ? ' aria-current="page"' : ""}>${i + 1}</a>`).join("");
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="dark">
<title>${esc(titre)} · Essai ${n}/${NOMS.length} · Antisèche</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${polices}&display=swap">
<style>${CSS_BASE}${css}</style>
</head>
<body>
<div class="essai"><span>Design system · essai ${n}/${NOMS.length} : <b>${esc(NOMS[n - 1])}</b></span><nav aria-label="Échantillons">${liens}</nav></div>
${corps}
<footer class="pied">Page d'essai (issue #18) · texte factice, données réelles · <a href="/">retour au site</a></footer>
${script}
</body>
</html>
`;
}

/* ---------- 1. Nuit fluo : gros chiffre, aire lumineuse, survol ---------- */
function sample1(S) {
  const s = serie(S, "Chômage");
  const der = s.pts.at(-1), pic = s.pts.reduce((a, b) => (b[1] > a[1] ? b : a));
  const c = courbe(s, {
    couleur: "#C6FF3D", aire: "g1", survol: true, zero: true, m: { l: 60 },
    extra: (X, Y) => `<circle cx="${X(pic[0])}" cy="${Y(pic[1])}" r="5" fill="#7A5CFF"/><text x="${X(pic[0])}" y="${Y(pic[1]) - 14}" text-anchor="middle" class="annot">pic ${pic[0]} · ${fr(pic[1])} %</text>`,
  });
  return page(1, {
    titre: "Nuit fluo",
    polices: "family=Space+Grotesk:wght@500;700&family=Inter:wght@400;600",
    css: `:root{--bg:#0B0D12;--fg:#F2F4F8;--mute:#8B93A7;--trait:#232836;--accent:#C6FF3D;--violet:#7A5CFF;--corps:"Inter",system-ui,sans-serif;--display:"Space Grotesk",system-ui,sans-serif}
.hero{padding-block:88px 40px}
.kicker{display:inline-block;font-family:var(--display);font-size:14px;letter-spacing:.14em;text-transform:uppercase;color:var(--bg);background:var(--accent);padding:4px 10px;border-radius:999px}
h1{font-family:var(--display);font-weight:700;font-size:clamp(44px,7vw,92px);line-height:.98;letter-spacing:-.03em;margin:24px 0 20px;max-width:14ch}
h1 em{font-style:normal;color:var(--accent)}
.chapo{font-size:clamp(20px,1.6vw + 12px,26px);color:var(--mute);max-width:36ch}
.big{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px 40px;margin:56px 0 24px}
.big strong{font-family:var(--display);font-size:clamp(80px,14vw,180px);line-height:.85;letter-spacing:-.04em;background:linear-gradient(120deg,var(--accent),#5CFFC8);-webkit-background-clip:text;background-clip:text;color:transparent}
.big span{font-size:18px;color:var(--mute);max-width:24ch;padding-bottom:12px}
.carte{background:#11141C;border:1px solid var(--trait);border-radius:24px;padding:28px 24px 16px;margin-bottom:64px}
.carte h2{font-family:var(--display);font-size:22px;margin-bottom:4px}
.carte .src{font-size:14px;color:var(--mute);margin-bottom:12px}
.annot{fill:var(--fg);font-size:14px;font-family:var(--display);font-weight:700}
.trace{filter:drop-shadow(0 0 8px rgba(198,255,61,.55))}
blockquote{font-family:var(--display);font-size:clamp(26px,2.4vw + 14px,38px);line-height:1.15;letter-spacing:-.02em;border-left:4px solid var(--violet);padding-left:24px;margin:48px 0}`,
    corps: `<header class="wrap hero"><span class="kicker">Le chiffre qui pique</span>
<h1>Lorem ipsum, <em>dolor</em> sit amet ?</h1>
<p class="chapo">${LOREM[0].slice(0, 120)}…</p>
<div class="big"><strong>${fr(der[1])}%</strong><span>des actifs sans emploi en ${der[0]}. Lorem ipsum dolor sit amet, consectetur.</span></div></header>
<section class="wrap"><div class="carte"><h2>${esc(s.lab)}, ${s.pts[0][0]} → ${der[0]}</h2><p class="src">Survolez la courbe · source INSEE</p>${boiteSurvol(c, "%")}</div></section>
<article class="txt"><p>${LOREM[1]}</p><p>${LOREM[2]}</p><blockquote>Curabitur blandit tempus porttitor, etiam porta sem malesuada.</blockquote><p>${LOREM[3]}</p></article>`,
    script: SCRIPT_SURVOL,
  });
}

/* ---------- 2. Le classement : barres horizontales classées ---------- */
function sample2(S) {
  const s = serie(S, "Inflation");
  const dec = new Map();
  for (const [a, v] of s.pts) {
    const k = Math.floor(a / 10) * 10;
    if (!dec.has(k)) dec.set(k, []);
    dec.get(k).push(v);
  }
  const rangs = [...dec].map(([k, vs]) => ({ k, v: vs.reduce((x, y) => x + y, 0) / vs.length, n: vs.length }))
    .sort((a, b) => b.v - a.v);
  const max = rangs[0].v;
  // Dégradé chaud → froid selon le rang.
  const teinte = i => `hsl(${8 + i / (rangs.length - 1) * 172} 92% 62%)`;
  const barres = rangs.map((r, i) => `<li style="--w:${(r.v / max * 100).toFixed(1)}%;--c:${teinte(i)};--i:${i}"><span class="rg">${String(i + 1).padStart(2, "0")}</span><span class="nom">Années ${r.k}${r.n < 10 ? `<small>${r.n} ans</small>` : ""}</span><span class="bar"><i></i><b>${fr(r.v)} %</b></span></li>`).join("");
  return page(2, {
    titre: "Le classement",
    polices: "family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&family=Inter:wght@400;600",
    css: `:root{--bg:#121316;--fg:#F4F1EA;--mute:#9A978F;--trait:#2A2B30;--accent:#FF8A4C;--corps:"Inter",system-ui,sans-serif;--display:"Bricolage Grotesque",system-ui,sans-serif}
.tete{padding-block:72px 32px;display:grid;gap:20px}
.etiq{font-family:var(--display);font-weight:800;font-size:15px;letter-spacing:.12em;text-transform:uppercase;color:var(--accent)}
h1{font-family:var(--display);font-weight:800;font-size:clamp(42px,6.5vw,84px);line-height:.95;letter-spacing:-.025em;max-width:16ch}
.chapo{font-size:clamp(19px,1.2vw + 13px,23px);color:var(--mute);max-width:44ch}
.panneau{background:#1A1B1F;border-radius:28px;padding:32px clamp(16px,3vw,40px);margin:24px 0 64px}
.panneau h2{font-family:var(--display);font-size:26px;font-weight:800;margin-bottom:6px}
.panneau .sous{color:var(--mute);font-size:15px;margin-bottom:28px}
ol{list-style:none;display:grid;gap:14px}
li{display:grid;grid-template-columns:44px minmax(90px,150px) 1fr;align-items:center;gap:12px}
.rg{font-family:var(--display);font-weight:800;font-size:24px;color:var(--c)}
.nom{font-weight:600;font-size:17px;line-height:1.2}
.nom small{display:block;font-weight:400;font-size:13px;color:var(--mute)}
.bar{position:relative;height:40px;display:flex;align-items:center}
.bar i{display:block;height:100%;width:var(--w);background:linear-gradient(90deg,color-mix(in srgb,var(--c) 35%,transparent),var(--c));border-radius:0 10px 10px 0;transform-origin:left;animation:pousse .9s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 70ms)}
.bar b{font-family:var(--display);font-weight:800;font-size:18px;margin-left:10px;white-space:nowrap}
@keyframes pousse{from{transform:scaleX(0)}}
.legende{display:flex;align-items:center;gap:12px;margin-top:28px;font-size:14px;color:var(--mute)}
.legende i{flex:0 0 160px;height:10px;border-radius:5px;background:linear-gradient(90deg,hsl(8 92% 62%),hsl(94 92% 62%),hsl(180 92% 62%))}
.cles{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:56px}
.cles div{border:1px solid var(--trait);border-radius:20px;padding:20px}
.cles strong{display:block;font-family:var(--display);font-size:40px;font-weight:800;color:var(--accent);line-height:1}
.cles span{font-size:15px;color:var(--mute)}
@media (max-width:520px){li{grid-template-columns:34px 1fr}.bar{grid-column:1 / -1}}`,
    corps: `<header class="wrap tete"><span class="etiq">Classé · Inflation</span><h1>Lorem ipsum : quelle décennie a le plus dolor ?</h1><p class="chapo">${LOREM[0]}</p></header>
<section class="wrap"><div class="panneau"><h2>Inflation moyenne par décennie</h2><p class="sous">Hausse annuelle moyenne des prix à la consommation, classée du plus fort au plus faible · source INSEE</p><ol>${barres}</ol><div class="legende"><span>plus chaud</span><i></i><span>plus froid</span></div></div>
<div class="cles"><div><strong>${fr(rangs[0].v)} %</strong><span>Années ${rangs[0].k}, lorem ipsum dolor sit amet</span></div><div><strong>×${fr(rangs[0].v / rangs.at(-1).v, 0)}</strong><span>entre la première et la dernière, consectetur</span></div><div><strong>${s.pts.length} ans</strong><span>de données, adipiscing elit sed do</span></div></div></section>
<article class="txt"><p>${LOREM[1]}</p><p>${LOREM[2]}</p><p>${LOREM[3]}</p></article>`,
  });
}

/* ---------- 3. Scrollytelling : graphique collant, étapes au défilement ---------- */
function sample3(S) {
  const s = serie(S, "Dette publique");
  const etapes = [
    { de: s.pts[0][0], a: 1992, titre: "Lorem ipsum" },
    { de: 1993, a: 2007, titre: "Dolor sit amet" },
    { de: 2008, a: 2019, titre: "Consectetur" },
    { de: 2020, a: s.pts.at(-1)[0], titre: "Adipiscing elit" },
  ];
  const c = courbe(s, { couleur: "#FF5FA2", h: 440, zero: true, epaisseur: 1.5, m: { l: 60, r: 64 } });
  // Un segment épais par étape, révélé par la classe .actif.
  const segs = etapes.map((e, i) => {
    const pp = c.proj.filter(p => p[2] >= e.de - (i ? 1 : 0) && p[2] <= e.a);
    const fin = pp.at(-1);
    return `<g class="seg" data-i="${i}"><path d="${pp.map((p, j) => `${j ? "L" : "M"}${p[0]},${p[1]}`).join("")}" fill="none" stroke="#FF5FA2" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${fin[0]}" cy="${fin[1]}" r="7" fill="#FF5FA2"/><text x="${fin[0] + 12}" y="${fin[1] + 6}" class="lbl">${fr(fin[3], 0)} %</text></g>`;
  }).join("");
  const svg = c.svg.replace("</svg>", `${segs}</svg>`);
  const pas = etapes.map((e, i) => `<div class="step" data-i="${i}"><div class="bulle"><span class="per">${e.de} → ${e.a}</span><h3>${e.titre}</h3><p>${LOREM[i]}</p></div></div>`).join("");
  return page(3, {
    titre: "Scrollytelling",
    polices: "family=Unbounded:wght@500;800&family=DM+Sans:opsz,wght@9..40,400;9..40,600",
    css: `:root{--bg:#0F0B1C;--fg:#F3EEFF;--mute:#A49CC0;--trait:#2A2442;--accent:#FF5FA2;--corps:"DM Sans",system-ui,sans-serif;--display:"Unbounded",system-ui,sans-serif}
.hero{min-height:82vh;display:grid;align-content:center;gap:24px;padding:64px 20px;text-align:center;background:radial-gradient(60% 50% at 50% 40%,rgba(255,95,162,.18),transparent 70%)}
.hero .tag{font-size:14px;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}
h1{font-family:var(--display);font-weight:800;font-size:clamp(38px,6vw,80px);line-height:1.02;letter-spacing:-.02em;max-width:15ch;margin:0 auto}
.hero p{font-size:clamp(19px,1.3vw + 12px,24px);color:var(--mute);max-width:38ch;margin:0 auto}
.fleche{font-size:28px;color:var(--accent);animation:rebond 1.6s infinite}
@keyframes rebond{50%{transform:translateY(8px)}}
.scrolly{position:relative;max-width:1120px;margin:0 auto;padding:0 20px}
.collant{position:sticky;top:0;height:100vh;display:grid;align-content:center}
.collant h2{font-family:var(--display);font-size:18px;font-weight:500;color:var(--mute);margin-bottom:12px}
.collant .trace{stroke-opacity:.25}
.seg{opacity:0;transition:opacity .5s}
.seg.vu{opacity:.35}.seg.actif{opacity:1}
.lbl{fill:var(--fg);font-family:var(--display);font-weight:800;font-size:18px}
.etapes{position:relative;margin-top:-100vh;pointer-events:none}
.step{min-height:100vh;display:flex;align-items:center;justify-content:flex-start}
.bulle{pointer-events:auto;max-width:400px;background:rgba(23,18,42,.92);backdrop-filter:blur(8px);border:1px solid var(--trait);border-radius:22px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.per{font-family:var(--display);font-size:14px;color:var(--accent)}
.bulle h3{font-family:var(--display);font-size:26px;margin:6px 0 10px}
.bulle p{font-size:17px;color:var(--mute)}
.fin{padding-top:48px}
@media (max-width:720px){.step{align-items:flex-end;padding-bottom:12vh}.bulle{max-width:none}}`,
    corps: `<header class="hero"><span class="tag">Dette publique · ${s.pts[0][0]} → ${s.pts.at(-1)[0]}</span><h1>Lorem ipsum dolor, en quatre actes</h1><p>${LOREM[0].slice(0, 110)}…</p><span class="fleche" aria-hidden="true">↓</span></header>
<section class="scrolly"><div class="collant"><h2>Dette des administrations publiques, en % du PIB · source INSEE</h2><div class="chart">${svg}</div></div><div class="etapes">${pas}</div></section>
<article class="txt fin"><p>${LOREM[1]}</p><p>${LOREM[2]}</p></article>`,
    script: `<script>
var segs = document.querySelectorAll(".seg");
var io = new IntersectionObserver(function (es) {
  es.forEach(function (e) {
    if (!e.isIntersecting) return;
    var n = +e.target.dataset.i;
    segs.forEach(function (s, i) { s.classList.toggle("actif", i === n); s.classList.toggle("vu", i < n); });
  });
}, { rootMargin: "-45% 0px -45% 0px" });
document.querySelectorAll(".step").forEach(function (s) { io.observe(s); });
</script>`,
  });
}

/* ---------- 4. Pop gaufre : grille de 100 cases, stickers ---------- */
function sample4(S) {
  const s = serie(S, "Pression fiscale");
  const der = s.pts.at(-1), prem = s.pts[0];
  const n = Math.round(der[1]);
  const cases = Array.from({ length: 100 }, (_, i) => `<i${i < n ? ' class="on"' : ""} style="--d:${i * 12}ms"></i>`).join("");
  const fec = serie(S, "Fécondité").pts.at(-1);
  const ev = serie(S, "Espérance de vie").pts.at(-1);
  return page(4, {
    titre: "Pop gaufre",
    polices: "family=Syne:wght@700;800&family=Manrope:wght@400;600;800",
    css: `:root{--bg:#0D0D0F;--fg:#FAFAF5;--mute:#A3A39B;--trait:#29292E;--accent:#FFE14D;--rose:#FF4FA3;--bleu:#4DD8FF;--corps:"Manrope",system-ui,sans-serif;--display:"Syne",system-ui,sans-serif}
.hero{padding-block:80px 24px;text-align:center}
h1{font-family:var(--display);font-weight:800;font-size:clamp(48px,9vw,128px);line-height:.9;letter-spacing:-.04em;text-transform:uppercase}
h1 span{color:var(--accent)}
.hero p{font-size:clamp(19px,1.3vw + 12px,24px);color:var(--mute);max-width:40ch;margin:24px auto 0}
.gaufre-zone{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:48px;align-items:center;margin-block:72px}
.gaufre{display:grid;grid-template-columns:repeat(10,1fr);grid-template-rows:repeat(10,1fr);gap:6px;aspect-ratio:1;max-width:480px;width:100%;justify-self:center}
.gaufre i{border-radius:6px;background:#1F1F24;animation:pop .4s both;animation-delay:var(--d)}
.gaufre i.on{background:var(--accent);box-shadow:0 0 0 1px rgba(0,0,0,.2) inset}
@keyframes pop{from{transform:scale(0)}}
.lecture strong{display:block;font-family:var(--display);font-weight:800;font-size:clamp(64px,7.5vw,112px);line-height:.9;color:var(--accent)}
.lecture h2{font-family:var(--display);font-size:clamp(26px,2.4vw + 12px,36px);line-height:1.1;margin:12px 0 16px}
.lecture p{color:var(--mute)}
.lecture .leg{display:flex;gap:20px;margin-top:20px;font-size:15px}
.leg span::before{content:"";display:inline-block;width:14px;height:14px;border-radius:4px;margin-right:8px;vertical-align:-2px;background:var(--accent)}
.leg span+span::before{background:#1F1F24;border:1px solid var(--trait)}
.stickers{display:flex;flex-wrap:wrap;justify-content:center;gap:24px;margin-block:24px 72px}
.sticker{width:250px;padding:24px;border-radius:24px;color:#0D0D0F;transform:rotate(var(--r));transition:transform .2s}
.sticker:hover{transform:rotate(0) scale(1.04)}
.sticker strong{display:block;font-family:var(--display);font-weight:800;font-size:56px;line-height:1}
.sticker span{font-weight:800;font-size:16px;line-height:1.3}
@media (max-width:760px){.gaufre-zone{grid-template-columns:1fr}}`,
    corps: `<header class="wrap hero"><h1>Lorem <span>ipsum</span> dolor</h1><p>${LOREM[0].slice(0, 130)}…</p></header>
<section class="wrap gaufre-zone"><div class="gaufre" role="img" aria-label="${n} cases sur 100">${cases}</div>
<div class="lecture"><strong>${n}/100</strong><h2>Sur 100 € de richesse produite en ${der[0]}, lorem ipsum dolor.</h2><p>Prélèvements obligatoires (impôts et cotisations) en % du PIB, contre ${fr(prem[1], 0)} en ${prem[0]}. ${LOREM[2].slice(0, 90)}… · source INSEE</p><div class="leg"><span>prélevé</span><span>le reste</span></div></div></section>
<section class="wrap stickers"><div class="sticker" style="background:var(--rose);--r:-4deg"><strong>${fr(fec[1], 2)}</strong><span>enfants par femme en ${fec[0]}, lorem ipsum</span></div><div class="sticker" style="background:var(--bleu);--r:3deg"><strong>${fr(ev[1], 0)} ans</strong><span>d'espérance de vie à la naissance, dolor sit</span></div><div class="sticker" style="background:var(--accent);--r:-2deg"><strong>×${fr(der[1] / prem[1], 1)}</strong><span>la pression fiscale depuis ${prem[0]}, amet</span></div></section>
<article class="txt"><p>${LOREM[1]}</p><p>${LOREM[3]}</p></article>`,
  });
}

/* ---------- 5. Éditorial : petits multiples, serif expressif ---------- */
function sample5(S) {
  const labs = ["Croissance PIB", "Chômage", "Inflation", "Dette publique", "Espérance de vie", "Climat (CO2/habitant)"];
  const unites = { "Croissance PIB": "%", "Chômage": "%", "Inflation": "%", "Dette publique": "% PIB", "Espérance de vie": "ans", "Climat (CO2/habitant)": "t" };
  const tuiles = labs.map((lab, i) => {
    const s = serie(S, lab);
    const der = s.pts.at(-1);
    const c = courbe(s, { w: 360, h: 180, couleur: "#F5B841", aire: `g5-${i}`, survol: true, epaisseur: 2, m: { t: 12, r: 8, b: 28, l: 36 } });
    return `<figure class="tuile"><figcaption><span>${esc(lab)}</span><strong>${fr(der[1])}<small> ${unites[lab]}</small></strong><em>en ${der[0]}</em></figcaption>${boiteSurvol(c, unites[lab])}</figure>`;
  }).join("");
  return page(5, {
    titre: "Éditorial",
    polices: "family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600",
    css: `:root{--bg:#0F1115;--fg:#EDEAE3;--mute:#8E8C86;--trait:#24272E;--accent:#F5B841;--corps:"Inter",system-ui,sans-serif;--display:"Instrument Serif",Georgia,serif}
.une{padding-block:96px 48px;display:grid;grid-template-columns:1.4fr 1fr;gap:48px;align-items:end;border-bottom:1px solid var(--trait)}
.une .rub{font-size:14px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:20px}
h1{font-family:var(--display);font-weight:400;font-size:clamp(52px,7.5vw,108px);line-height:.92;letter-spacing:-.02em}
h1 em{color:var(--accent)}
.une p{font-size:clamp(19px,1.2vw + 12px,22px);color:var(--mute)}
.une .sign{margin-top:20px;font-size:15px;color:var(--fg)}
.multiples{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:20px;margin-block:56px 80px}
.tuile{background:#151820;border:1px solid var(--trait);border-radius:18px;padding:20px 18px 10px;transition:border-color .2s}
.tuile:hover{border-color:var(--accent)}
.tuile figcaption{display:grid;grid-template-columns:1fr auto;align-items:baseline;gap:2px 12px;margin-bottom:8px}
.tuile figcaption span{font-weight:600;font-size:16px}
.tuile figcaption strong{font-family:var(--display);font-weight:400;font-size:40px;line-height:1;grid-row:span 2;color:var(--accent)}
.tuile figcaption small{font-family:var(--corps);font-size:15px;color:var(--mute)}
.tuile figcaption em{font-style:normal;font-size:14px;color:var(--mute)}
.tuile .ax{font-size:12px}
.txt p:first-child::first-letter{font-family:var(--display);float:left;font-size:5.2em;line-height:.8;padding:6px 10px 0 0;color:var(--accent)}
.inter{font-family:var(--display);font-style:italic;font-size:clamp(30px,3vw + 14px,48px);line-height:1.1;text-align:center;max-width:22ch;margin:56px auto}
@media (max-width:760px){.une{grid-template-columns:1fr;gap:24px}}`,
    corps: `<header class="wrap une"><div><p class="rub">Le tableau de bord</p><h1>Lorem ipsum, <em>quatre-vingts ans</em> dolor sit</h1></div><div><p>${LOREM[0]}</p><p class="sign">Par Lorem Ipsum · 6 min de lecture</p></div></header>
<section class="wrap multiples">${tuiles}</section>
<article class="txt"><p>${LOREM[1]}</p><p>${LOREM[2]}</p></article><p class="inter">« Etiam porta sem malesuada magna mollis euismod. »</p><article class="txt"><p>${LOREM[3]}</p></article>`,
    script: SCRIPT_SURVOL,
  });
}

/*
 * 6. Synthèse des retours sur 1 à 5 : base du classement (2) pour la typo et
 * le graphique, palette fluo de la nuit (1), en-tête sur deux colonnes (5),
 * et tout le texte aligné sur la largeur du graphique (corps en deux colonnes).
 */
function sample6(S) {
  const s = serie(S, "Inflation");
  const dec = new Map();
  for (const [a, v] of s.pts) {
    const k = Math.floor(a / 10) * 10;
    if (!dec.has(k)) dec.set(k, []);
    dec.get(k).push(v);
  }
  const rangs = [...dec].map(([k, vs]) => ({ k, v: vs.reduce((x, y) => x + y, 0) / vs.length, n: vs.length }))
    .sort((a, b) => b.v - a.v);
  const max = rangs[0].v;
  // Dégradé fluo citron → violet selon le rang.
  const teinte = i => `hsl(${78 + i / (rangs.length - 1) * 174} 100% 64%)`;
  const barres = rangs.map((r, i) => `<li style="--w:${(r.v / max * 100).toFixed(1)}%;--c:${teinte(i)};--i:${i}"><span class="rg">${String(i + 1).padStart(2, "0")}</span><span class="nom">Années ${r.k}${r.n < 10 ? `<small>${r.n} ans</small>` : ""}</span><span class="bar"><i></i><b>${fr(r.v)} %</b></span></li>`).join("");
  return page(6, {
    titre: "Synthèse",
    polices: "family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,800&family=Inter:wght@400;600",
    css: `:root{--bg:#0B0D12;--fg:#F2F4F8;--mute:#8B93A7;--trait:#232836;--accent:#C6FF3D;--violet:#7A5CFF;--corps:"Inter",system-ui,sans-serif;--display:"Bricolage Grotesque",system-ui,sans-serif}
.tete{padding-block:80px 40px;display:grid;grid-template-columns:1.3fr 1fr;gap:24px 56px;align-items:end}
.etiq{grid-column:1 / -1;justify-self:start;font-family:var(--display);font-weight:800;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:var(--bg);background:var(--accent);padding:4px 12px;border-radius:999px}
h1{font-family:var(--display);font-weight:800;font-size:clamp(42px,6.5vw,84px);line-height:.95;letter-spacing:-.025em}
h1 em{font-style:normal;color:var(--accent)}
.chapo{font-size:clamp(19px,1.2vw + 13px,23px);color:var(--mute)}
.panneau{background:#11141C;border:1px solid var(--trait);border-radius:28px;padding:32px clamp(16px,3vw,40px);margin:24px 0 40px}
.panneau h2{font-family:var(--display);font-size:26px;font-weight:800;margin-bottom:6px}
.panneau .sous{color:var(--mute);font-size:15px;margin-bottom:28px}
ol{list-style:none;display:grid;gap:14px}
li{display:grid;grid-template-columns:44px minmax(90px,150px) 1fr;align-items:center;gap:12px}
.rg{font-family:var(--display);font-weight:800;font-size:24px;color:var(--c)}
.nom{font-weight:600;font-size:17px;line-height:1.2}
.nom small{display:block;font-weight:400;font-size:13px;color:var(--mute)}
.bar{position:relative;height:40px;display:flex;align-items:center}
.bar i{display:block;height:100%;width:var(--w);background:linear-gradient(90deg,color-mix(in srgb,var(--c) 25%,transparent),var(--c));border-radius:0 10px 10px 0;box-shadow:0 0 18px color-mix(in srgb,var(--c) 35%,transparent);transform-origin:left;animation:pousse .9s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 70ms)}
.bar b{font-family:var(--display);font-weight:800;font-size:18px;margin-left:10px;white-space:nowrap}
@keyframes pousse{from{transform:scaleX(0)}}
.legende{display:flex;align-items:center;gap:12px;margin-top:28px;font-size:14px;color:var(--mute)}
.legende i{flex:0 0 160px;height:10px;border-radius:5px;background:linear-gradient(90deg,hsl(78 100% 64%),hsl(165 100% 64%),hsl(252 100% 64%))}
.cles{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:56px}
.cles div{border:1px solid var(--trait);border-radius:20px;padding:20px}
.cles strong{display:block;font-family:var(--display);font-size:40px;font-weight:800;line-height:1;background:linear-gradient(120deg,var(--accent),#5CFFC8);-webkit-background-clip:text;background-clip:text;color:transparent}
.cles span{font-size:15px;color:var(--mute)}
.corps{columns:2;column-gap:56px;text-align:justify;hyphens:auto}
.corps p{margin:0 0 1.2em}
.corps blockquote{break-inside:avoid;font-family:var(--display);font-weight:800;font-size:clamp(24px,1.6vw + 14px,32px);line-height:1.15;text-align:left;hyphens:manual;border-left:4px solid var(--violet);padding-left:20px;margin:0 0 1.2em}
@media (max-width:760px){.tete{grid-template-columns:1fr}.corps{columns:1}}
@media (max-width:520px){li{grid-template-columns:34px 1fr}.bar{grid-column:1 / -1}}`,
    corps: `<header class="wrap tete"><span class="etiq">Classé · Inflation</span><h1>Lorem ipsum : quelle décennie a le plus <em>dolor</em> ?</h1><p class="chapo">${LOREM[0]}</p></header>
<section class="wrap"><div class="panneau"><h2>Inflation moyenne par décennie</h2><p class="sous">Hausse annuelle moyenne des prix à la consommation, classée du plus fort au plus faible · source INSEE</p><ol>${barres}</ol><div class="legende"><span>plus forte</span><i></i><span>plus faible</span></div></div>
<div class="cles"><div><strong>${fr(rangs[0].v)} %</strong><span>Années ${rangs[0].k}, lorem ipsum dolor sit amet</span></div><div><strong>×${fr(rangs[0].v / rangs.at(-1).v, 0)}</strong><span>entre la première et la dernière, consectetur</span></div><div><strong>${s.pts.length} ans</strong><span>de données, adipiscing elit sed do</span></div></div></section>
<article class="wrap corps"><p>${LOREM[1]} ${LOREM[0]}</p><p>${LOREM[2]}</p><blockquote>Curabitur blandit tempus porttitor, etiam porta sem malesuada.</blockquote><p>${LOREM[3]} ${LOREM[1]}</p><p>${LOREM[2]}</p></article>`,
  });
}

function pagesSamples(INDIC_PAR_LAB) {
  return [sample1, sample2, sample3, sample4, sample5, sample6].map((f, i) => ({ fichier: `sample${i + 1}/index.html`, html: f(INDIC_PAR_LAB) }));
}

module.exports = { pagesSamples };
