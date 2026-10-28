/*
 * Récapitulatif hebdomadaire des propositions de correction : lit les envois
 * reçus depuis le dernier récapitulatif et en fait UNE issue GitHub, classée
 * par réforme. Les e-mails ne sortent jamais du serveur (l'issue est publique).
 * Rien de neuf : pas d'issue. Purge les envois de plus de 12 mois.
 *
 *   node recap.js            crée l'issue (GITHUB_TOKEN requis)
 *   node recap.js --essai    affiche l'issue sans rien envoyer ni marquer
 */
const fs = require("fs");
const path = require("path");

const DOSSIER = process.env.PROPOSITIONS_DOSSIER || "/srv/antiseche/propositions";
const STOCKAGE = path.join(DOSSIER, "propositions.jsonl");
const ETAT = path.join(DOSSIER, "dernier-recap.json");
const DEPOT = "adrigoodguy/antiseche";
const CONSERVATION_MS = 365 * 86400e3;
const ESSAI = process.argv.includes("--essai");

const periodes = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "periodes.json"), "utf8"));
const TITRES = new Map([["general", "Remarques générales (méthode, sélection, site)"]]);
for (const p of periodes) for (const r of p.reformes) TITRES.set(`${p.id}-${r.id}`, `${r.an} · ${r.t}`);

const lire = () => fs.existsSync(STOCKAGE)
  ? fs.readFileSync(STOCKAGE, "utf8").split("\n").filter(Boolean).map(l => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  : [];

// Texte de visiteur rendu inerte : pas de mention @, pas de fermeture de bloc.
const neutre = s => s.replace(/@/g, "@​").replace(/\r/g, "");
const citation = s => neutre(s).split("\n").map(l => `> ${l}`).join("\n");

function numeroSemaine(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return [t.getUTCFullYear(), Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400e3 + 1) / 7)];
}

async function main() {
  const etat = fs.existsSync(ETAT) ? JSON.parse(fs.readFileSync(ETAT, "utf8")) : { depuis: "1970-01-01T00:00:00.000Z" };
  const toutes = lire();
  const nouvelles = toutes.filter(e => e.recu > etat.depuis);
  const jusqua = toutes.reduce((m, e) => (e.recu > m ? e.recu : m), etat.depuis);

  if (nouvelles.length) {
    const parCible = new Map();
    for (const e of nouvelles) {
      if (!parCible.has(e.cible)) parCible.set(e.cible, []);
      parCible.get(e.cible).push(e);
    }
    const [annee, semaine] = numeroSemaine(new Date());
    const titre = `Propositions de correction · semaine ${semaine} (${annee}) · ${nouvelles.length} envoi${nouvelles.length > 1 ? "s" : ""}`;
    const sections = [...parCible].map(([cible, es]) => {
      const lien = cible === "general" ? "https://antiseche.org/frise#corrections" : `https://antiseche.org/frise#${cible}`;
      return `### [${TITRES.get(cible) || cible}](${lien})\n\n` + es.map(e =>
        `- [ ] Reçu le ${e.recu.slice(0, 10)}${e.email ? " · contact laissé (sur le serveur)" : ""}\n\n${citation(e.message)}${e.source ? `\n>\n> **Source proposée :** ${neutre(e.source)}` : ""}\n`).join("\n");
    });
    const corps = `Envois reçus via le formulaire du site depuis le précédent récapitulatif, classés par réforme. Texte des visiteurs tel quel, non vérifié. Les adresses e-mail restent sur le serveur (\`${STOCKAGE}\`).\n\nCocher une case une fois la proposition traitée (corrigée, transformée en issue dédiée, ou écartée), puis fermer l'issue.\n\n${sections.join("\n")}`;

    if (ESSAI) {
      console.log(`${titre}\n\n${corps}`);
      return;
    }
    const jeton = process.env.GITHUB_TOKEN;
    if (!jeton) throw new Error("GITHUB_TOKEN absent");
    const r = await fetch(`https://api.github.com/repos/${DEPOT}/issues`, {
      method: "POST",
      headers: { Authorization: `Bearer ${jeton}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "antiseche-recap" },
      body: JSON.stringify({ title: titre, body: corps }),
    });
    if (!r.ok) throw new Error(`GitHub a répondu ${r.status} : ${await r.text()}`);
    console.log(`Issue créée : ${(await r.json()).html_url}`);
  } else if (ESSAI) {
    console.log("Aucune nouvelle proposition.");
    return;
  } else {
    console.log("Aucune nouvelle proposition, pas d'issue cette semaine.");
  }

  // Marque le récapitulatif fait, puis purge les envois trop anciens.
  fs.writeFileSync(ETAT, JSON.stringify({ depuis: jusqua }) + "\n");
  const limite = new Date(Date.now() - CONSERVATION_MS).toISOString();
  const gardees = toutes.filter(e => e.recu >= limite);
  if (gardees.length < toutes.length) {
    fs.writeFileSync(STOCKAGE + ".tmp", gardees.map(e => JSON.stringify(e) + "\n").join(""));
    fs.renameSync(STOCKAGE + ".tmp", STOCKAGE);
    console.log(`${toutes.length - gardees.length} envoi(s) de plus de 12 mois purgé(s).`);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
