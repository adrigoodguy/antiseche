/* ================= RENDU DYNAMIQUE (curseur de lecture + commentaires Giscus) ================= */
const { annees: ANNEES, indicateurs: INDIC } = window.__DONNEES_INDIC__;
const Y0 = 1945, Y1 = 2026;
const SW = 118, SH = 34;

/* --- Curseur de lecture (année) --- */
const sections = [...document.querySelectorAll("section.periode")];
const curseurs = [...document.querySelectorAll(".curseur")];
const anneeEl = document.getElementById("annee-curseur");
const vals = [...document.querySelectorAll(".val[data-vi]")];

function valeurA(ind, annee) {
  if (annee <= ANNEES[0]) return ind.d[0];
  if (annee >= ANNEES[ANNEES.length - 1]) return ind.d[ind.d.length - 1];
  for (let k = 0; k < ANNEES.length - 1; k++) {
    if (annee >= ANNEES[k] && annee <= ANNEES[k + 1]) {
      const t = (annee - ANNEES[k]) / (ANNEES[k + 1] - ANNEES[k]);
      return ind.d[k] + t * (ind.d[k + 1] - ind.d[k]);
    }
  }
  return ind.d[ind.d.length - 1];
}

function majCurseur() {
  const mid = window.innerHeight * 0.4;
  let annee = Y0;
  for (const s of sections) {
    const r = s.getBoundingClientRect();
    if (r.top < mid && r.bottom > mid) {
      const prog = Math.min(1, Math.max(0, (mid - r.top) / r.height));
      annee = (+s.dataset.start) + prog * ((+s.dataset.end) - (+s.dataset.start)); break;
    }
    if (r.top >= mid) { break }
    annee = +s.dataset.end;
  }
  const x = ((Math.max(Y0, annee) - Y0) / (Y1 - Y0)) * SW;
  curseurs.forEach(c => { c.setAttribute("x1", x); c.setAttribute("x2", x) });
  anneeEl.textContent = Math.round(annee);
  vals.forEach((v, i) => { const val = valeurA(INDIC[i], annee); v.textContent = (Math.abs(val) >= 10 ? val.toFixed(0) : val.toFixed(1)) + " " + INDIC[i].unit });
}
let tick = false;
addEventListener("scroll", () => { if (!tick) { requestAnimationFrame(() => { majCurseur(); tick = false }); tick = true } }, { passive: true });
addEventListener("resize", majCurseur); majCurseur();

/* --- Commentaires (Giscus, un widget indépendant par réforme, chargé au premier dépli) --- */
function chargerGiscus(zone, terme) {
  if (zone.dataset.charge) return;
  zone.dataset.charge = "1";
  const s = document.createElement("script");
  s.src = "https://giscus.app/client.js";
  s.async = true;
  s.crossOrigin = "anonymous";
  s.setAttribute("data-repo", "adrigoodguy/antiseche");
  s.setAttribute("data-repo-id", "R_kgDOTk9rOw");
  s.setAttribute("data-category", "Commentaires");
  s.setAttribute("data-category-id", "DIC_kwDOTk9rO84DCE01");
  s.setAttribute("data-mapping", "specific");
  s.setAttribute("data-term", terme);
  s.setAttribute("data-strict", "1");
  s.setAttribute("data-reactions-enabled", "1");
  s.setAttribute("data-emit-metadata", "0");
  s.setAttribute("data-input-position", "bottom");
  s.setAttribute("data-theme", "preferred_color_scheme");
  s.setAttribute("data-lang", "fr");
  zone.appendChild(s);
}
document.querySelectorAll(".commentaires").forEach(zone => {
  const terme = zone.dataset.terme;
  const giscusZone = zone.querySelector(".giscus-zone");
  zone.closest("details").addEventListener("toggle", e => {
    if (e.target.open) chargerGiscus(giscusZone, terme);
  });
});

/* --- Ouvrir la carte ciblée par l'URL --- */
if (location.hash) { const el = document.querySelector(location.hash); if (el && el.tagName === "DETAILS") { el.open = true; el.scrollIntoView() } }
