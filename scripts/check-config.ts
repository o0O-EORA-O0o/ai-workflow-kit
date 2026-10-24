/** Vérifie config/demo.json (utilisé avant une démo personnalisée et par la construction). */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigDemo } from "../src/types";

const config = JSON.parse(readFileSync(join(import.meta.dirname, "../config/demo.json"), "utf8")) as ConfigDemo;
const e: string[] = [];
const LANGUES = ["fr", "en"] as const;
if (!config.entreprise?.nom?.fr || !config.entreprise?.nom?.en) e.push("entreprise.nom.fr et .en requis");
if (!/^#[0-9a-f]{6}$/i.test(config.couleur ?? "")) e.push("couleur : format #rrggbb attendu");
if (!LANGUES.includes(config.langueParDefaut)) e.push("langueParDefaut : fr ou en");
const ids = new Set<string>();
for (const m of config.emails ?? []) {
  if (ids.has(m.id)) e.push(`e-mail ${m.id} en double`);
  ids.add(m.id);
  for (const l of LANGUES) {
    if (!m[l]?.sujet || !m[l]?.corps || !m[l]?.de) e.push(`e-mail ${m.id} : de, sujet et corps requis en ${l}`);
    if (!m.resultat?.champs?.[l] || !m.resultat?.action?.[l] || m.resultat?.brouillon?.[l] === undefined) e.push(`e-mail ${m.id} : résultat incomplet en ${l}`);
  }
  if (!["lead", "facture", "support", "spam", "autre"].includes(m.resultat?.categorie)) e.push(`e-mail ${m.id} : catégorie inconnue`);
  if (!["urgente", "haute", "normale", "basse"].includes(m.resultat?.priorite)) e.push(`e-mail ${m.id} : priorité inconnue`);
}
if (!config.emails?.length) e.push("au moins un e-mail attendu");
for (const [i, v] of (config.ventes ?? []).entries()) {
  if (v.semaine !== 0 && v.semaine !== -1) e.push(`vente ${i} : semaine 0 ou -1`);
  if (!(v.jour >= 0 && v.jour <= 4)) e.push(`vente ${i} : jour 0 (lundi) à 4 (vendredi)`);
  if (!(v.montant > 0)) e.push(`vente ${i} : montant positif attendu`);
}
if (!config.ventes?.some((v) => v.semaine === 0) || !config.ventes?.some((v) => v.semaine === -1)) e.push("ventes : deux semaines attendues (0 et -1)");
if (config.personnalisee) {
  const texte = JSON.stringify(config);
  if (/https?:\/\//i.test(texte)) e.push("démo personnalisée : aucun lien attendu");
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(texte)) e.push("démo personnalisée : aucune adresse e-mail attendue (données 100 % fictives)");
}
if (e.length) {
  console.error(`Configuration invalide :\n- ${e.join("\n- ")}`);
  process.exit(1);
}
console.log(`Configuration valide (${config.emails.length} e-mails, ${config.ventes.length} ventes).`);
