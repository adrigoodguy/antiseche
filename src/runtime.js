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

/* --- Filtre des indicateurs (décocher masque la carte, tous cochés par défaut) --- */
const filtreToggle = document.getElementById("filtre-toggle");
const filtrePanel = document.getElementById("filtre-panel");
if (filtreToggle && filtrePanel) {
  filtreToggle.addEventListener("click", () => {
    const ouvrir = filtrePanel.hidden;
    filtrePanel.hidden = !ouvrir;
    filtreToggle.setAttribute("aria-expanded", String(ouvrir));
  });
  document.addEventListener("click", e => {
    if (!filtrePanel.hidden && !filtreToggle.contains(e.target) && !filtrePanel.contains(e.target)) {
      filtrePanel.hidden = true;
      filtreToggle.setAttribute("aria-expanded", "false");
    }
  });
  filtrePanel.addEventListener("change", e => {
    if (!e.target.matches("input[type=checkbox]")) return;
    const spark = document.querySelector(`.spark[data-vi="${e.target.dataset.vi}"]`);
    if (!spark) return;
    spark.style.display = e.target.checked ? "" : "none";
    // Masque le segment de la famille entière si plus aucun de ses indicateurs n'est coché.
    const groupe = spark.closest(".groupe-ind");
    if (groupe) {
      const visible = [...groupe.querySelectorAll(".spark")].some(s => s.style.display !== "none");
      groupe.style.display = visible ? "" : "none";
    }
  });
}

/* --- Commentaires (giscus-widget, un widget indépendant par réforme, chargé au premier dépli) ---
   Le script client.js "classique" de Giscus cherche le premier élément .giscus
   dans TOUT le document (pas seulement le sien) : sur une page à plusieurs widgets,
   seul le premier ouvert fonctionne, les suivants recyclent silencieusement son
   conteneur et ne s'affichent jamais. Le web component giscus-widget isole chaque
   instance dans son propre Shadow DOM et n'a pas ce défaut. Thème fixe "light" :
   le site n'a pas de mode sombre, "preferred_color_scheme" pouvait rendre le
   widget en sombre sur un panneau clair (texte quasi invisible). */
let moduleGiscus = null;
function assurerModuleGiscus() {
  if (!moduleGiscus) {
    moduleGiscus = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.type = "module";
      s.src = "https://esm.sh/giscus";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  return moduleGiscus;
}
function chargerGiscus(zone, terme) {
  if (zone.dataset.charge) return;
  zone.dataset.charge = "1";
  const attente = zone.querySelector(".giscus-attente");
  assurerModuleGiscus().then(() => {
    const w = document.createElement("giscus-widget");
    w.setAttribute("repo", "adrigoodguy/antiseche");
    w.setAttribute("repoid", "R_kgDOTk9rOw");
    w.setAttribute("category", "Commentaires");
    w.setAttribute("categoryid", "DIC_kwDOTk9rO84DCE01");
    w.setAttribute("mapping", "specific");
    w.setAttribute("term", terme);
    w.setAttribute("strict", "1");
    w.setAttribute("reactionsenabled", "1");
    w.setAttribute("emitmetadata", "0");
    w.setAttribute("inputposition", "bottom");
    w.setAttribute("theme", "light");
    w.setAttribute("lang", "fr");
    w.setAttribute("loading", "lazy");
    if (attente) attente.replaceWith(w); else zone.appendChild(w);
    // Bug connu du composant (github.com/giscus/giscus/issues/1636) : son
    // message-listener n'ignore pas les messages venant du widget d'un AUTRE
    // instance, donc plusieurs widgets ouverts en même temps peuvent se voir
    // appliquer la hauteur les uns des autres. La zone a une hauteur/scroll
    // fixes (styles.css) pour absorber ça ; on retire aussi l'attribut
    // "scrolling" (fixé par le composant) qui empêcherait le défilement interne.
    w.updateComplete?.then(() => {
      w.shadowRoot?.querySelector("iframe")?.removeAttribute("scrolling");
    });
  }).catch(() => {
    moduleGiscus = null;
    zone.dataset.charge = "";
    if (attente) attente.textContent = "Échec du chargement des commentaires — repliez puis dépliez la carte pour réessayer.";
  });
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
