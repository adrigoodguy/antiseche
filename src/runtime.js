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
  const anneesInd = ind.annees || ANNEES;
  // Indicateurs à couverture partielle (PISA depuis 2000, DIRD depuis 1981...) :
  // pas de valeur avant leur premier point ni après leur dernier — pas
  // d'extrapolation inventée. Les indicateurs à grille dense (1950-2025)
  // gardent le comportement d'origine (clamp sur la première/dernière valeur).
  const partiel = !!ind.annees;
  if (annee < anneesInd[0]) return partiel ? null : ind.d[0];
  if (annee > anneesInd[anneesInd.length - 1]) return partiel ? null : ind.d[ind.d.length - 1];
  for (let k = 0; k < anneesInd.length - 1; k++) {
    if (annee >= anneesInd[k] && annee <= anneesInd[k + 1]) {
      const t = (annee - anneesInd[k]) / (anneesInd[k + 1] - anneesInd[k]);
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
  vals.forEach((v, i) => {
    const val = valeurA(INDIC[i], annee);
    v.textContent = val === null ? "—" : (Math.abs(val) >= 10 ? val.toFixed(0) : val.toFixed(1)) + " " + INDIC[i].unit;
  });
}
let tick = false;
addEventListener("scroll", () => { if (!tick) { requestAnimationFrame(() => { majCurseur(); tick = false }); tick = true } }, { passive: true });
addEventListener("resize", majCurseur); majCurseur();

/* --- Commentaires (Giscus, un widget indépendant par réforme, chargé au premier dépli) --- */
// Thème fixe "light" : le site n'a pas de mode sombre, "preferred_color_scheme"
// pouvait rendre le widget en sombre sur un panneau clair (texte quasi invisible).
function chargerGiscus(zone, terme) {
  if (zone.dataset.charge) return;
  zone.dataset.charge = "1";
  const attente = zone.querySelector(".giscus-attente");
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
  s.setAttribute("data-theme", "light");
  s.setAttribute("data-lang", "fr");
  // Un blocage réseau (bloqueur de pub, proxy) laisse sinon le panneau
  // bloqué en "chargement" pour toujours : on autorise un nouvel essai
  // au prochain dépli plutôt que de rester silencieusement planté.
  s.onerror = () => {
    zone.dataset.charge = "";
    if (attente) attente.textContent = "Échec du chargement des commentaires — repliez puis dépliez la carte pour réessayer.";
  };
  zone.appendChild(s);
}
document.querySelectorAll(".commentaires").forEach(zone => {
  const terme = zone.dataset.terme;
  const giscusZone = zone.querySelector(".giscus-zone");
  zone.closest("details").addEventListener("toggle", e => {
    if (e.target.open) chargerGiscus(giscusZone, terme);
  });
});
// Le widget giscus prévient par postMessage une fois son iframe rendue :
// on retire alors le texte "Chargement…" de la zone concernée.
addEventListener("message", e => {
  if (e.origin !== "https://giscus.app" || !e.data?.giscus) return;
  document.querySelectorAll(".giscus-zone iframe").forEach(f => {
    if (f.contentWindow === e.source) f.closest(".giscus-zone").querySelector(".giscus-attente")?.remove();
  });
});

/* --- Ouvrir la carte ciblée par l'URL --- */
if (location.hash) { const el = document.querySelector(location.hash); if (el && el.tagName === "DETAILS") { el.open = true; el.scrollIntoView() } }
