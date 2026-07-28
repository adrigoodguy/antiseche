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

/* --- Graphique comparatif par famille (page /sources, issue #4) ---
   Unités natives, pas d'indice base-100 : la plupart des familles n'ont
   qu'une seule unité (un seul axe) ; quand une famille en mélange deux
   (ex. % et points PISA), un second axe est ajouté plutôt que de tout
   ramener à une échelle abstraite — mélanger plus de deux unités sur les
   deux mêmes axes n'arrive pas avec les données actuelles, géré en repli
   silencieux (partage du second axe) plutôt qu'un crash si ça change. */
const graphiqueSvg = document.getElementById("graphique-svg");
const graphiqueSelect = document.getElementById("graphique-select");
const graphiqueLegende = document.getElementById("graphique-legende");
const graphiqueTooltip = document.getElementById("graphique-tooltip");
if (graphiqueSvg && graphiqueSelect && graphiqueLegende && graphiqueTooltip) {
  const NS = "http://www.w3.org/2000/svg";
  const GW = 880, GH = 380, GML = 56, GMR = 56, GMT = 20, GMB = 34;
  const GPW = GW - GML - GMR, GPH = GH - GMT - GMB;
  const GAN0 = 1945, GAN1 = 2027;
  const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a"];
  const gx = an => GML + ((an - GAN0) / (GAN1 - GAN0)) * GPW;

  function svgEl(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }
  function texteSvg(attrs, texte) {
    const t = svgEl("text", attrs);
    t.textContent = texte;
    return t;
  }

  function dessiner(nomGroupe) {
    const serie = INDIC.filter(i => i.groupe === nomGroupe);
    const unites = [...new Set(serie.map(i => i.unit))];
    const axeDe = unit => Math.min(unites.indexOf(unit), 1);

    const domaines = [0, 1].map(ax => {
      const membres = serie.filter(i => axeDe(i.unit) === ax);
      if (!membres.length) return null;
      const vals = membres.flatMap(i => i.d);
      const min = Math.min(...vals), max = Math.max(...vals), pad = (max - min) * 0.1 || 1;
      return { min: min - pad, max: max + pad, unit: membres[0].unit };
    });
    const gy = (ax, v) => GMT + GPH - ((v - domaines[ax].min) / (domaines[ax].max - domaines[ax].min)) * GPH;

    while (graphiqueSvg.firstChild) graphiqueSvg.firstChild.remove();
    graphiqueLegende.textContent = "";

    // Grille + axe des années (1945-2027, de gauche à droite).
    for (let a = 1950; a <= 2025; a += 15) {
      graphiqueSvg.appendChild(svgEl("line", { x1: gx(a), x2: gx(a), y1: GMT, y2: GMT + GPH, stroke: "var(--trait)", "stroke-width": 1 }));
      graphiqueSvg.appendChild(texteSvg({ x: gx(a), y: GMT + GPH + 18, "font-size": 10, "text-anchor": "middle", fill: "var(--gris)" }, a));
    }
    graphiqueSvg.appendChild(svgEl("line", { x1: GML, x2: GML + GPW, y1: GMT + GPH, y2: GMT + GPH, stroke: "var(--trait)", "stroke-width": 1 }));

    // Ticks + unité par axe présent (gauche = axe 0, droite = axe 1).
    domaines.forEach((d, ax) => {
      if (!d) return;
      const vx = ax === 0 ? GML - 8 : GML + GPW + 8;
      const ancre = ax === 0 ? "end" : "start";
      [d.min, (d.min + d.max) / 2, d.max].forEach(v => {
        graphiqueSvg.appendChild(texteSvg({ x: vx, y: gy(ax, v), "font-size": 10, "text-anchor": ancre, "dominant-baseline": "middle", fill: "var(--gris)" },
          Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)));
      });
      graphiqueSvg.appendChild(texteSvg({ x: vx, y: GMT - 6, "font-size": 9, "text-anchor": ancre, fill: "var(--gris)" }, d.unit));
    });

    // Une ligne par indicateur, uniquement sur ses années réellement mesurées
    // (pas d'extrapolation pour PISA/DIRD, même convention que le bandeau).
    serie.forEach((ind, si) => {
      const couleur = PALETTE[si % PALETTE.length];
      const ax = axeDe(ind.unit);
      const anneesInd = ind.annees || ANNEES;
      const pts = anneesInd.map((a, k) => `${gx(a).toFixed(1)},${gy(ax, ind.d[k]).toFixed(1)}`).join(" ");
      graphiqueSvg.appendChild(svgEl("polyline", { points: pts, fill: "none", stroke: couleur, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      const derK = anneesInd.length - 1;
      graphiqueSvg.appendChild(svgEl("circle", { cx: gx(anneesInd[derK]), cy: gy(ax, ind.d[derK]), r: 4, fill: couleur, stroke: "#fff", "stroke-width": 2 }));

      const item = document.createElement("span");
      item.className = "legende-item";
      const cle = document.createElement("span");
      cle.className = "legende-cle";
      cle.style.background = couleur;
      item.appendChild(cle);
      item.appendChild(document.createTextNode(`${ind.lab} (${ind.unit})`));
      graphiqueLegende.appendChild(item);
    });

    // Survol : ligne verticale + une seule infobulle listant chaque série à
    // l'année la plus proche (jamais besoin de viser une ligne de 2px).
    const anneesUniques = [...new Set(serie.flatMap(i => i.annees || ANNEES))].sort((a, b) => a - b);
    const crosshair = svgEl("line", { x1: 0, x2: 0, y1: GMT, y2: GMT + GPH, stroke: "var(--rouge)", "stroke-width": 1, visibility: "hidden" });
    graphiqueSvg.appendChild(crosshair);
    const zoneSurvol = svgEl("rect", { x: GML, y: GMT, width: GPW, height: GPH, fill: "transparent" });
    graphiqueSvg.appendChild(zoneSurvol);

    zoneSurvol.addEventListener("pointermove", e => {
      const rect = graphiqueSvg.getBoundingClientRect();
      const xSvg = ((e.clientX - rect.left) / rect.width) * GW;
      const anneeSurvolee = GAN0 + ((xSvg - GML) / GPW) * (GAN1 - GAN0);
      let plusProche = anneesUniques[0];
      for (const a of anneesUniques) if (Math.abs(a - anneeSurvolee) < Math.abs(plusProche - anneeSurvolee)) plusProche = a;

      crosshair.setAttribute("x1", gx(plusProche)); crosshair.setAttribute("x2", gx(plusProche));
      crosshair.setAttribute("visibility", "visible");

      graphiqueTooltip.hidden = false;
      graphiqueTooltip.textContent = "";
      const titre = document.createElement("div");
      titre.className = "tooltip-annee";
      titre.textContent = Math.round(plusProche);
      graphiqueTooltip.appendChild(titre);
      serie.forEach((ind, si) => {
        const { val, approx } = valeurA(ind, plusProche);
        const ligne = document.createElement("div");
        ligne.className = "tooltip-ligne";
        const cle = document.createElement("span");
        cle.className = "tooltip-cle";
        cle.style.background = PALETTE[si % PALETTE.length];
        ligne.appendChild(cle);
        ligne.appendChild(document.createTextNode(
          val === null ? `${ind.lab} : —` : `${ind.lab} : ${approx ? "≈ " : ""}${val.toFixed(1)} ${ind.unit}`
        ));
        graphiqueTooltip.appendChild(ligne);
      });
      const conteneur = graphiqueSvg.parentElement.getBoundingClientRect();
      graphiqueTooltip.style.left = `${e.clientX - conteneur.left + 12}px`;
      graphiqueTooltip.style.top = `${e.clientY - conteneur.top + 12}px`;
    });
    zoneSurvol.addEventListener("pointerleave", () => {
      crosshair.setAttribute("visibility", "hidden");
      graphiqueTooltip.hidden = true;
    });
  }

  graphiqueSelect.addEventListener("change", () => dessiner(graphiqueSelect.value));
  dessiner(graphiqueSelect.value);
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
