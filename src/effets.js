/* ================= ESSAI /sample7 : bandeau en « mode effet » =================
   Chargé après runtime.js, dont il réutilise les globales (INDIC, Y0, Y1, SW,
   valeurA, anneeEl). À l'ouverture d'une carte réforme, le curseur se fige sur
   l'année de la réforme et chaque sparkline montre la fenêtre qui suit
   (horizon 5, 10 ou 25 ans) ; la valeur affichée devient « avant → après ».
   Les indicateurs visés par la réforme (data-cibles) passent au premier plan.
   Carte fermée ou sortie de l'écran : retour au curseur de lecture normal. */
(() => {
  if (!anneeEl || !INDIC) return;
  const bandeau = document.getElementById("bandeau");
  const sparks = [...document.querySelectorAll(".spark[data-vi]")];
  const HORIZONS = [5, 10, 25];
  const NS = "http://www.w3.org/2000/svg";
  const x = a => ((Math.min(Y1, Math.max(Y0, a)) - Y0) / (Y1 - Y0)) * SW;

  // Calques ajoutés une fois pour toutes dans chaque sparkline, masqués hors mode effet.
  sparks.forEach(s => {
    const svg = s.querySelector("svg");
    const fen = document.createElementNS(NS, "rect");
    fen.setAttribute("class", "fenetre");
    fen.setAttribute("y", 0); fen.setAttribute("height", SH);
    svg.insertBefore(fen, svg.querySelector("polyline"));
    HORIZONS.forEach(h => {
      const j = document.createElementNS(NS, "line");
      j.setAttribute("class", "jalon"); j.dataset.h = h;
      j.setAttribute("y1", SH - 6); j.setAttribute("y2", SH);
      svg.appendChild(j);
    });
  });

  let actif = null;   // { carte, an, horizon, cibles }
  let visible = true; // la carte active est-elle à l'écran ?

  const fmt = v => (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(1)).replace(".", ",").replace("-", "−");

  function appliquer() {
    const on = actif && visible;
    bandeau.classList.toggle("mode-effet", !!on);
    if (!on) return;
    const { an, horizon, cibles } = actif;
    const fin = an + horizon;
    anneeEl.innerHTML = `${an} <small>→ ${Math.min(fin, Y1 - 1)}</small>`;
    sparks.forEach(s => {
      const i = +s.dataset.vi, ind = INDIC[i], svg = s.querySelector("svg");
      s.classList.toggle("estompe", !!cibles.length && !cibles.includes(ind.lab));
      const fen = svg.querySelector(".fenetre");
      fen.setAttribute("x", x(an)); fen.setAttribute("width", x(fin) - x(an));
      svg.querySelectorAll(".jalon").forEach(j => {
        const a = an + +j.dataset.h;
        j.setAttribute("x1", x(a)); j.setAttribute("x2", x(a));
        j.style.display = a < Y1 ? "" : "none";
      });
      svg.querySelector(".curseur").setAttribute("x1", x(an));
      svg.querySelector(".curseur").setAttribute("x2", x(an));
      // Série pas encore commencée à l'année de la réforme : on part du premier
      // point réel s'il tombe dans la fenêtre. Au-delà de la dernière donnée,
      // on s'arrête au dernier point réel. Les deux cas sont signalés.
      const anneesInd = ind.annees || ANNEES;
      const premiere = anneesInd[0], derniere = anneesInd[anneesInd.length - 1];
      const debut = Math.max(an, premiere);
      const val = s.querySelector(".val");
      if (debut > Math.min(fin, derniere)) { val.textContent = "—"; return; }
      const avant = valeurA(ind, debut), apres = valeurA(ind, Math.min(fin, derniere));
      if (avant.val === null || apres.val === null) { val.textContent = "—"; return; }
      const d = apres.val - avant.val;
      const bornes = [debut > an ? `dès ${debut}` : "", fin > derniere ? `jusqu'à ${derniere}` : ""].filter(Boolean).join(", ");
      val.innerHTML = `${fmt(avant.val)} → ${fmt(apres.val)} <span class="delta">${d > 0 ? "+" : ""}${fmt(d)}</span>${bornes ? ` <span class="borne">(${bornes})</span>` : ""}`;
    });
  }

  // runtime.js réécrit curseur et valeurs à chaque scroll (dans un rAF) :
  // on repasse derrière lui, dans le rAF suivant.
  addEventListener("scroll", () => { if (actif && visible) requestAnimationFrame(() => requestAnimationFrame(appliquer)) }, { passive: true });

  // Amène le premier indicateur visé dans la partie visible du bandeau.
  function montrerCibles() {
    const inner = document.getElementById("bandeau-inner");
    const premier = sparks.find(s => actif.cibles.includes(INDIC[+s.dataset.vi].lab));
    if (!inner || !premier) return;
    const r = premier.getBoundingClientRect(), ri = inner.getBoundingClientRect();
    if (r.left < ri.left || r.right > ri.right - 160) inner.scrollBy({ left: r.left - ri.left - 80, behavior: "smooth" });
  }

  function quitter() {
    actif = null;
    sparks.forEach(s => s.classList.remove("estompe"));
    bandeau.classList.remove("mode-effet");
    dispatchEvent(new Event("scroll")); // runtime.js recalcule le curseur de lecture
  }

  const obs = new IntersectionObserver(entrees => {
    entrees.forEach(e => {
      if (!actif || e.target !== actif.carte) return;
      visible = e.isIntersecting;
      if (visible) appliquer(); else { bandeau.classList.remove("mode-effet"); sparks.forEach(s => s.classList.remove("estompe")); dispatchEvent(new Event("scroll")); }
    });
  }, { rootMargin: "-120px 0px 0px 0px" });

  // Bandeau de réglage injecté en tête de chaque carte ouverte.
  function reglage(carte) {
    let r = carte.querySelector(".effet-ctrl");
    if (r) return r;
    const cibles = carte.dataset.cibles ? carte.dataset.cibles.split("|") : [];
    r = document.createElement("div");
    r.className = "effet-ctrl";
    r.innerHTML = `<span class="effet-titre">Effet dans le bandeau</span>
      <span class="effet-horizons" role="group" aria-label="Horizon">${HORIZONS.map(h => `<button type="button" data-h="${h}">+${h} ans</button>`).join("")}</span>
      <span class="effet-cibles">${cibles.length ? `Indicateurs visés : ${cibles.join(", ")}` : "Indicateurs visés non renseignés : tous affichés"}</span>`;
    r.addEventListener("click", e => {
      const b = e.target.closest("button[data-h]");
      if (!b || !actif || actif.carte !== carte) return;
      actif.horizon = +b.dataset.h;
      marquer(carte);
      appliquer();
    });
    carte.querySelector("summary").after(r);
    return r;
  }
  function marquer(carte) {
    reglage(carte).querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.h === actif.horizon)));
  }

  document.querySelectorAll("details.reforme[data-an]").forEach(carte => {
    carte.addEventListener("toggle", () => {
      if (carte.open) {
        if (actif) obs.unobserve(actif.carte);
        actif = {
          carte,
          an: +carte.dataset.an,
          horizon: +carte.dataset.horizon,
          cibles: carte.dataset.cibles ? carte.dataset.cibles.split("|") : [],
        };
        visible = true;
        marquer(carte);
        obs.observe(carte);
        appliquer();
        montrerCibles();
      } else if (actif && actif.carte === carte) {
        obs.unobserve(carte);
        quitter();
      }
    });
  });
})();
