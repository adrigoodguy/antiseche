/* ================= RENDU DYNAMIQUE (curseur de lecture + commentaires Giscus) ================= */
// window.__DONNEES_INDIC__ n'est posé que sur /frise (curseur, filtre) : les
// pages /analyse/{slug} incluent ce script uniquement pour le survol de leur
// propre graphique (bloc plus bas, qui lit ses données depuis le DOM).
const { annees: ANNEES, indicateurs: INDIC } = window.__DONNEES_INDIC__ || {};
const Y0 = 1945, Y1 = 2026;
const SW = 118, SH = 34;

/* --- Curseur de lecture (année) --- */
const sections = [...document.querySelectorAll("section.periode")];
const curseurs = [...document.querySelectorAll(".curseur")];
const anneeEl = document.getElementById("annee-curseur");
const vals = [...document.querySelectorAll(".val[data-vi]")];

function valeurA(ind, annee) {
  const anneesInd = ind.annees || ANNEES;
  const partiel = !!ind.annees;
  if (!partiel) {
    // Grille dense (1950-2025) : comportement d'origine, interpolation entre
    // points connus et clamp sur la première/dernière valeur.
    if (annee < anneesInd[0]) return { val: ind.d[0], approx: false };
    if (annee > anneesInd[anneesInd.length - 1]) return { val: ind.d[ind.d.length - 1], approx: false };
    for (let k = 0; k < anneesInd.length - 1; k++) {
      if (annee >= anneesInd[k] && annee <= anneesInd[k + 1]) {
        const t = (annee - anneesInd[k]) / (anneesInd[k + 1] - anneesInd[k]);
        return { val: ind.d[k] + t * (ind.d[k + 1] - ind.d[k]), approx: false };
      }
    }
    return { val: ind.d[ind.d.length - 1], approx: false };
  }
  // Indicateurs à couverture partielle (PISA depuis 2000, DIRD depuis 1981,
  // mesurés par intermittence) : pas de valeur avant leur premier point (rien
  // à afficher), et jamais de valeur interpolée qui n'a pas été mesurée —
  // on reporte la dernière mesure réellement publiée, marquée "≈" dès qu'on
  // n'est pas exactement sur une année mesurée (issue #5).
  if (annee < anneesInd[0]) return { val: null, approx: false };
  let k = 0;
  while (k < anneesInd.length - 1 && anneesInd[k + 1] <= annee) k++;
  return { val: ind.d[k], approx: anneesInd[k] !== annee };
}

// Absent sur sources.html (pas de bandeau ni de sections période) : le reste
// du fichier (filtre, graphique, commentaires) doit rester utilisable là-bas.
if (anneeEl) {
  const majCurseur = () => {
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
      const { val, approx } = valeurA(INDIC[i], annee);
      v.textContent = val === null ? "—" : (approx ? "≈ " : "") + (Math.abs(val) >= 10 ? val.toFixed(0) : val.toFixed(1)) + " " + INDIC[i].unit;
    });
  };
  let tick = false;
  addEventListener("scroll", () => { if (!tick) { requestAnimationFrame(() => { majCurseur(); tick = false }); tick = true } }, { passive: true });
  addEventListener("resize", majCurseur); majCurseur();
}

/* --- Filtre des indicateurs (décocher masque la carte, tous cochés par défaut) --- */
const filtreToggle = document.getElementById("filtre-toggle");
const filtrePanel = document.getElementById("filtre-panel");
if (filtreToggle && filtrePanel) {
  filtreToggle.addEventListener("click", e => {
    e.stopPropagation();
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

/* --- Survol du graphique d'un indicateur (page /analyse/{slug}, issue #10) ---
   Les points portent leurs données en attributs data-* (posés par
   build.js), donc pas besoin du modèle window.__DONNEES_INDIC__ complet
   pour un graphique à une seule série : on lit tout depuis le DOM. */
const graphiqueSvg = document.getElementById("graphique-svg");
const graphiqueSurvol = document.getElementById("graphique-survol");
const graphiqueCrosshair = document.getElementById("graphique-crosshair");
const graphiqueTooltip = document.getElementById("graphique-tooltip");
if (graphiqueSvg && graphiqueSurvol && graphiqueCrosshair && graphiqueTooltip) {
  const unite = graphiqueSvg.dataset.unite;
  const pts = [...graphiqueSvg.querySelectorAll("circle.pt")].map(c => ({
    el: c,
    cx: +c.getAttribute("cx"),
    r: c.dataset.r || "3",
    annee: +c.dataset.annee,
    valeur: +c.dataset.valeur,
  }));
  let actif = null;

  function survoler(pt) {
    if (actif === pt) return;
    if (actif) actif.el.setAttribute("r", actif.r);
    actif = pt;
    pt.el.setAttribute("r", "6");
    graphiqueCrosshair.setAttribute("x1", pt.cx);
    graphiqueCrosshair.setAttribute("x2", pt.cx);
    graphiqueCrosshair.setAttribute("visibility", "visible");
    graphiqueTooltip.hidden = false;
    graphiqueTooltip.textContent = `${pt.annee} : ${pt.valeur} ${unite}`;
  }

  graphiqueSurvol.addEventListener("pointermove", e => {
    const rect = graphiqueSvg.getBoundingClientRect();
    const vb = graphiqueSvg.viewBox.baseVal;
    const xSvg = ((e.clientX - rect.left) / rect.width) * vb.width;
    let plusProche = pts[0];
    for (const pt of pts) if (Math.abs(pt.cx - xSvg) < Math.abs(plusProche.cx - xSvg)) plusProche = pt;
    survoler(plusProche);
    const conteneur = graphiqueSvg.parentElement.getBoundingClientRect();
    graphiqueTooltip.style.left = `${e.clientX - conteneur.left + 12}px`;
    graphiqueTooltip.style.top = `${e.clientY - conteneur.top + 12}px`;
  });
  graphiqueSurvol.addEventListener("pointerleave", () => {
    if (actif) actif.el.setAttribute("r", actif.r);
    actif = null;
    graphiqueCrosshair.setAttribute("visibility", "hidden");
    graphiqueTooltip.hidden = true;
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
