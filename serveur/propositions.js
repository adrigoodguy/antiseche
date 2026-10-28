/*
 * Réception des propositions de correction (POST /api/proposition).
 * Node sans dépendance, derrière Caddy (127.0.0.1 uniquement). Les envois sont
 * ajoutés à un fichier JSONL privé du serveur ; rien n'est publié directement :
 * recap.js en fait une issue GitHub récapitulative une fois par semaine.
 *
 * Anti-spam invisible pour le visiteur : champ piège, délai minimum entre
 * l'affichage et l'envoi, limite d'envois par IP (en mémoire, l'IP n'est
 * jamais écrite sur disque), limites de taille et de liens, réforme valide.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = +process.env.PORT || 8092;
const STOCKAGE = process.env.PROPOSITIONS_FICHIER || "/srv/antiseche/propositions/propositions.jsonl";
const DATA = path.join(__dirname, "..", "data");

// Cibles acceptées : chaque réforme de la frise (même identifiant que l'ancre
// de sa carte) et « general » pour les remarques de méthode.
function chargerCibles() {
  const periodes = JSON.parse(fs.readFileSync(path.join(DATA, "periodes.json"), "utf8"));
  const cibles = new Map([["general", "Remarque générale (méthode, sélection, site)"]]);
  for (const p of periodes) for (const r of p.reformes) cibles.set(`${p.id}-${r.id}`, `${r.an} · ${r.t}`);
  return cibles;
}
const CIBLES = chargerCibles();

const LIMITES = { message: [10, 2000], source: [0, 500], email: [0, 200] };
const DELAI_MIN_MS = 3000;          // envoi plus rapide : robot
const PAR_IP = { max: 5, fenetreMs: 3600e3 };
const MAX_LIENS = 3;

const envoisParIp = new Map();
function limiteAtteinte(ip) {
  const maintenant = Date.now();
  const recents = (envoisParIp.get(ip) || []).filter(t => maintenant - t < PAR_IP.fenetreMs);
  if (recents.length >= PAR_IP.max) { envoisParIp.set(ip, recents); return true; }
  recents.push(maintenant);
  envoisParIp.set(ip, recents);
  return false;
}
setInterval(() => {
  const maintenant = Date.now();
  for (const [ip, ts] of envoisParIp) if (ts.every(t => maintenant - t >= PAR_IP.fenetreMs)) envoisParIp.delete(ip);
}, 600e3).unref();

function repondre(res, code, corps) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(corps));
}

function valider(d) {
  if (typeof d !== "object" || d === null) return "Requête invalide.";
  for (const [champ, [min, max]] of Object.entries(LIMITES)) {
    const v = d[champ] ?? "";
    if (typeof v !== "string") return "Requête invalide.";
    const n = v.trim().length;
    if (n < min) return champ === "message" ? "Le message est trop court." : "Requête invalide.";
    if (n > max) return `Le champ « ${champ} » est trop long (${max} caractères maximum).`;
  }
  if (!CIBLES.has(d.cible)) return "Réforme inconnue.";
  const liens = ((d.message || "") + " " + (d.source || "")).match(/https?:\/\//g) || [];
  if (liens.length > MAX_LIENS) return `Pas plus de ${MAX_LIENS} liens par proposition.`;
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) return "Adresse e-mail invalide.";
  return null;
}

const serveur = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/api/proposition") return repondre(res, 404, { erreur: "Introuvable." });
  let corps = "";
  req.setEncoding("utf8");
  req.on("data", morceau => {
    corps += morceau;
    if (corps.length > 16384) { repondre(res, 413, { erreur: "Requête trop volumineuse." }); req.destroy(); }
  });
  req.on("end", () => {
    if (res.writableEnded) return;
    let d;
    try { d = JSON.parse(corps); } catch { return repondre(res, 400, { erreur: "Requête invalide." }); }
    // Champ piège rempli ou envoi trop rapide : on répond « ok » sans rien
    // enregistrer, pour ne pas apprendre au robot ce qui l'a trahi.
    if (d.site_web || !(Date.now() - Number(d.ouvert) >= DELAI_MIN_MS)) return repondre(res, 200, { ok: true });
    const erreur = valider(d);
    if (erreur) return repondre(res, 400, { erreur });
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
    if (limiteAtteinte(ip)) return repondre(res, 429, { erreur: "Trop d'envois depuis votre connexion, réessayez dans une heure." });
    const entree = {
      id: crypto.randomUUID(),
      recu: new Date().toISOString(),
      cible: d.cible,
      message: d.message.trim(),
      source: (d.source || "").trim(),
      email: (d.email || "").trim(),
    };
    fs.appendFile(STOCKAGE, JSON.stringify(entree) + "\n", err => {
      if (err) { console.error("Écriture impossible :", err.message); return repondre(res, 500, { erreur: "Erreur du serveur, réessayez plus tard." }); }
      repondre(res, 200, { ok: true });
    });
  });
});

serveur.listen(PORT, "127.0.0.1", () => console.log(`Propositions : écoute sur 127.0.0.1:${PORT}, ${CIBLES.size} cibles, stockage ${STOCKAGE}`));
