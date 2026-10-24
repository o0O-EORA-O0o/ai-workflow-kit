import { ANTHROPIC_VERSION, MODELE } from "./traitement";
import type { ConfigDemo, Langue, Vente } from "./types";

export { ANTHROPIC_VERSION };

export interface Ligne {
  nom: string;
  montant: number;
  nombre: number;
  /** Variation en % par rapport à la semaine précédente ; null si absente la semaine précédente. */
  variation: number | null;
}

export interface Kpis {
  ca: number;
  caPrecedent: number;
  variation: number;
  ventes: number;
  ventesPrecedent: number;
  panierMoyen: number;
  offres: Ligne[];
  canaux: Ligne[];
  regions: Ligne[];
  parJour: number[];
}

const pct = (a: number, b: number) => (b === 0 ? null : Math.round(((a - b) / b) * 1000) / 10);

function regrouper(ventes: Vente[], cle: (v: Vente) => string): Ligne[] {
  const parNom = new Map<string, { s: number; n: number; sp: number }>();
  for (const v of ventes) {
    const k = cle(v);
    const x = parNom.get(k) ?? { s: 0, n: 0, sp: 0 };
    if (v.semaine === 0) {
      x.s += v.montant;
      x.n++;
    } else x.sp += v.montant;
    parNom.set(k, x);
  }
  return [...parNom.entries()]
    .map(([nom, x]) => ({ nom, montant: x.s, nombre: x.n, variation: pct(x.s, x.sp) }))
    .sort((a, b) => b.montant - a.montant);
}

/** Indicateurs calculés par le code : le modèle ne fait que rédiger à partir de ces chiffres. */
export function calculerKpis(ventes: Vente[], langue: Langue): Kpis {
  const courant = ventes.filter((v) => v.semaine === 0);
  const precedent = ventes.filter((v) => v.semaine === -1);
  const ca = courant.reduce((s, v) => s + v.montant, 0);
  const caPrecedent = precedent.reduce((s, v) => s + v.montant, 0);
  const parJour = [0, 0, 0, 0, 0];
  for (const v of courant) parJour[v.jour] = (parJour[v.jour] ?? 0) + v.montant;
  return {
    ca,
    caPrecedent,
    variation: pct(ca, caPrecedent) ?? 0,
    ventes: courant.length,
    ventesPrecedent: precedent.length,
    panierMoyen: courant.length ? Math.round(ca / courant.length) : 0,
    offres: regrouper(ventes, (v) => (langue === "fr" ? v.offre : v.offreEn)),
    canaux: regrouper(ventes, (v) => v.canal),
    regions: regrouper(ventes, (v) => v.region),
    parJour,
  };
}

export const euros = (n: number, langue: Langue) =>
  langue === "fr" ? `${n.toLocaleString("fr-FR")} €` : `€${n.toLocaleString("en-GB")}`;

const signe = (n: number | null, langue: Langue) =>
  n === null ? (langue === "fr" ? "nouveau" : "new") : `${n > 0 ? "+" : ""}${n.toLocaleString(langue === "fr" ? "fr-FR" : "en-GB")} %`;

/** Rapport rédigé par gabarit (mode démo sans IA). */
export function rapportHorsLigne(k: Kpis, langue: Langue, entreprise: string): string {
  const [o1, o2] = k.offres;
  const hausse = [...k.offres].filter((o) => o.variation !== null).sort((a, b) => (b.variation ?? 0) - (a.variation ?? 0))[0];
  const canal = k.canaux[0];
  const baisse = [...k.canaux].filter((c) => (c.variation ?? 0) < 0).sort((a, b) => (a.variation ?? 0) - (b.variation ?? 0))[0];
  if (langue === "en") {
    return [
      `Weekly report — ${entreprise}`,
      "",
      `Revenue reached ${euros(k.ca, "en")} excl. VAT over ${k.ventes} sales (${signe(k.variation, "en")} vs last week), with an average order of ${euros(k.panierMoyen, "en")}.`,
      `${o1?.nom} leads with ${euros(o1?.montant ?? 0, "en")}, ahead of ${o2?.nom}. ${hausse ? `${hausse.nom} shows the strongest growth (${signe(hausse.variation, "en")}).` : ""}`,
      `${canal?.nom} remains the first channel (${euros(canal?.montant ?? 0, "en")}).${baisse ? ` ${baisse.nom} is down (${signe(baisse.variation, "en")}): worth checking with the team.` : ""}`,
      "",
      "Suggested action: follow up this week's quotes for the best-selling offer and review the declining channel.",
    ].join("\n");
  }
  return [
    `Rapport hebdomadaire — ${entreprise}`,
    "",
    `Le chiffre d'affaires atteint ${euros(k.ca, "fr")} HT sur ${k.ventes} ventes (${signe(k.variation, "fr")} par rapport à la semaine précédente), pour un panier moyen de ${euros(k.panierMoyen, "fr")}.`,
    `${o1?.nom} arrive en tête avec ${euros(o1?.montant ?? 0, "fr")}, devant ${o2?.nom}. ${hausse ? `${hausse.nom} progresse le plus (${signe(hausse.variation, "fr")}).` : ""}`,
    `${canal?.nom} reste le premier canal (${euros(canal?.montant ?? 0, "fr")}).${baisse ? ` ${baisse.nom} recule (${signe(baisse.variation, "fr")}) : à examiner avec l'équipe.` : ""}`,
    "",
    "Action proposée : relancer cette semaine les devis de l'offre la plus vendue et analyser le canal en recul.",
  ].join("\n");
}

export function requeteRapport(k: Kpis, langue: Langue, config: Pick<ConfigDemo, "entreprise">): Record<string, unknown> {
  const nom = config.entreprise.nom[langue];
  return {
    model: MODELE,
    max_tokens: 2000,
    system: `Tu rédiges le rapport commercial hebdomadaire de ${nom} (${config.entreprise.secteur[langue]}) pour la direction. Écris en ${langue === "fr" ? "français" : "anglais"}, 120 à 180 mots : une ligne de titre, trois courts paragraphes (chiffre d'affaires et tendance ; offres et canaux qui bougent ; une action concrète pour la semaine). Utilise uniquement les chiffres fournis, sans en calculer de nouveaux ; montants hors taxes. Pas de liste à puces.`,
    messages: [{ role: "user", content: `Indicateurs de la semaine (JSON) :\n${JSON.stringify(k)}` }],
    output_config: { effort: "low" },
  };
}

export function lireReponseRapport(json: unknown): string | null {
  const r = (json ?? {}) as { content?: Array<{ type: string; text?: string }>; stop_reason?: string; error?: unknown };
  if (r.error || !Array.isArray(r.content) || r.stop_reason === "refusal") return null;
  const texte = r.content.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  return texte || null;
}
