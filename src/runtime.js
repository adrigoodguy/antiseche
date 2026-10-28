/* ================= RENDU DYNAMIQUE (curseur de lecture, filtre, survols, glossaire) ================= */
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
// du fichier (filtre, graphique, glossaire) doit rester utilisable là-bas.
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

/* --- Proposer une correction : fenêtre unique, ouverte par les boutons .proposer,
   envoi en JSON vers /api/proposition (serveur/propositions.js). « ouvert »
   date l'ouverture du formulaire : le serveur ignore les envois trop rapides. --- */
const dialogue = document.getElementById("proposition");
if (dialogue) {
  const form = dialogue.querySelector("form");
  const statut = dialogue.querySelector(".proposition-statut");
  const envoyer = form.querySelector('button[type="submit"]');
  let cible = null, ouvert = 0;
  const fermer = () => dialogue.close();

  document.addEventListener("click", e => {
    const b = e.target.closest(".proposer");
    if (!b) return;
    cible = b.dataset.cible;
    ouvert = Date.now();
    dialogue.querySelector("#proposition-titre").textContent = b.dataset.titre;
    statut.textContent = ""; statut.className = "proposition-statut";
    form.hidden = false; envoyer.disabled = false; envoyer.hidden = false;
    dialogue.showModal();
    form.elements.message.focus();
  });
  dialogue.querySelector(".proposition-annuler").addEventListener("click", fermer);
  // Clic sur le fond (hors de la fenêtre) : fermeture.
  dialogue.addEventListener("click", e => { if (e.target === dialogue) fermer() });

  form.addEventListener("submit", async e => {
    e.preventDefault();
    envoyer.disabled = true;
    statut.textContent = "Envoi…"; statut.className = "proposition-statut";
    const f = form.elements;
    try {
      const r = await fetch("/api/proposition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cible, ouvert, message: f.message.value, source: f.source.value, email: f.email.value, site_web: f.site_web.value }),
      });
      const rep = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(rep.erreur || "Envoi impossible pour le moment, réessayez plus tard.");
      statut.textContent = "Merci, c'est envoyé. Les propositions sont relues chaque semaine.";
      statut.className = "proposition-statut ok";
      form.reset();
      envoyer.hidden = true;
      setTimeout(fermer, 2500);
    } catch (err) {
      statut.textContent = err.message === "Failed to fetch" ? "Connexion impossible, réessayez plus tard." : err.message;
      statut.className = "proposition-statut erreur";
      envoyer.disabled = false;
    }
  });
}

/* --- Ouvrir la carte ciblée par l'URL --- */
if (location.hash) { const el = document.querySelector(location.hash); if (el && el.tagName === "DETAILS") { el.open = true; el.scrollIntoView() } }

/* --- Glossaire (issue #15) : bulle de définition sur les termes soulignés --- */
// Sans JS, le lien mène à /glossaire#terme ; avec, on reste sur la frise.
const GLOSSAIRE = window.__GLOSSAIRE__ || {};
let bulle = null, bulleSource = null;
function fermerBulle(rendreFocus) {
  if (!bulle) return;
  bulle.remove(); bulle = null;
  if (rendreFocus) bulleSource?.focus();
  bulleSource?.setAttribute("aria-expanded", "false");
  bulleSource = null;
}
function ouvrirBulle(lien) {
  const g = GLOSSAIRE[lien.dataset.glo];
  if (!g) return false;
  fermerBulle(false);
  bulle = document.createElement("div");
  bulle.className = "glo-bulle";
  bulle.id = "glo-bulle";
  bulle.setAttribute("role", "dialog");
  bulle.setAttribute("aria-label", g.terme);
  const titre = document.createElement("b"); titre.textContent = g.terme;
  const def = document.createElement("p"); def.textContent = g.def;
  const liens = document.createElement("p"); liens.className = "glo-liens";
  g.src.forEach(([label, url]) => {
    const a = document.createElement("a"); a.href = url; a.target = "_blank"; a.rel = "noopener"; a.textContent = label + " ↗";
    liens.append(a, " ");
  });
  const tout = document.createElement("a"); tout.href = "/glossaire#" + lien.dataset.glo; tout.textContent = "Tout le glossaire →";
  liens.append(tout);
  bulle.append(titre, def, liens);
  document.body.append(bulle);
  // sous le terme, recadrée dans la largeur de l'écran
  const r = lien.getBoundingClientRect(), w = bulle.offsetWidth;
  bulle.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + window.scrollX + "px";
  bulle.style.top = r.bottom + window.scrollY + 6 + "px";
  bulleSource = lien;
  lien.setAttribute("aria-expanded", "true");
  lien.setAttribute("aria-controls", "glo-bulle");
  return true;
}
document.addEventListener("click", e => {
  const lien = e.target.closest("a.glo[data-glo]");
  if (lien) {
    if (bulleSource === lien) { e.preventDefault(); fermerBulle(false); return; }
    if (ouvrirBulle(lien)) e.preventDefault();
    return;
  }
  if (bulle && !bulle.contains(e.target)) fermerBulle(false);
});
document.addEventListener("keydown", e => { if (e.key === "Escape") fermerBulle(true); });
window.addEventListener("resize", () => fermerBulle(false));
